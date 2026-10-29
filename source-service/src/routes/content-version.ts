import express from "express";
import * as db from "../db/index.js";

const router = express.Router();

export default router;

router.get("/:version/:name", async (req, res) => {
    const rs = await db.query("SELECT blob_id FROM source WHERE name = $1 AND version = $2", [ req.params.name, req.params.version ])
    if (rs.rowCount == 0) {
        return res.sendStatus(404);
    }
    const blobId = rs.rows[0]["blob_id"]
    res.sendStatus(200)
})
