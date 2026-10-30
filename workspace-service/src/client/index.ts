import init from "../env/index.js";
import { correlationHeaders } from "../log/index.js";

init();

const SOURCE_URL = process.env.SOURCE_MODULE ?? "http://localhost:3002/"
const BLOB_URL = process.env.BLOB_MODULE ?? "http://localhost:3001/"

export type Source = { id: string, name: string, versions: { version: number }[] }

export async function getSource(id: string): Promise<Source | null> {
    const response = await fetch(`${SOURCE_URL}source/${encodeURIComponent(id)}`, { headers: correlationHeaders() })
    if (response.status == 404 || response.status == 500) {
        return null
    }
    if (!response.ok) {
        throw new Error(`source-service respondeu ${response.status}`)
    }
    return response.json() as Promise<Source>
}

export async function blobContent(id: string): Promise<ArrayBuffer | null> {
    const response = await fetch(`${BLOB_URL}content/${encodeURIComponent(id)}`, { headers: correlationHeaders() })
    return response.ok ? response.arrayBuffer() : null
}

export const urls = { SOURCE_URL, BLOB_URL }
