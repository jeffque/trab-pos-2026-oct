import express from "express";
import { Liquid } from "liquidjs";

const liquidEngine = new Liquid();

import init from "./env/index.js"

init();

const app = express();

app.use(express.json())
app.use(express.static("public"))

app.engine("liquid", liquidEngine.express());
app.set('views', './views');
app.set('view engine', 'liquid');

app.get("/source/:id", async (req, res) => {
    const sourceData = {
        uuid: "123",
        version: 13,
        filename: "hello.c",
        content: "#include<stdio.h>\nint main() {\n  printf(\"hello, world\\n\");\n}"
    };
    const fromHtmx = req.header("HX-Request") == "true"
    const templateSource = "source" + (fromHtmx? "-partial": "")
    res.render(templateSource, sourceData)
})

const PORT = process.env.PORT ?? 3000
app.listen(PORT, () => {
    console.log(`subiu na porta ${PORT}`)
})