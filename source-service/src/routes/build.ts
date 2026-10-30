import express from "express";
import * as db from "../db/index.js";
import client from "../client/blob.js";
import { publish, KINDS } from "../queue/index.js";
import type { BuildKind } from "../queue/index.js";
import { log, correlationId } from "../log/index.js";

const router = express.Router();

export default router;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// colunas expostas: o blob_id fica de fora, quem consome o build não conhece o blob
const COLUMNS = "id, source_id, version, kind, status, size, log, correlation_id, created_at, finished_at"

// pede uma compilação/assembly: grava como pendente, publica na fila e responde 202 sem esperar o worker
router.post("/source/:id/versions/:version/builds", async (req, res) => {
    const kind = req.body.kind as BuildKind
    const version = Number(req.params.version)
    if (!KINDS.includes(kind) || !Number.isInteger(version) || !UUID.test(req.params.id)) {
        return res.sendStatus(400)
    }

    const rs = await db.query("SELECT name, versions FROM source WHERE id = $1", [ req.params.id ])
    if (rs.rowCount == 0) {
        return res.sendStatus(404)
    }
    const versions: { version: number }[] = rs.rows[0]["versions"]
    if (!versions.some(v => v.version == version)) {
        return res.sendStatus(404)
    }

    const inserted = await db.query(
        `INSERT INTO build (id, source_id, version, kind, status, correlation_id) VALUES (gen_random_uuid(), $1, $2, $3, 'pendente', $4) RETURNING ${COLUMNS}`,
        [ req.params.id, version, kind, correlationId() ?? null ])
    const build = inserted.rows[0]

    try {
        await publish({ build_id: build.id, source_id: req.params.id, name: rs.rows[0]["name"], version, kind })
    } catch (err) {
        log().error({ build_id: build.id, err }, "falha ao publicar build")
        await db.query("UPDATE build SET status = 'erro', log = $2, finished_at = now() WHERE id = $1",
            [ build.id, "Fila de builds indisponível (RabbitMQ). Tente de novo em instantes." ])
        return res.sendStatus(503)
    }

    res.status(202).setHeader("Location", `/builds/${build.id}`).send(build)
})

router.get("/source/:id/builds", async (req, res) => {
    if (!UUID.test(req.params.id)) {
        return res.sendStatus(400)
    }
    const version = req.query["version"]
    const rs = version
        ? await db.query(`SELECT ${COLUMNS} FROM build WHERE source_id = $1 AND version = $2 ORDER BY created_at DESC`, [ req.params.id, Number(version) ])
        : await db.query(`SELECT ${COLUMNS} FROM build WHERE source_id = $1 ORDER BY created_at DESC`, [ req.params.id ])
    res.send(rs.rows)
})

router.get("/builds/:id", async (req, res) => {
    if (!UUID.test(req.params.id)) {
        return res.sendStatus(400)
    }
    const rs = await db.query(`SELECT ${COLUMNS} FROM build WHERE id = $1`, [ req.params.id ])
    if (rs.rowCount == 0) {
        return res.sendStatus(404)
    }
    res.send(rs.rows[0])
})

// resultado devolvido pelo build-worker
router.put("/builds/:id", async (req, res) => {
    const { status, blob_id, size, log: buildLog } = req.body
    if (![ "ok", "erro" ].includes(status) || !UUID.test(req.params.id)) {
        return res.sendStatus(400)
    }
    const rs = await db.query(
        `UPDATE build SET status = $2, blob_id = $3, size = $4, log = $5, finished_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
        [ req.params.id, status, blob_id ?? null, size ?? null, buildLog ?? "" ])
    if (rs.rowCount == 0) {
        return res.sendStatus(404)
    }
    log().info({ build_id: req.params.id, status, size }, "resultado do build registrado")
    res.send(rs.rows[0])
})

// saída do build (binário ou assembly), buscada no blob-service
router.get("/builds/:id/content", async (req, res) => {
    if (!UUID.test(req.params.id)) {
        return res.sendStatus(400)
    }
    const rs = await db.query("SELECT blob_id FROM build WHERE id = $1 AND status = 'ok'", [ req.params.id ])
    const blobId: string | null = rs.rows[0]?.["blob_id"] ?? null
    if (!blobId) {
        return res.sendStatus(404)
    }
    const content = await client.fetch(blobId)
    if (!content) {
        return res.sendStatus(502)
    }
    res.set("Content-Type", "application/octet-stream").send(Buffer.from(content))
})
