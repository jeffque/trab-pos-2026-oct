import express from "express";

import init from "./env/index.js"
import { correlation, log } from "./log/index.js";
import { healthRouter, httpPing } from "./health/index.js";
import * as db from "./db/index.js";
import { ping as rabbitPing } from "./queue/index.js";
import sourceRouter from "./routes/source.js";
import versionRouter from "./routes/content-version.js";
import buildRouter from "./routes/build.js";

init();

const app = express();

// banco é crítico; blob e rabbit fora do ar degradam (leitura de metadados continua funcionando)
app.use(healthRouter({
    database: { critical: true, run: () => db.query("SELECT 1") },
    "blob-service": { critical: false, run: () => httpPing(`${process.env.BLOB_MODULE ?? "http://localhost:3001/"}health/live`) },
    rabbitmq: { critical: false, run: () => rabbitPing() }
}))
app.use(correlation)
app.use(express.json())
app.use("/source", sourceRouter)
app.use("/content", versionRouter)
app.use(buildRouter)

// erros não tratados viram log JSON (com correlation id) em vez de stack solta no stderr
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    log().error({ err, method: req.method, path: req.originalUrl }, "erro não tratado")
    if (!res.headersSent) {
        res.sendStatus(500)
    }
})

const PORT = process.env.PORT ?? 3002
app.listen(PORT, () => {
    log().info({ port: PORT }, "servidor no ar")
})
