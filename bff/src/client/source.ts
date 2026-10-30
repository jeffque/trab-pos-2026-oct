import init from "../env/index.js";
import { correlationHeaders } from "../log/index.js";

init();

const SOURCE_URL = process.env.SOURCE_MODULE ?? "http://localhost:3002/"

export type Version = { version: number, blob_id: string }
export type Source = { id: string, name: string, versions: Version[] }
export type BuildKind = "compila" | "assembla"
export type Build = {
    id: string,
    source_id: string,
    version: number,
    kind: BuildKind,
    status: "pendente" | "ok" | "erro",
    size: number | null,
    log: string | null,
    correlation_id: string | null,
    created_at: string,
    finished_at: string | null
}

export class SourceError extends Error {
    status: number
    constructor(message: string, status: number) {
        super(message)
        this.status = status
    }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
    try {
        return await fetch(`${SOURCE_URL}${path}`, { ...init, headers: correlationHeaders(init?.headers) })
    } catch {
        throw new SourceError(`source-service inacessível em ${SOURCE_URL}`, 503)
    }
}

async function list(): Promise<Source[]> {
    const response = await request("source")
    if (!response.ok) {
        throw new SourceError(`source-service respondeu ${response.status}`, response.status)
    }
    return response.json() as Promise<Source[]>
}

async function get(id: string): Promise<Source | null> {
    const response = await request(`source/${encodeURIComponent(id)}`)
    if (response.status == 404) {
        return null
    }
    if (!response.ok) {
        throw new SourceError(`source-service respondeu ${response.status}`, response.status)
    }
    return response.json() as Promise<Source>
}

async function content(name: string, version: number): Promise<string | null> {
    const response = await request(`content/${encodeURIComponent(name)}/${version}`)
    if (response.status == 404) {
        return null
    }
    if (!response.ok) {
        throw new SourceError(`source-service respondeu ${response.status}`, response.status)
    }
    return response.text()
}

async function send(path: string, body: object): Promise<{ id: string, version: number }> {
    const response = await request(path, {
        method: "POST",
        headers: { "Content-type": "application/json" },
        body: JSON.stringify(body)
    })
    if (!response.ok) {
        throw new SourceError(await response.text() || `source-service respondeu ${response.status}`, response.status)
    }
    return response.json() as Promise<{ id: string, version: number }>
}

function create(filename: string, content: string) {
    return send("source", { filename, content })
}

function addVersion(id: string, content: string) {
    return send(`source/${encodeURIComponent(id)}/versions`, { content })
}

async function builds(id: string, version: number): Promise<Build[]> {
    const response = await request(`source/${encodeURIComponent(id)}/builds?version=${version}`)
    if (!response.ok) {
        throw new SourceError(`source-service respondeu ${response.status}`, response.status)
    }
    return response.json() as Promise<Build[]>
}

async function build(buildId: string): Promise<Build | null> {
    const response = await request(`builds/${encodeURIComponent(buildId)}`)
    if (response.status == 404 || response.status == 400) {
        return null
    }
    if (!response.ok) {
        throw new SourceError(`source-service respondeu ${response.status}`, response.status)
    }
    return response.json() as Promise<Build>
}

async function requestBuild(id: string, version: number, kind: BuildKind): Promise<void> {
    const response = await request(`source/${encodeURIComponent(id)}/versions/${version}/builds`, {
        method: "POST",
        headers: { "Content-type": "application/json" },
        body: JSON.stringify({ kind })
    })
    // 503: a fila caiu; o build já foi registrado como erro e aparece na tela com a explicação
    if (!response.ok && response.status != 503) {
        throw new SourceError(`source-service respondeu ${response.status}`, response.status)
    }
}

async function buildOutput(buildId: string): Promise<Response | null> {
    const response = await request(`builds/${encodeURIComponent(buildId)}/content`)
    return response.ok ? response : null
}

const client = {
    list,
    get,
    content,
    create,
    addVersion,
    builds,
    build,
    requestBuild,
    buildOutput
}

export default client;
