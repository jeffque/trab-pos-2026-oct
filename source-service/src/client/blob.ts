import init from "../env/index.js";
import { correlationHeaders } from "../log/index.js";

init();

const BLOB_URL = process.env.BLOB_MODULE

async function send(bytes: ArrayBuffer): Promise<string|null> {
    const response = await fetch(`${BLOB_URL}blob`,
        {
            method: "POST",
            headers: correlationHeaders({
                "Content-type": "application/octet-stream",
                "Content-length": bytes.byteLength.toString()
            }),
            body: bytes
        }
    )
    if (!response.ok) {
        return null
    }
    const json = response.json();
    return json.then(b => b.id)
}

async function download(id: string): Promise<Uint8Array | null> {
    const response = await fetch(`${BLOB_URL}blob/${id}`, { headers: correlationHeaders() })
    if (!response.ok) {
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