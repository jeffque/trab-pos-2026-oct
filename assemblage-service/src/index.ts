import express from "express";

import init from "./env/index.js"
import { correlation, log } from "./log/index.js";
import { healthRouter, httpPing } from "./health/index.js";
import * as db from "./db/index.js";
import { ping as rabbitPing, consume, QUEUES } from "./queue/index.js";
import { urls } from "./client/index.js";
import assemblageRouter, { onAssembled } from "./routes/assemblage.js";

init();

const app = express();

// banco é crítico; fila, workspaces e blob fora do ar degradam (dá para listar assemblagens)
app.use(healthRouter({
    database: { critical: true, run: () => db.query("SELECT 1") },
    rabbitmq: { critical: false, run: () => rabbitPing() },
    "workspace-service": { critical: false, run: () => httpPing(`${urls.WORKSPACE_URL}health/live`) },
    "blob-service": { critical: false, run: () => httpPing(`${urls.BLOB_URL}health/live`) }
}))
app.use(correlation)
app.use(express.json())
app.use(assemblageRouter)

// erros não tratados viram log JSON (com correlation id) em vez de stack solta no stderr
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    log().error({ err, method: req.method, path: req.originalUrl }, "erro não tratado")
    if (!res.headersSent) {
        res.sendStatus(500)
    }
})

consume(QUEUES.assemblado, onAssembled)

const PORT = process.env.PORT ?? 3005
app.listen(PORT, () => {
    log().info({ port: PORT }, "servidor no ar")
})
