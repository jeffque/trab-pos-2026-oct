import init from "../env/index.js";
import { correlationHeaders, log } from "../log/index.js";

init();

const BLOB_URL = process.env.BLOB_MODULE

// chamadas ao blob-service: timeout de 2 s; falha ou timeout viram null e a rota responde 502
const TIMEOUT_MS = 2000

async function call(url: string, init: RequestInit = {}): Promise<Response | null> {
    try {
        return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch (err) {
        log().warn({ url, err: err instanceof Error ? err.message : String(err) }, "blob-service indisponível ou lento")
        return null
    }
}

async function send(bytes: ArrayBuffer): Promise<string|null> {
    const response = await call(`${BLOB_URL}blob`,
        {
            method: "POST",
            headers: correlationHeaders({
                "Content-type": "application/octet-stream",
                "Content-length": bytes.byteLength.toString()
            }),
            body: bytes
        }
    )
    if (!response?.ok) {
        return null
    }
    const json = response.json();
    return json.then(b => b.id)
}

async function download(id: string): Promise<Uint8Array | null> {
    const response = await call(`${BLOB_URL}blob/${id}`, { headers: correlationHeaders() })
    if (!response?.ok) {
        return null
    }
    const json = response.json();
    return json.then(j => Buffer.from(j.content.data))
}

const client = {
    send,
    fetch: download
}

export default client;