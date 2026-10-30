import init from "../env/index.js";

init();

const SOURCE_URL = process.env.SOURCE_MODULE

async function create(sourcedata: {
    content: string,
    filename: string
}): Promise<string|null> {
    const {content, filename} = sourcedata
    const payload = { content, filename }
    console.log({ payload, json: JSON.stringify(payload)})
    const response = await fetch(`${SOURCE_URL}source`,
        {
            method: "POST",
            headers: {
                "Content-type": "application/json"
            },
            body: JSON.stringify(payload)
        }
    )
    if (!response.ok) {
        return null
    }
    const json = response.json();
    return json.then(b => b.id)
}

async function download(id: string): Promise<Uint8Array | null> {
    const response = await fetch(`${SOURCE_URL}blob/${id}`)
    if (!response.ok) {
        return null
    }
    const json = response.json();
    return json.then(j => Buffer.from(j.content.data))
}

async function listFiles(page?: number): Promise<{ filename: string, id: string }[] | null> {
    return null
}

const client = {
    create,
    listFiles
    // fetch: download
}

export default client;