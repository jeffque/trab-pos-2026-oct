import express from "express";

const app = express();

app.use(express.json())

app.get("/hello", (req, res) => res.send("oie"));


app.listen(3000, () => {
    console.log("subiu na porta 3000")
})
