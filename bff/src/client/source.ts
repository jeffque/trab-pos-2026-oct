import init from "../env/index.js";
import { correlationHeaders } from "../log/index.js";

init();

const SOURCE_URL = process.env.SOURCE_MODULE ?? "http://localhost:3002/"

export type Version = { version: number, blob_id: string }
export type Source = { id: string, name: string, versions: Version[] }
export class SourceError extends Error {
    status: number
    constructor(message: string, status: number) {
        super(message)
        this.status = status
    }
}

export async function request(path: string, init?: RequestInit): Promise<Response> {
    try {
        return await fetch(`${SOURCE_URL}${path}`, { ...init, headers: correlationHeaders(init?.headers), signal: AbortSignal.timeout(5000) })
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

const client = {
    list,
    get,
    content,
    create,
    addVersion
}

export default client;
