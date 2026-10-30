import express from "express";
import * as db from "../db/index.js";
import { log, correlationId } from "../log/index.js";
import { publish, QUEUES } from "../queue/index.js";
import { getSource, blobContent } from "../client/index.js";

const router = express.Router();

export default router;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NAME = /^[\w][\w .-]{0,99}$/
const COLUMNS = "id, name, status, object_blob_id, object_size, log, correlation_id, created_at, queued_at, compiled_at"

async function find(id: string) {
    if (!UUID.test(id)) {
        return null
    }
    const rs = await db.query(`SELECT ${COLUMNS} FROM workspace WHERE id = $1`, [ id ])
    if (rs.rowCount == 0) {
        return null
    }
    const files = await db.query("SELECT source_id, name, version FROM workspace_file WHERE workspace_id = $1 ORDER BY name", [ id ])
    return { ...rs.rows[0], files: files.rows }
}

// alterar os arquivos invalida o objeto compilado: o workspace volta a ser rascunho
async function resetToDraft(id: string) {
    await db.query(`UPDATE workspace SET status = 'rascunho', object_blob_id = NULL, object_size = NULL, log = NULL, compiled_at = NULL WHERE id = $1`, [ id ])
}

router.get("/workspaces", async (req, res) => {
    // ?source_id=: workspaces que usam um arquivo, com a revisão fixada nele
    const sourceId = String(req.query["source_id"] ?? "")
    if (sourceId) {
        if (!UUID.test(sourceId)) {
            return res.sendStatus(400)
        }
        const rs = await db.query(
            `SELECT w.id, w.name, w.status, f.version AS file_version
               FROM workspace w JOIN workspace_file f ON f.workspace_id = w.id
              WHERE f.source_id = $1 ORDER BY w.name`, [ sourceId ])
        return res.send(rs.rows)
    }
    const rs = await db.query(
        `SELECT w.id, w.name, w.status, w.object_size, w.compiled_at, count(f.source_id)::int AS files
           FROM workspace w LEFT JOIN workspace_file f ON f.workspace_id = w.id
          GROUP BY w.id ORDER BY w.name`)
    res.send(rs.rows)
})

router.post("/workspaces", async (req, res) => {
    const name = String(req.body.name ?? "").trim()
    if (!NAME.test(name)) {
        return res.status(400).send("Nome inválido: use letras, números, espaço, ponto, hífen ou sublinhado (até 100).")
    }
    const exists = await db.query("SELECT 1 FROM workspace WHERE name = $1", [ name ])
    if ((exists.rowCount ?? 0) > 0) {
        return res.status(409).send(`Já existe um workspace chamado ${name}.`)
    }
    const rs = await db.query(`INSERT INTO workspace (id, name) VALUES (gen_random_uuid(), $1) RETURNING ${COLUMNS}`, [ name ])
    log().info({ workspace_id: rs.rows[0].id, name }, "workspace criado")
    res.status(201).setHeader("Location", `/workspaces/${rs.rows[0].id}`).send({ ...rs.rows[0], files: [] })
})

router.get("/workspaces/:id", async (req, res) => {
    const ws = await find(req.params.id)
    if (!ws) {
        return res.sendStatus(404)
    }
    res.send(ws)
})

// inclui (ou troca a revisão de) um arquivo .c/.h do source-service
router.post("/workspaces/:id/files", async (req, res) => {
    const ws = await find(req.params.id)
    if (!ws) {
        return res.sendStatus(404)
    }
    if (ws.status == "na_fila") {
        return res.status(409).send("O workspace está na fila de compilação; espere terminar para alterar os arquivos.")
    }
    const sourceId = String(req.body.source_id ?? "")
    const source = UUID.test(sourceId) ? await getSource(sourceId) : null
    if (!source) {
        return res.status(400).send("Arquivo não encontrado no registro de fontes.")
    }
    if (!/\.(c|h)$/i.test(source.name)) {
        return res.status(400).send(`Só arquivos .c e .h entram num workspace (${source.name} não é).`)
    }
    const latest = Math.max(...source.versions.map(v => v.version))
    const version = req.body.version === undefined || req.body.version === "" ? latest : Number(req.body.version)
    if (!source.versions.some(v => v.version == version)) {
        return res.status(400).send(`${source.name} não tem a REV ${version}.`)
    }
    await db.query(
        `INSERT INTO workspace_file (workspace_id, source_id, name, version) VALUES ($1, $2, $3, $4)
         ON CONFLICT (workspace_id, source_id) DO UPDATE SET version = EXCLUDED.version`,
        [ ws.id, source.id, source.name, version ])
    await resetToDraft(ws.id)
    log().info({ workspace_id: ws.id, name: source.name, version }, "arquivo incluído no workspace")
    res.send(await find(ws.id))
})

router.delete("/workspaces/:id/files/:sourceId", async (req, res) => {
    const ws = await find(req.params.id)
    if (!ws) {
        return res.sendStatus(404)
    }
    if (ws.status == "na_fila") {
        return res.status(409).send("O workspace está na fila de compilação; espere terminar para alterar os arquivos.")
    }
    await db.query("DELETE FROM workspace_file WHERE workspace_id = $1 AND source_id = $2", [ ws.id, req.params.sourceId ])
    await resetToDraft(ws.id)
    log().info({ workspace_id: ws.id, source_id: req.params.sourceId }, "arquivo removido do workspace")
    res.send(await find(ws.id))
})

// workspace pronto: vai para a fila "compila"; o resultado volta pelo evento "compilacao.resultado"
router.post("/workspaces/:id/compilar", async (req, res) => {
    const ws = await find(req.params.id)
    if (!ws) {
        return res.sendStatus(404)
    }
    if (ws.status == "na_fila") {
        return res.status(409).send("Este workspace já está na fila de compilação.")
    }
    if (!ws.files.some((f: { name: string }) => /\.c$/i.test(f.name))) {
        return res.status(400).send("O workspace precisa de ao menos um arquivo .c para compilar.")
    }
    await db.query(
        `UPDATE workspace SET status = 'na_fila', queued_at = now(), correlation_id = $2,
                object_blob_id = NULL, object_size = NULL, log = NULL, compiled_at = NULL WHERE id = $1`,
        [ ws.id, correlationId() ?? null ])
    try {
        await publish(QUEUES.compila, {
            workspace_id: ws.id,
            name: ws.name,
            files: ws.files.map((f: { name: string, version: number }) => ({ name: f.name, version: f.version }))
        })
    } catch (err) {
        log().error({ workspace_id: ws.id, err }, "falha ao publicar compilação")
        await db.query(`UPDATE workspace SET status = 'erro', log = $2, compiled_at = now() WHERE id = $1`,
            [ ws.id, "Fila de compilação indisponível (RabbitMQ). Tente de novo em instantes." ])
        return res.sendStatus(503)
    }
    res.status(202).send(await find(ws.id))
})

// arquivo objeto (.o) gerado, buscado no blob-service
router.get("/workspaces/:id/objeto", async (req, res) => {
    const ws = await find(req.params.id)
    if (!ws || ws.status != "compilado" || !ws.object_blob_id) {
        return res.sendStatus(404)
    }
    const content = await blobContent(ws.object_blob_id)
    if (!content) {
        return res.sendStatus(502)
    }
    res.set("Content-Type", "application/octet-stream").send(Buffer.from(content))
})

// evento "compilei", publicado pelo compila-worker: vincula o workspace ao blob gerado
export async function onCompiled(event: { workspace_id: string, status: "ok" | "erro", blob_id?: string, size?: number, log?: string }) {
    const status = event.status == "ok" ? "compilado" : "erro"
    const rs = await db.query(
        `UPDATE workspace SET status = $2, object_blob_id = $3, object_size = $4, log = $5, compiled_at = now()
          WHERE id = $1 AND status = 'na_fila'`,
        [ event.workspace_id, status, event.blob_id ?? null, event.size ?? null, event.log ?? "" ])
    if (rs.rowCount == 0) {
        log().warn({ workspace_id: event.workspace_id }, "evento de compilação ignorado: workspace não estava na fila")
        return
    }
    log().info({ workspace_id: event.workspace_id, status, size: event.size }, "workspace vinculado ao objeto compilado")
}
