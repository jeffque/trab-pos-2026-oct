import express from "express";

import init from "./env/index.js"
import blobRouter from "./routes/blob.js";
import contentRouter from "./routes/content.js";

init();

const app = express();

app.use(express.json())
app.use(express.raw({ type: 'application/octet-stream', limit: '10mb' }));

app.use("/blob", blobRouter)
app.use("/content", contentRouter)

const PORT = process.env.PORT ?? 3001
app.listen(PORT, () => {
    console.log(`subiu na porta ${PORT}`)
})
