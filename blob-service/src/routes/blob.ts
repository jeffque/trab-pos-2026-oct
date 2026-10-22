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

router.get("/:id", async (req, res) => {
    const rows = await db.query("SELECT * FROM storage WHERE id = $1", [ req.params.id ])
    if (rows.rowCount == 0) {
        res.sendStatus(404);
    } else {
        res.send(rows.rows[0])
    }
})
