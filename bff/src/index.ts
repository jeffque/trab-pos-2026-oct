import express from "express";
import type { Request, Response, NextFunction } from "express";
import { Liquid } from "liquidjs";

import init from "./env/index.js"
import { correlation, correlationId, log } from "./log/index.js";
import { healthRouter, httpPing } from "./health/index.js";
import sources, { SourceError } from "./client/source.js";
import type { Source } from "./client/source.js";
import { workspaces, assemblages } from "./client/build.js";

init();

const liquidEngine = new Liquid({ outputEscape: "escape" });

const app = express();

const SOURCE_URL = process.env.SOURCE_MODULE ?? "http://localhost:3002/"
const WORKSPACE_URL = process.env.WORKSPACE_MODULE ?? "http://localhost:3004/"
const ASSEMBLAGE_URL = process.env.ASSEMBLAGE_MODULE ?? "http://localhost:3005/"
// endereço do grafana visto pelo navegador (links "logs")
const GRAFANA_URL = process.env.GRAFANA_URL ?? "http://localhost:3003"

app.use(healthRouter({
    "source-service": { critical: true, run: () => httpPing(`${SOURCE_URL}health/live`) },
    "workspace-service": { critical: false, run: () => httpPing(`${WORKSPACE_URL}health/live`) },
    "assemblage-service": { critical: false, run: () => httpPing(`${ASSEMBLAGE_URL}health/live`) }
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

type Area = "arquivos" | "workspaces" | "assemblagens"
type Mode = "empty" | "view" | "new" | "missing" | "failure" | "workspace" | "workspace-new" | "assemblage" | "assemblage-new"

const STATUS_LABEL: Record<string, string> = {
    rascunho: "rascunho", na_fila: "na fila", compilado: "compilado", erro: "erro", pronto: "pronto"
}

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

function formatBytes(bytes: number | null | undefined): string {
    if (bytes == null) {
        return "—"
    }
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

const short = (id: string) => id.slice(0, 8).toUpperCase()

// lista da esquerda, conforme a área; se um serviço cair, a tela continua de pé e mostra o erro
async function register(area: Area, currentId?: string) {
    try {
        if (area == "workspaces") {
            const items = (await workspaces.list()).map(w => ({
                href: `/workspaces/${w.id}`, short: short(w.id), name: w.name,
                status: w.status, statusLabel: STATUS_LABEL[w.status] ?? w.status, current: w.id == currentId
            }))
            return { items, registerError: null }
        }
        if (area == "assemblagens") {
            const items = (await assemblages.list()).map(a => ({
                href: `/assemblagens/${a.id}`, short: short(a.id), name: a.name,
                status: a.status, statusLabel: STATUS_LABEL[a.status] ?? a.status, current: a.id == currentId
            }))
            return { items, registerError: null }
        }
        const items = (await sources.list())
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(s => ({ href: `/source/${s.id}`, short: short(s.id), name: s.name, rev: latest(s), current: s.id == currentId }))
        return { items, registerError: null }
    } catch (err) {
        return { items: [], registerError: err instanceof Error ? err.message : String(err) }
    }
}

async function render(res: Response, area: Area, mode: Mode, data: Record<string, unknown> = {}, status = 200) {
    const reg = await register(area, data["currentId"] as string | undefined)
    const id = correlationId()
    res.status(status).render("workspace", { area, mode, ...reg, correlation: id, correlationLogs: id ? logsUrl(id) : null, ...data })
}

// requisições HTMX recebem HX-Location (troca só o #app); navegação comum recebe redirect
function goTo(req: Request, res: Response, path: string) {
    if (req.header("HX-Request") == "true") {
        res.setHeader("HX-Location", JSON.stringify({ path, target: "#app", select: "#app", swap: "outerHTML transition:true" }))
        return res.sendStatus(204)
    }
    res.redirect(303, path)
}

// erro de validação vindo de um serviço (400/409): mostra a mensagem na própria tela
function validationError(err: unknown): string | null {
    return err instanceof SourceError && (err.status == 400 || err.status == 409) ? err.message : null
}

async function download(res: Response, response: globalThis.Response | null, filename: string) {
    if (!response) {
        return false
    }
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
    res.setHeader("Content-Type", "application/octet-stream")
    res.send(Buffer.from(await response.arrayBuffer()))
    return true
}

const safeFile = (name: string) => name.replace(/[^\w.-]/g, "_") || "arquivo"

// ---------------------------------------------------------------- arquivos

app.get("/", async (req, res) => {
    await render(res, "arquivos", "empty")
})

app.get("/novo", async (req, res) => {
    await render(res, "arquivos", "new", { form: { filename: "", content: "" } })
})

app.post("/novo", async (req, res) => {
    const filename = String(req.body.filename ?? "").trim()
    const content = String(req.body.content ?? "")
    const form = { filename, content }

    if (!filename) {
        return render(res, "arquivos", "new", { form, error: "Dê um nome ao arquivo, por exemplo main.c." }, 422)
    }
    if (/[\/\\]/.test(filename)) {
        return render(res, "arquivos", "new", { form, error: "O nome não pode conter barras. Use só o nome do arquivo, como main.c." }, 422)
    }

    try {
        const created = await sources.create(filename, content)
        goTo(req, res, `/source/${created.id}?salvo=1`)
    } catch (err) {
        if (err instanceof SourceError && err.status == 400) {
            return render(res, "arquivos", "new", { form, error: `Já existe um arquivo chamado ${filename}. Escolha outro nome ou abra o existente no registro.` }, 422)
        }
        throw err
    }
})

async function viewFile(res: Response, source: Source, selected: number, extra: Record<string, unknown> = {}, status = 200) {
    const newest = latest(source)
    const content = await sources.content(source.name, selected) ?? ""
    const compilable = /\.(c|h)$/i.test(source.name)
    // workspaces que já usam o arquivo e os que ainda podem recebê-lo
    const [ usedBy, all ] = compilable
        ? await Promise.all([ workspaces.usedBy(source.id), workspaces.list() ]).catch(() => [ [], [] ] as const)
        : [ [], [] ] as const
    const usedIds = new Set(usedBy.map(w => w.id))
    await render(res, "arquivos", "view", {
        currentId: source.id,
        file: { id: source.id, short: short(source.id), name: source.name, language: language(source.name) },
        revisions: source.versions
            .map(v => ({ version: v.version, selected: v.version == selected, newest: v.version == newest }))
            .sort((a, b) => b.version - a.version),
        selected,
        newest,
        next: newest + 1,
        isOld: selected != newest,
        content,
        lines: lineNumbers(content),
        lineCount: content.split("\n").length,
        size: formatBytes(new TextEncoder().encode(content).length),
        compilable,
        usedBy: usedBy.map(w => ({ ...w, statusLabel: STATUS_LABEL[w.status] ?? w.status, pinned: w.file_version == selected })),
        candidates: all.filter(w => !usedIds.has(w.id) && w.status != "na_fila"),
        ...extra
    }, status)
}

async function findSource(id: string): Promise<Source | null> {
    return UUID.test(id) ? sources.get(id) : null
}

app.get("/source/:id", async (req, res) => {
    const source = await findSource(req.params.id)
    if (!source) {
        return render(res, "arquivos", "missing", {}, 404)
    }
    const requested = Number(req.query["rev"])
    const selected = source.versions.some(v => v.version == requested) ? requested : latest(source)
    const saved = Number(req.query["salvo"])
    await viewFile(res, source, selected, { notice: saved ? `REV ${saved} registrada.` : null })
})

app.post("/source/:id/revisoes", async (req, res) => {
    const id = req.params.id
    if (!UUID.test(id)) {
        return render(res, "arquivos", "missing", {}, 404)
    }
    const created = await sources.addVersion(id, String(req.body.content ?? ""))
    goTo(req, res, `/source/${id}?salvo=${created.version}`)
})

// inclui a revisão aberta do arquivo num workspace (ou fixa outra revisão nele)
app.post("/source/:id/workspace", async (req, res) => {
    const source = await findSource(req.params.id)
    if (!source) {
        return render(res, "arquivos", "missing", {}, 404)
    }
    const rev = Number(req.body.rev)
    const workspaceId = String(req.body.workspace_id ?? "")
    try {
        await workspaces.addFile(workspaceId, source.id, rev)
        goTo(req, res, `/source/${source.id}?rev=${rev}`)
    } catch (err) {
        const message = validationError(err)
        if (message) {
            return viewFile(res, source, source.versions.some(v => v.version == rev) ? rev : latest(source), { sideError: message }, 422)
        }
        throw err
    }
})

// ---------------------------------------------------------------- workspaces

app.get("/workspaces", async (req, res) => {
    await render(res, "workspaces", "empty")
})

app.get("/workspaces/novo", async (req, res) => {
    await render(res, "workspaces", "workspace-new", { form: { name: "" } })
})

app.post("/workspaces/novo", async (req, res) => {
    const name = String(req.body.name ?? "").trim()
    try {
        const created = await workspaces.create(name)
        goTo(req, res, `/workspaces/${created.id}`)
    } catch (err) {
        const message = validationError(err)
        if (message) {
            return render(res, "workspaces", "workspace-new", { form: { name }, error: message }, 422)
        }
        throw err
    }
})

async function viewWorkspace(res: Response, id: string, extra: Record<string, unknown> = {}, status = 200) {
    const ws = UUID.test(id) ? await workspaces.get(id) : null
    if (!ws) {
        return render(res, "workspaces", "missing", {}, 404)
    }
    const files = await sources.list().catch(() => [] as Source[])
    const inside = new Set(ws.files.map(f => f.source_id))
    const newestOf = new Map(files.map(s => [ s.id, latest(s) ]))
    await render(res, "workspaces", "workspace", {
        currentId: ws.id,
        ws: {
            ...ws,
            short: short(ws.id),
            statusLabel: STATUS_LABEL[ws.status] ?? ws.status,
            size: formatBytes(ws.object_size),
            log: ws.log?.trim() ?? "",
            hasC: ws.files.some(f => /\.c$/i.test(f.name)),
            files: ws.files.map(f => {
                const newest = newestOf.get(f.source_id) ?? f.version
                return { ...f, newest, outdated: newest > f.version }
            }),
            logs: ws.correlation_id ? logsUrl(ws.correlation_id) : null,
            download: `/workspaces/${ws.id}/objeto`
        },
        // fontes .c/.h que ainda não estão no workspace
        candidates: files.filter(s => /\.(c|h)$/i.test(s.name) && !inside.has(s.id))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(s => ({ id: s.id, name: s.name, newest: latest(s) })),
        pending: ws.status == "na_fila",
        selfUrl: `/workspaces/${ws.id}`,
        ...extra
    }, status)
}

app.get("/workspaces/:id", async (req, res) => {
    await viewWorkspace(res, req.params.id)
})

app.post("/workspaces/:id/arquivos", async (req, res) => {
    const version = String(req.body.version ?? "").trim()
    try {
        await workspaces.addFile(req.params.id, String(req.body.source_id ?? ""), version ? Number(version) : undefined)
        goTo(req, res, `/workspaces/${req.params.id}`)
    } catch (err) {
        const message = validationError(err)
        if (message) {
            return viewWorkspace(res, req.params.id, { error: message }, 422)
        }
        throw err
    }
})

app.post("/workspaces/:id/arquivos/:sourceId/remover", async (req, res) => {
    try {
        await workspaces.removeFile(req.params.id, req.params.sourceId)
        goTo(req, res, `/workspaces/${req.params.id}`)
    } catch (err) {
        const message = validationError(err)
        if (message) {
            return viewWorkspace(res, req.params.id, { error: message }, 422)
        }
        throw err
    }
})

// workspace pronto: vai para a fila de compilação; a tela acompanha o status
app.post("/workspaces/:id/compilar", async (req, res) => {
    try {
        await workspaces.compile(req.params.id)
        goTo(req, res, `/workspaces/${req.params.id}`)
    } catch (err) {
        const message = validationError(err)
        if (message) {
            return viewWorkspace(res, req.params.id, { error: message }, 422)
        }
        // 503: fila fora do ar; o workspace já foi marcado com erro e a explicação aparece na tela
        if (err instanceof SourceError && err.status == 503) {
            return goTo(req, res, `/workspaces/${req.params.id}`)
        }
        throw err
    }
})

app.get("/workspaces/:id/objeto", async (req, res) => {
    const ws = UUID.test(req.params.id) ? await workspaces.get(req.params.id) : null
    if (!ws || !await download(res, await workspaces.object(ws.id), `${safeFile(ws.name)}.o`)) {
        return render(res, "workspaces", "missing", {}, 404)
    }
})

// ---------------------------------------------------------------- assemblagens

app.get("/assemblagens", async (req, res) => {
    await render(res, "assemblagens", "empty")
})

async function newAssemblage(res: Response, form: { name: string, selected: string[] }, extra: Record<string, unknown> = {}, status = 200) {
    const compiled = (await workspaces.list()).filter(w => w.status == "compilado")
    await render(res, "assemblagens", "assemblage-new", {
        form,
        compiled: compiled.map(w => ({ ...w, size: formatBytes(w.object_size), checked: form.selected.includes(w.id) })),
        ...extra
    }, status)
}

app.get("/assemblagens/novo", async (req, res) => {
    const ws = String(req.query["ws"] ?? "")
    await newAssemblage(res, { name: "", selected: UUID.test(ws) ? [ ws ] : [] })
})

app.post("/assemblagens/novo", async (req, res) => {
    const name = String(req.body.name ?? "").trim()
    const raw = req.body.workspace_ids
    const selected: string[] = (Array.isArray(raw) ? raw : raw ? [ raw ] : []).map(String)
    try {
        const created = await assemblages.create(name, selected)
        goTo(req, res, `/assemblagens/${created.id}`)
    } catch (err) {
        const message = validationError(err)
        if (message) {
            return newAssemblage(res, { name, selected }, { error: message }, 422)
        }
        throw err
    }
})

app.get("/assemblagens/:id", async (req, res) => {
    const a = UUID.test(req.params.id) ? await assemblages.get(req.params.id) : null
    if (!a) {
        return render(res, "assemblagens", "missing", {}, 404)
    }
    await render(res, "assemblagens", "assemblage", {
        currentId: a.id,
        asm: {
            ...a,
            short: short(a.id),
            statusLabel: STATUS_LABEL[a.status] ?? a.status,
            size: formatBytes(a.size),
            log: a.log?.trim() ?? "",
            logs: a.correlation_id ? logsUrl(a.correlation_id) : null,
            download: `/assemblagens/${a.id}/executavel`
        },
        pending: a.status == "na_fila",
        selfUrl: `/assemblagens/${a.id}`
    })
})

app.get("/assemblagens/:id/executavel", async (req, res) => {
    const a = UUID.test(req.params.id) ? await assemblages.get(req.params.id) : null
    if (!a || !await download(res, await assemblages.executable(a.id), safeFile(a.name))) {
        return render(res, "assemblagens", "missing", {}, 404)
    }
})

app.use(async (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    log().error({ err }, "falha ao atender a requisição")
    const status = err instanceof SourceError ? 502 : 500
    const message = err instanceof Error ? err.message : String(err)
    const area: Area = req.path.startsWith("/workspaces") ? "workspaces" : req.path.startsWith("/assemblagens") ? "assemblagens" : "arquivos"
    await render(res, area, "failure", { failure: message }, status)
})

const PORT = process.env.PORT ?? 3000
app.listen(PORT, () => {
    log().info({ port: PORT }, "servidor no ar")
})
