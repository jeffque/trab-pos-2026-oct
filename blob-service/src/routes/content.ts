import express from "express";
import * as db from "../db/index.js";

const router = express.Router();

export default router;


router.get("/:id", async (req, res) => {
    const rows = await db.query("SELECT content FROM storage WHERE id = $1", [ req.params.id ])
    if (rows.rowCount == 0) {
        res.sendStatus(404);
    } else {
        res.set('Content-Type', 'application/octet-stream');
        res.send(rows.rows[0]["content"])
    }
})
