import express from "express";
import * as db from "../db/index.js";

import client from "../client/blob.js";
import { log } from "../log/index.js";

const router = express.Router();

const RESULTS_PER_PAGE = 50;

export default router;

router.get("/", async (req, res) => {
    const pageNum = (() => {
        if (req.query["page"]) {
            return Number(req.query["page"])
        }
        return 0
    })()
    const rows = await db.query("SELECT * FROM source LIMIT $1 OFFSET $2", [ RESULTS_PER_PAGE, pageNum*RESULTS_PER_PAGE ])
    res.send(rows.rows)
})

router.post("/", async (req, res) => {
    if (typeof req.body.content !== "string" || !req.body.filename) {
        return res.sendStatus(400);
    }
    const name: string = req.body.filename

    if (await checkIfFileExists(name)) {
        return res.status(400).send(`Filename já existe ${name}`)
    }

    const content: string = req.body.content

    const encoder = new TextEncoder();
    const blob_id = await client.send(encoder.encode(content).buffer)
    if (!blob_id) {
        return res.sendStatus(502)
    }

    const rs = await db.query("INSERT INTO source (id, name, versions) VALUES (gen_random_uuid(), $1, $2::jsonb) RETURNING id", [ name, JSON.stringify([{ version: 1, blob_id }]) ])
    if (rs.rowCount == 0) {
        return res.sendStatus(500)
    }
    const id: string = rs.rows[0]["id"]
    const version = 1
    log().info({ source_id: id, name, version, blob_id }, "arquivo criado")
    res.status(201).setHeader("Content-type", "application/json")
        .setHeader("Location", `${req.baseUrl}/${id}`)
        .send({
            id, version
        })
})

router.post("/:id/versions", async (req, res) => {
    if (typeof req.body.content !== "string") {
        return res.sendStatus(400);
    }
    if (!await checkIfIdExists(req.params.id)) {
        return res.sendStatus(404);
    }

    const encoder = new TextEncoder();
    const blob_id = await client.send(encoder.encode(req.body.content).buffer)
    if (!blob_id) {
        return res.sendStatus(502)
    }

    // número da versão calculado dentro do UPDATE: a trava de linha do postgres
    // impede que dois saves simultâneos gerem o mesmo número
    const rs = await db.query(
        `UPDATE source
            SET versions = versions || jsonb_build_array(jsonb_build_object('version', jsonb_array_length(versions) + 1, 'blob_id', $2::text))
          WHERE id = $1
      RETURNING jsonb_array_length(versions) AS version`,
        [ req.params.id, blob_id ])
    const version: number = rs.rows[0]["version"]
    log().info({ source_id: req.params.id, version, blob_id }, "revisão criada")
    res.status(201).setHeader("Content-type", "application/json")
        .setHeader("Location", `${req.baseUrl}/${req.params.id}`)
        .send({
            id: req.params.id, version
        })
})

router.get("/:id", async (req, res) => {
    const rs = await db.query("SELECT * FROM source WHERE id = $1", [ req.params.id ])
    if (rs.rowCount == 0) {
        res.sendStatus(404);
    } else {
        res.send(rs.rows[0])
    }
})


async function checkIfIdExists(id: string): Promise<boolean> {
    const rs = await db.query("SELECT EXISTS (SELECT 1 FROM source WHERE id = $1) as e", [ id ])
    return rs.rows[0]["e"];
}

async function checkIfFileExists(filename: string): Promise<boolean> {
    const rs = await db.query("SELECT EXISTS (SELECT 1 FROM source WHERE name = $1) as e", [ filename ])

    return rs.rows[0]["e"];
}