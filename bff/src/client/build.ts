import init from "../env/index.js";
import { correlationHeaders } from "../log/index.js";
import { SourceError } from "./source.js";

init();

const WORKSPACE_URL = process.env.WORKSPACE_MODULE ?? "http://localhost:3004/"
const ASSEMBLAGE_URL = process.env.ASSEMBLAGE_MODULE ?? "http://localhost:3005/"

export type WorkspaceSummary = { id: string, name: string, status: string, object_size: number | null, files: number }
export type WorkspaceUsage = { id: string, name: string, status: string, file_version: number }
export type Workspace = {
    id: string, name: string, status: "rascunho" | "na_fila" | "compilado" | "erro",
    object_size: number | null, log: string | null, correlation_id: string | null,
    compiled_at: string | null, files: { source_id: string, name: string, version: number }[]
}
export type AssemblageSummary = { id: string, name: string, status: string, size: number | null, objects: number }
export type Assemblage = {
    id: string, name: string, status: "na_fila" | "pronto" | "erro",
    size: number | null, log: string | null, correlation_id: string | null,
    finished_at: string | null, objects: { workspace_id: string, workspace_name: string }[]
}

async function call(base: string, service: string, path: string, init?: RequestInit): Promise<Response> {
    try {
        return await fetch(`${base}${path}`, { ...init, headers: correlationHeaders(init?.headers), signal: AbortSignal.timeout(5000) })
    } catch {
        throw new SourceError(`${service} inacessível em ${base}`, 503)
    }
}

// GET que devolve JSON; 404 vira null
async function getJson<T>(base: string, service: string, path: string): Promise<T | null> {
    const response = await call(base, service, path)
    if (response.status == 404) {
        return null
    }
    if (!response.ok) {
        throw new SourceError(`${service} respondeu ${response.status}`, response.status)
    }
    return response.json() as Promise<T>
}

// POST/DELETE; erros de validação (400/409) chegam como texto para mostrar na tela
async function send<T>(base: string, service: string, method: string, path: string, body?: object): Promise<T> {
    const response = await call(base, service, path, {
        method,
        ...(body ? { headers: { "Content-type": "application/json" }, body: JSON.stringify(body) } : {})
    })
    if (!response.ok) {
        throw new SourceError(await response.text() || `${service} respondeu ${response.status}`, response.status)
    }
    return response.json() as Promise<T>
}

const W = (path: string) => [ WORKSPACE_URL, "workspace-service", path ] as const
const A = (path: string) => [ ASSEMBLAGE_URL, "assemblage-service", path ] as const

export const workspaces = {
    list: async () => (await getJson<WorkspaceSummary[]>(...W("workspaces"))) ?? [],
    usedBy: async (sourceId: string) => (await getJson<WorkspaceUsage[]>(...W(`workspaces?source_id=${encodeURIComponent(sourceId)}`))) ?? [],
    get: (id: string) => getJson<Workspace>(...W(`workspaces/${encodeURIComponent(id)}`)),
    create: (name: string) => send<Workspace>(WORKSPACE_URL, "workspace-service", "POST", "workspaces", { name }),
    addFile: (id: string, source_id: string, version?: number) =>
        send<Workspace>(WORKSPACE_URL, "workspace-service", "POST", `workspaces/${encodeURIComponent(id)}/files`, { source_id, ...(version ? { version } : {}) }),
    removeFile: (id: string, sourceId: string) =>
        send<Workspace>(WORKSPACE_URL, "workspace-service", "DELETE", `workspaces/${encodeURIComponent(id)}/files/${encodeURIComponent(sourceId)}`),
    compile: (id: string) => send<Workspace>(WORKSPACE_URL, "workspace-service", "POST", `workspaces/${encodeURIComponent(id)}/compilar`),
    object: async (id: string) => {
        const response = await call(...W(`workspaces/${encodeURIComponent(id)}/objeto`))
        return response.ok ? response : null
    }
}

export const assemblages = {
    list: async () => (await getJson<AssemblageSummary[]>(...A("assemblages"))) ?? [],
    get: (id: string) => getJson<Assemblage>(...A(`assemblages/${encodeURIComponent(id)}`)),
    create: (name: string, workspace_ids: string[]) =>
        send<Assemblage>(ASSEMBLAGE_URL, "assemblage-service", "POST", "assemblages", { name, workspace_ids }),
    executable: async (id: string) => {
        const response = await call(...A(`assemblages/${encodeURIComponent(id)}/executavel`))
        return response.ok ? response : null
    }
}
