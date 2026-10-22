import express from "express";

import init from "./env/index.js"
import blobRouter from "./routes/blob.js";

init();

const app = express();

app.use(express.json())
app.use("/blob", blobRouter)

app.listen(3000, () => {
    console.log("subiu na porta 3000")
})
