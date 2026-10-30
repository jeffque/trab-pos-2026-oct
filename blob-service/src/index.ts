import express from "express";

import init from "./env/index.js"
import { correlation, log } from "./log/index.js";
import { healthRouter } from "./health/index.js";
import * as db from "./db/index.js";
import blobRouter from "./routes/blob.js";
import contentRouter from "./routes/content.js";

init();

const app = express();

app.use(healthRouter({
    database: { critical: true, run: () => db.query("SELECT 1") }
}))
app.use(correlation)
app.use(express.json())
app.use(express.raw({ type: 'application/octet-stream', limit: '10mb' }));

app.use("/blob", blobRouter)
app.use("/content", contentRouter)

// erros não tratados viram log JSON (com correlation id) em vez de stack solta no stderr
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    log().error({ err, method: req.method, path: req.originalUrl }, "erro não tratado")
    if (!res.headersSent) {
        res.sendStatus(500)
    }
})

const PORT = process.env.PORT ?? 3001
app.listen(PORT, () => {
    log().info({ port: PORT }, "servidor no ar")
})
