import express from "express";
import { Liquid } from "liquidjs";

import client from "./client/source.js";

const liquidEngine = new Liquid();

import init from "./env/index.js"

init();

const app = express();

app.use(express.json())
app.use(express.urlencoded())
app.use(express.static("public"))

app.engine("liquid", liquidEngine.express());
app.set('views', './views');
app.set('view engine', 'liquid');

app.get("/source/:id", async (req, res) => {
    const sourceData = {
        uuid: "123",
        version: req.params.id,
        filename: "hello.c",
        content: "#include<stdio.h>\nint main() {\n  printf(\"hello, world\\n\");\n}"
    };
    const fromHtmx = req.header("HX-Request") == "true"
    const templateSource = "source" + (fromHtmx? "-partial": "")
    res.render(templateSource, sourceData)
})

app.get("/source-new", async (req, res) => {
    const sourceData = {
        newVersion: true
    };
    const fromHtmx = req.header("HX-Request") == "true"
    const templateSource = "source" + (fromHtmx? "-partial": "")
    res.render(templateSource, sourceData)
})

app.post("/source-new", async (req, res) => {
    const id = await client.create({
        filename: req.body.filename,
        content: req.body.filecontent
    })
    console.log({id})
    if (!id) {
        return res.sendStatus(500)
    }
    // const id = 13
    res.redirect("/source/" + id)
    // res.render(templateSource, sourceData)
})

app.get("/source/", async (req, res) => {
    const fromHtmx = req.header("HX-Request") == "true"
    const templateSource = "source-list" + (fromHtmx? "-partial": "")

    const sourceData = {}
    res.render(templateSource, sourceData)
})

const PORT = process.env.PORT ?? 3000
app.listen(PORT, () => {
    console.log(`subiu na porta ${PORT}`)
})