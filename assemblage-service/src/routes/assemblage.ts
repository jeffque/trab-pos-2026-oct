import express from "express";
import * as db from "../db/index.js";
import { log, correlationId } from "../log/index.js";
import { publish, QUEUES } from "../queue/index.js";
import { getWorkspace, blobContent } from "../client/index.js";

const router = express.Router();

export default router;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NAME = /^[\w][\w .-]{0,99}$/
const COLUMNS = "id, name, status, blob_id, size, log, correlation_id, created_at, finished_at"

async function find(id: string) {
    if (!UUID.test(id)) {
        return null
    }
    const rs = await db.query(`SELECT ${COLUMNS} FROM assemblage WHERE id = $1`, [ id ])
    if (rs.rowCount == 0) {
        return null
    }
    const objects = await db.query("SELECT workspace_id, workspace_name FROM assemblage_object WHERE assemblage_id = $1 ORDER BY workspace_name", [ id ])
    return { ...rs.rows[0], objects: objects.rows }
}

router.get("/assemblages", async (req, res) => {
    const rs = await db.query(
        `SELECT a.id, a.name, a.status, a.size, a.finished_at, count(o.workspace_id)::int AS objects
           FROM assemblage a LEFT JOIN assemblage_object o ON o.assemblage_id = a.id
          GROUP BY a.id ORDER BY a.name`)
    res.send(rs.rows)
})

// junta os objetos de workspaces compilados e pede a linkagem na fila "assembla"
router.post("/assemblages", async (req, res) => {
    const name = String(req.body.name ?? "").trim()
    if (!NAME.test(name)) {
        return res.status(400).send("Nome inválido: use letras, números, espaço, ponto, hífen ou sublinhado (até 100).")
    }
    const ids: string[] = [ ...new Set<string>((Array.isArray(req.body.workspace_ids) ? req.body.workspace_ids : [ req.body.workspace_ids ]).filter(Boolean).map(String)) ]
    if (ids.length == 0 || ids.some(id => !UUID.test(id))) {
        return res.status(400).send("Escolha ao menos um workspace compilado.")
    }
    const exists = await db.query("SELECT 1 FROM assemblage WHERE name = $1", [ name ])
    if ((exists.rowCount ?? 0) > 0) {
        return res.status(409).send(`Já existe uma assemblagem chamada ${name}.`)
    }

    // foto dos objetos no momento do pedido
    const objects = []
    for (const id of ids) {
        const ws = await getWorkspace(id)
        if (!ws) {
            return res.status(400).send("Um dos workspaces escolhidos não existe mais.")
        }
        if (ws.status != "compilado" || !ws.object_blob_id) {
            return res.status(400).send(`O workspace ${ws.name} não está compilado; compile antes de assemblar.`)
        }
        objects.push({ workspace_id: ws.id, workspace_name: ws.name, blob_id: ws.object_blob_id })
    }

    const rs = await db.query(
        `INSERT INTO assemblage (id, name, correlation_id) VALUES (gen_random_uuid(), $1, $2) RETURNING id`,
        [ name, correlationId() ?? null ])
    const id: string = rs.rows[0].id
    for (const o of objects) {
        await db.query("INSERT INTO assemblage_object (assemblage_id, workspace_id, workspace_name, object_blob_id) VALUES ($1, $2, $3, $4)",
            [ id, o.workspace_id, o.workspace_name, o.blob_id ])
    }
    log().info({ assemblage_id: id, name, objects: objects.length }, "assemblagem criada")

    try {
        await publish(QUEUES.assembla, {
            assemblage_id: id,
            name,
            objects: objects.map(o => ({ workspace_name: o.workspace_name, blob_id: o.blob_id }))
        })
    } catch (err) {
        log().error({ assemblage_id: id, err }, "falha ao publicar assemblagem")
        await db.query(`UPDATE assemblage SET status = 'erro', log = $2, finished_at = now() WHERE id = $1`,
            [ id, "Fila de assemblagem indisponível (RabbitMQ). Tente de novo em instantes." ])
        return res.status(503).send(await find(id))
    }
    res.status(202).setHeader("Location", `/assemblages/${id}`).send(await find(id))
})

router.get("/assemblages/:id", async (req, res) => {
    const a = await find(req.params.id)
    if (!a) {
        return res.sendStatus(404)
    }
    res.send(a)
})

// executável gerado; o blob fica registrado aqui, no serviço de assemblagem
router.get("/assemblages/:id/executavel", async (req, res) => {
    const a = await find(req.params.id)
    if (!a || a.status != "pronto" || !a.blob_id) {
        return res.sendStatus(404)
    }
    const content = await blobContent(a.blob_id)
    if (!content) {
        return res.sendStatus(502)
    }
    res.set("Content-Type", "application/octet-stream").send(Buffer.from(content))
})

// evento publicado pelo assembla-worker com o executável linkado
export async function onAssembled(event: { assemblage_id: string, status: "ok" | "erro", blob_id?: string, size?: number, log?: string }) {
    const status = event.status == "ok" ? "pronto" : "erro"
    const rs = await db.query(
        `UPDATE assemblage SET status = $2, blob_id = $3, size = $4, log = $5, finished_at = now()
          WHERE id = $1 AND status = 'na_fila'`,
        [ event.assemblage_id, status, event.blob_id ?? null, event.size ?? null, event.log ?? "" ])
    if (rs.rowCount == 0) {
        log().warn({ assemblage_id: event.assemblage_id }, "evento de assemblagem ignorado: não estava na fila")
        return
    }
    log().info({ assemblage_id: event.assemblage_id, status, size: event.size }, "assemblagem concluída")
}
