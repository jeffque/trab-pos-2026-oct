import express from "express";
import type { Request, Response, NextFunction } from "express";
import { Liquid } from "liquidjs";

import init from "./env/index.js"
import { correlation, correlationId, log } from "./log/index.js";
import { healthRouter, httpPing } from "./health/index.js";
import sources, { SourceError } from "./client/source.js";
import type { Source, Build, BuildKind } from "./client/source.js";

init();

const liquidEngine = new Liquid({ outputEscape: "escape" });

const app = express();

const SOURCE_URL = process.env.SOURCE_MODULE ?? "http://localhost:3002/"
// endereço do grafana visto pelo navegador (link "logs" de cada build)
const GRAFANA_URL = process.env.GRAFANA_URL ?? "http://localhost:3003"

app.use(healthRouter({
    "source-service": { critical: true, run: () => httpPing(`${SOURCE_URL}health/live`) }
}))
app.use(express.urlencoded({ extended: false, limit: "10mb" }))
app.use(express.static("public"))
app.use("/vendor/htmx", express.static("node_modules/htmx.org/dist"))
app.use("/vendor/fonts", express.static("node_modules/@fontsource/barlow/files"))
app.use("/vendor/fonts", express.static("node_modules/@fontsource/barlow-semi-condensed/files"))
app.use("/vendor/fonts", express.static("node_modules/@fontsource/jetbrains-mono/files"))

// arquivos estáticos ficam antes: não geram log nem correlation id
app.use(correlation)

app.engine("liquid", liquidEngine.express());
app.set('views', './views');
app.set('view engine', 'liquid');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Mode = "empty" | "view" | "new" | "missing" | "failure" | "output"

// painel do grafana filtrado por um correlation id
function logsUrl(id: string): string {
    return `${GRAFANA_URL}/d/logs-fontes/logs?var-cid=${encodeURIComponent(id)}&from=now-1h&to=now`
}

function language(name: string): string {
    const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : ""
    switch (ext) {
        case "c": return "C"
        case "h": return "C header"
        case "s":
        case "asm": return "Assembly"
        default: return ext ? ext.toUpperCase() : "Texto"
    }
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes} B`
    }
    return `${(bytes / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kB`
}

function lineNumbers(content: string): string {
    const count = content.split("\n").length
    return Array.from({ length: count }, (_, i) => i + 1).join("\n")
}

function latest(source: Source): number {
    return Math.max(...source.versions.map(v => v.version))
}

// Lista do registro; se o source-service cair, a tela continua de pé e mostra o erro
async function register(currentId?: string) {
    try {
        const all = await sources.list()
        const files = all
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(s => ({
                id: s.id,
                short: s.id.slice(0, 8).toUpperCase(),
                name: s.name,
                rev: latest(s),
                current: s.id == currentId
            }))
        return { files, registerError: null }
    } catch (err) {
        return { files: [], registerError: err instanceof Error ? err.message : String(err) }
    }
}

async function render(res: Response, mode: Mode, data: Record<string, unknown> = {}, status = 200) {
    const reg = await register(data["currentId"] as string | undefined)
    const id = correlationId()
    res.status(status).render("workspace", { mode, ...reg, correlation: id, correlationLogs: id ? logsUrl(id) : null, ...data })
}

// Requisições HTMX recebem HX-Location (troca só o #app); navegação comum recebe redirect
function goTo(req: Request, res: Response, path: string) {
    if (req.header("HX-Request") == "true") {
        res.setHeader("HX-Location", JSON.stringify({ path, target: "#app", select: "#app", swap: "outerHTML transition:true" }))
        return res.sendStatus(204)
    }
    res.redirect(303, path)
}

app.get("/", async (req, res) => {
    await render(res, "empty")
})

app.get("/novo", async (req, res) => {
    await render(res, "new", { form: { filename: "", content: "" } })
})

app.post("/novo", async (req, res) => {
    const filename = String(req.body.filename ?? "").trim()
    const content = String(req.body.content ?? "")
    const form = { filename, content }

    if (!filename) {
        return render(res, "new", { form, error: "Dê um nome ao arquivo, por exemplo main.c." }, 422)
    }
    if (/[\/\\]/.test(filename)) {
        return render(res, "new", { form, error: "O nome não pode conter barras. Use só o nome do arquivo, como main.c." }, 422)
    }

    try {
        const created = await sources.create(filename, content)
        goTo(req, res, `/source/${created.id}?salvo=1`)
    } catch (err) {
        if (err instanceof SourceError && err.status == 400) {
            return render(res, "new", { form, error: `Já existe um arquivo chamado ${filename}. Escolha outro nome ou abra o existente no registro.` }, 422)
        }
        throw err
    }
})

const KIND_LABEL: Record<BuildKind, string> = { compila: "Compilar", assembla: "Assemblar" }

// última emissão de cada tipo para a revisão aberta
function jobs(builds: Build[], sourceId: string) {
    return (["compila", "assembla"] as BuildKind[])
        .map(kind => builds.find(b => b.kind == kind))
        .filter((b): b is Build => Boolean(b))
        .map(b => ({
            id: b.id,
            kind: b.kind,
            label: KIND_LABEL[b.kind],
            status: b.status,
            detail: b.status == "pendente"
                ? "na fila…"
                : b.status == "erro"
                    ? "falhou"
                    : b.kind == "compila" ? `binário de ${formatBytes(b.size ?? 0)}` : `assembly de ${formatBytes(b.size ?? 0)}`,
            warnings: b.status == "ok" && Boolean(b.log?.trim()),
            url: `/source/${sourceId}/saida/${b.id}`,
            logs: b.correlation_id ? logsUrl(b.correlation_id) : null
        }))
}

// dados comuns da prancha: arquivo, revisões, carimbo e emissões da revisão escolhida
async function sheet(source: Source, selected: number) {
    const newest = latest(source)
    const emitted = jobs(await sources.builds(source.id, selected), source.id)
    return {
        currentId: source.id,
        file: {
            id: source.id,
            short: source.id.slice(0, 8).toUpperCase(),
            name: source.name,
            language: language(source.name)
        },
        revisions: source.versions
            .map(v => ({ version: v.version, selected: v.version == selected, newest: v.version == newest }))
            .sort((a, b) => b.version - a.version),
        selected,
        newest,
        next: newest + 1,
        isOld: selected != newest,
        jobs: emitted,
        pending: emitted.some(j => j.status == "pendente"),
        selfUrl: `/source/${source.id}?rev=${selected}`
    }
}

async function findSource(id: string): Promise<Source | null> {
    return UUID.test(id) ? sources.get(id) : null
}

app.get("/source/:id", async (req, res) => {
    const source = await findSource(req.params.id)
    if (!source) {
        return render(res, "missing", {}, 404)
    }

    const requested = Number(req.query["rev"])
    const selected = source.versions.some(v => v.version == requested) ? requested : latest(source)
    const content = await sources.content(source.name, selected) ?? ""
    const saved = Number(req.query["salvo"])

    await render(res, "view", {
        ...await sheet(source, selected),
        content,
        lines: lineNumbers(content),
        lineCount: content.split("\n").length,
        size: formatBytes(new TextEncoder().encode(content).length),
        notice: saved ? `REV ${saved} registrada.` : null
    })
})

// pede compilação/assembly; a resposta volta na hora e a tela acompanha o status
app.post("/source/:id/emitir", async (req, res) => {
    const id = req.params.id
    const kind = req.body.kind as BuildKind
    const rev = Number(req.body.rev)
    if (!UUID.test(id) || !(kind in KIND_LABEL) || !Number.isInteger(rev)) {
        return render(res, "missing", {}, 404)
    }
    await sources.requestBuild(id, rev, kind)
    goTo(req, res, `/source/${id}?rev=${rev}`)
})

app.get("/source/:id/saida/:buildId", async (req, res) => {
    const source = await findSource(req.params.id)
    const build = source && UUID.test(req.params.buildId) ? await sources.build(req.params.buildId) : null
    if (!source || !build || build.source_id != source.id) {
        return render(res, "missing", {}, 404)
    }

    let output = ""
    if (build.status == "ok" && build.kind == "assembla") {
        const response = await sources.buildOutput(build.id)
        output = response ? await response.text() : ""
    }

    await render(res, "output", {
        ...await sheet(source, build.version),
        build: {
            id: build.id,
            kind: build.kind,
            label: KIND_LABEL[build.kind],
            status: build.status,
            log: build.log?.trim() ?? "",
            size: formatBytes(build.size ?? 0),
            download: `/source/${source.id}/saida/${build.id}/arquivo`
        },
        content: output,
        lines: lineNumbers(output),
        lineCount: output.split("\n").length,
        size: build.status == "ok" ? formatBytes(build.size ?? 0) : "—"
    })
})

// download do binário ou do .s gerado
app.get("/source/:id/saida/:buildId/arquivo", async (req, res) => {
    const source = await findSource(req.params.id)
    const build = source && UUID.test(req.params.buildId) ? await sources.build(req.params.buildId) : null
    const response = build && build.source_id == source?.id ? await sources.buildOutput(build.id) : null
    if (!source || !build || !response) {
        return render(res, "missing", {}, 404)
    }
    const base = source.name.replace(/\.[^.]*$/, "").replace(/[^\w.-]/g, "_") || "programa"
    const filename = build.kind == "assembla" ? `${base}-rev${build.version}.s` : `${base}-rev${build.version}`
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
    res.setHeader("Content-Type", "application/octet-stream")
    res.send(Buffer.from(await response.arrayBuffer()))
})

app.post("/source/:id/revisoes", async (req, res) => {
    const id = req.params.id
    if (!UUID.test(id)) {
        return render(res, "missing", {}, 404)
    }
    const created = await sources.addVersion(id, String(req.body.content ?? ""))
    goTo(req, res, `/source/${id}?salvo=${created.version}`)
})

app.use(async (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    log().error({ err }, "falha ao atender a requisição")
    const status = err instanceof SourceError ? 502 : 500
    const message = err instanceof Error ? err.message : String(err)
    await render(res, "failure", { failure: message }, status)
})

const PORT = process.env.PORT ?? 3000
app.listen(PORT, () => {
    log().info({ port: PORT }, "servidor no ar")
})
