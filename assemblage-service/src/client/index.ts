import init from "../env/index.js";
import { correlationHeaders } from "../log/index.js";

init();

const WORKSPACE_URL = process.env.WORKSPACE_MODULE ?? "http://localhost:3004/"
const BLOB_URL = process.env.BLOB_MODULE ?? "http://localhost:3001/"

export type Workspace = { id: string, name: string, status: string, object_blob_id: string | null }

export async function getWorkspace(id: string): Promise<Workspace | null> {
    const response = await fetch(`${WORKSPACE_URL}workspaces/${encodeURIComponent(id)}`, { headers: correlationHeaders(), signal: AbortSignal.timeout(2000) })
    if (response.status == 404) {
        return null
    }
    if (!response.ok) {
        throw new Error(`workspace-service respondeu ${response.status}`)
    }
    return response.json() as Promise<Workspace>
}

export async function blobContent(id: string): Promise<ArrayBuffer | null> {
    const response = await fetch(`${BLOB_URL}content/${encodeURIComponent(id)}`, { headers: correlationHeaders(), signal: AbortSignal.timeout(2000) })
    return response.ok ? response.arrayBuffer() : null
}

export const urls = { WORKSPACE_URL, BLOB_URL }
