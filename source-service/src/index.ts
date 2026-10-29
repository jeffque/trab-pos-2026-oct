import express from "express";

import init from "./env/index.js"
import sourceRouter from "./routes/source.js";
import versionRouter from "./routes/content-version.js";

init();

const app = express();

app.use(express.json())
app.use("/source", sourceRouter)
app.use("/content", versionRouter)

const PORT = process.env.PORT ?? 3002
app.listen(PORT, () => {
    console.log(`subiu na porta ${PORT}`)
})
