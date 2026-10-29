import express from "express";

import init from "./env/index.js"
import blobRouter from "./routes/blob.js";

init();

const app = express();

app.use(express.json())
app.use("/blob", blobRouter)

const PORT = process.env.PORT ?? 3001
app.listen(PORT, () => {
    console.log(`subiu na porta ${PORT}`)
})
