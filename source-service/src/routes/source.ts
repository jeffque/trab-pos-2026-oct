import express from "express";
import * as db from "../db/index.js";

import client from "../client/blob.js";

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
    if (!req.body.content) {
        return res.send(400);
    }
    const name: string = req.body.filename

    if (await checkIfFileExists(name)) {
        return res.status(400).send(`Filename já existe ${name}`)
    }

    const content: string = req.body.content
    console.log({ name, content })
    console.log(content)

    const encoder = new TextEncoder();
    const blob_id = await client.send(encoder.encode(content).buffer)
    console.log( {blob_id} )

    const rs = await db.query("INSERT INTO source (id, name, versions) VALUES (gen_random_uuid(), $1, $2::jsonb) RETURNING id", [ name, JSON.stringify([{ version: 1, blob_id }]) ])
    if (rs.rowCount == 0) {
        return res.sendStatus(500)
    }
    const id: string = rs.rows[0]["id"]
    const version: number = rs.rows[0]["version"]
    res.status(201).setHeader("Content-type", "application/json")
        .setHeader("Location", `${req.baseUrl}/${id}`)
        .send({
            id, version
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


async function checkIfFileExists(filename: string): Promise<boolean> {
    const rs = await db.query("SELECT EXISTS (SELECT 1 FROM source WHERE name = $1) as e", [ filename ])

    console.log(rs.rows)
    return rs.rows[0]["e"];
}