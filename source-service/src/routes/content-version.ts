import express from "express";
import * as db from "../db/index.js";
import client from "../client/blob.js";

const router = express.Router();

export default router;

router.get("/:name/:version", async (req, res) => {
    const rs = await db.query("SELECT versions FROM source WHERE name = $1", [ req.params.name ])
    if (rs.rowCount == 0) {
        return res.sendStatus(404);
    }
    const versions: { version: number, blob_id: string}[] = rs.rows[0]["versions"]

    const selectedVersion = versions.filter(l => l.version.toString() == req.params.version).map(l => l.blob_id)

    if (selectedVersion.length == 0) {
        return res.sendStatus(404);
    }

    const indeedVersion: string = selectedVersion[0]!
    

    const blob = await client.fetch(indeedVersion);
    res.status(200).send(blob)
})
