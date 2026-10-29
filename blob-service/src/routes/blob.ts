import express from "express";
import * as db from "../db/index.js";

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
    const rows = await db.query("SELECT * FROM storage LIMIT $1 OFFSET $2", [ RESULTS_PER_PAGE, pageNum*RESULTS_PER_PAGE ])
    res.send(rows.rows)
})

router.post("/", async (req, res, next) => {
    const body = req.body
    console.log("body", { "content-type": req.get("content-type"), body })
    const rs = await db.query("INSERT INTO storage (id, content) VALUES (gen_random_uuid(), $1::bytea) RETURNING id", [ body ])
    console.log(rs.rowCount)
    if ((rs.rowCount ?? 0) > 0) {
        const id = rs.rows[0]["id"]
        res.setHeader("Location", `${req.baseUrl}/${id}`)
        res.status(201).setHeader("Content-type", "application/json").send({ id })
    } else {
        res.sendStatus(500)
    }
})

router.get("/:id", async (req, res) => {
    const rows = await db.query("SELECT * FROM storage WHERE id = $1", [ req.params.id ])
    if (rows.rowCount == 0) {
        res.sendStatus(404);
    } else {
        res.send(rows.rows[0])
    }
})
