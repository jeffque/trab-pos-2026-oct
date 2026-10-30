import init from "./env/index.js";
import amqp from "amqplib";
import type { Channel, ConfirmChannel, ConsumeMessage } from "amqplib";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { log, withCorrelation, correlationHeaders, SERVICE, INSTANCE } from "./log/index.js";
import { randomUUID } from "node:crypto";

init();

const RABBIT_URL = process.env.RABBIT_URL ?? "amqp://localhost"
const SOURCE_URL = process.env.SOURCE_MODULE ?? "http://localhost:3002/"
const BLOB_URL = process.env.BLOB_MODULE ?? "http://localhost:3001/"

const TIMEOUT_MS = 10_000
const MAX_LOG = 64 * 1024

type BuildKind = "compila" | "assembla"
const ALL_KINDS: BuildKind[] = [ "compila", "assembla" ]

// WORKER_QUEUES=compila (ou assembla) especializa o worker numa fila só; sem ela, consome as duas
const KINDS: BuildKind[] = (process.env.WORKER_QUEUES ?? ALL_KINDS.join(","))
    .split(",")
    .map(q => q.trim())
    .filter((q): q is BuildKind => (ALL_KINDS as string[]).includes(q))

// para onde volta o evento de cada tipo de trabalho
const RESULT_QUEUE: Record<BuildKind, string> = {
    compila: "compilacao.resultado",
    assembla: "assemblagem.resultado"
}

// pedido de compilação: um workspace com fontes .c/.h em revisões fixas
type CompileMessage = { workspace_id: string, name: string, files: { name: string, version: number }[], correlation_id?: string }
// pedido de assemblagem: arquivos objeto (blobs) de vários workspaces
type AssembleMessage = { assemblage_id: string, name: string, objects: { workspace_name: string, blob_id: string }[], correlation_id?: string }

type Result = { status: "ok" | "erro", blob_id?: string, size?: number, log: string }

// precisa ser idêntico à declaração dos outros serviços, senão o rabbit recusa (PRECONDITION_FAILED)
const DLQ = "builds.dlq"
const queueOptions = {
    durable: true,
    arguments: { "x-dead-letter-exchange": "", "x-dead-letter-routing-key": DLQ }
}
const ALL_QUEUES = [ "compila", "assembla", "compilacao.resultado", "assemblagem.resultado" ]

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// nome seguro para o arquivo temporário: só o basename, sem caracteres estranhos
// e sem "-" no início (senão o gcc leria o nome do arquivo como uma opção)
function safeName(name: string, fallback: string): string {
    const base = (name.split(/[\\/]/).pop() ?? "").replace(/[^\w.-]/g, "_").replace(/^-+/, "")
    return base || fallback
}

// roda gcc/ld com tempo limite, sem shell e sem herdar variáveis de ambiente do worker
function run(cmd: string, args: string[], cwd: string): Promise<{ ok: boolean, output: string }> {
    return new Promise(resolve => {
        execFile(cmd, args, {
            cwd,
            timeout: TIMEOUT_MS,
            killSignal: "SIGKILL",
            maxBuffer: 1024 * 1024,
            env: { PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin" }
        }, (err, stdout, stderr) => {
            let output = `${stdout}${stderr}`
            if (err?.killed) {
                output += `\nTempo limite de ${TIMEOUT_MS / 1000} s excedido; o ${cmd} foi interrompido.`
            }
            resolve({ ok: !err, output })
        })
    })
}

function clip(text: string): string {
    return text.length > MAX_LOG ? text.slice(0, MAX_LOG) + "\n[log truncado]" : text
}

async function fetchSource(name: string, version: number): Promise<string> {
    const response = await fetch(`${SOURCE_URL}content/${encodeURIComponent(name)}/${version}`, { headers: correlationHeaders(), signal: AbortSignal.timeout(10_000) })
    if (!response.ok) {
        throw new Error(`source-service respondeu ${response.status} ao buscar ${name} REV ${version}`)
    }
    return response.text()
}

async function fetchBlob(id: string): Promise<Buffer> {
    const response = await fetch(`${BLOB_URL}content/${encodeURIComponent(id)}`, { headers: correlationHeaders(), signal: AbortSignal.timeout(10_000) })
    if (!response.ok) {
        throw new Error(`blob-service respondeu ${response.status} ao buscar o objeto ${id}`)
    }
    return Buffer.from(await response.arrayBuffer())
}

async function pushBlob(bytes: Buffer): Promise<string> {
    const response = await fetch(`${BLOB_URL}blob`, {
        method: "POST",
        headers: correlationHeaders({ "Content-type": "application/octet-stream" }),
        body: new Uint8Array(bytes),
        signal: AbortSignal.timeout(10_000)
    })
    if (!response.ok) {
        throw new Error(`blob-service respondeu ${response.status}`)
    }
    const json = await response.json() as { id: string }
    return json.id
}

async function inTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(join(tmpdir(), "build-"))
    try {
        return await fn(dir)
    } finally {
        await rm(dir, { recursive: true, force: true })
    }
}

// workspace -> um arquivo objeto: gcc -c em cada .c (com os .h ao lado) e, se houver mais de um, ld -r junta tudo
async function compile(msg: CompileMessage): Promise<Result> {
    return inTempDir(async dir => {
        const sources: string[] = []
        for (const file of msg.files) {
            const name = safeName(file.name, "fonte.c")
            await writeFile(join(dir, name), await fetchSource(file.name, file.version))
            if (/\.c$/i.test(name)) {
                sources.push(name)
            }
        }
        if (sources.length == 0) {
            return { status: "erro", log: "O workspace não tem nenhum arquivo .c." }
        }

        const gcc = await run("gcc", [ "-std=c17", "-Wall", "-Wextra", "-O0", "-I.", "-c", ...sources ], dir)
        let text = gcc.output
        if (!gcc.ok) {
            return { status: "erro", log: clip(text) }
        }

        const objects = sources.map(s => s.replace(/\.c$/i, ".o"))
        let output = objects[0]!
        if (objects.length > 1) {
            output = "workspace.o"
            const ld = await run("ld", [ "-r", "-o", output, ...objects ], dir)
            text += ld.output
            if (!ld.ok) {
                return { status: "erro", log: clip(text) }
            }
        }

        const bytes = await readFile(join(dir, output))
        const blob_id = await pushBlob(bytes)
        return { status: "ok", blob_id, size: bytes.length, log: clip(text) }
    })
}

// objetos -> executável: linkagem estática (roda em qualquer Linux x86-64); o programa nunca é executado aqui
async function assemble(msg: AssembleMessage): Promise<Result> {
    return inTempDir(async dir => {
        const objects: string[] = []
        for (const [ i, obj ] of msg.objects.entries()) {
            const name = `${String(i + 1).padStart(2, "0")}-${safeName(obj.workspace_name, "objeto")}.o`
            await writeFile(join(dir, name), await fetchBlob(obj.blob_id))
            objects.push(name)
        }
        if (objects.length == 0) {
            return { status: "erro", log: "Nenhum arquivo objeto para linkar." }
        }

        const gcc = await run("gcc", [ "-static", "-o", "programa", ...objects ], dir)
        if (!gcc.ok) {
            return { status: "erro", log: clip(gcc.output) }
        }
        const bytes = await readFile(join(dir, "programa"))
        const blob_id = await pushBlob(bytes)
        return { status: "ok", blob_id, size: bytes.length, log: clip(gcc.output) }
    })
}

// devolve o evento ("compilei" / "assemblei") para o serviço dono do pedido
async function emit(pub: ConfirmChannel, kind: BuildKind, idField: Record<string, string>, result: Result, correlationId: string) {
    pub.sendToQueue(RESULT_QUEUE[kind], Buffer.from(JSON.stringify({ ...idField, ...result, correlation_id: correlationId })), {
        persistent: true,
        contentType: "application/json",
        correlationId
    })
    await pub.waitForConfirms()
}

async function onMessage(kind: BuildKind, ch: Channel, pub: ConfirmChannel, m: ConsumeMessage | null) {
    if (!m) {
        return
    }
    let msg: CompileMessage | AssembleMessage
    try {
        msg = JSON.parse(m.content.toString())
    } catch {
        log().error({ queue: kind }, "mensagem ilegível, enviada para a DLQ")
        return ch.nack(m, false, false)
    }

    const idField: Record<string, string> = kind == "compila"
        ? { workspace_id: (msg as CompileMessage).workspace_id }
        : { assemblage_id: (msg as AssembleMessage).assemblage_id }

    // o id vem do serviço que publicou (que recebeu do bff); sem ele, cria um para não perder o rastro
    const id = msg.correlation_id ?? m.properties.correlationId ?? randomUUID()
    await withCorrelation(id, async () => {
        const fields = { kind, name: msg.name, ...idField }
        log().info(fields, "pedido recebido da fila")
        const started = Date.now()
        try {
            const result = kind == "compila" ? await compile(msg as CompileMessage) : await assemble(msg as AssembleMessage)
            await emit(pub, kind, idField, result, id)
            ch.ack(m)
            log().info({ ...fields, status: result.status, size: result.size, duration_ms: Date.now() - started }, "pedido concluído, evento publicado")
        } catch (err) {
            const reason = err instanceof Error ? err.message : String(err)
            log().error({ ...fields, err: reason }, "pedido falhou, enviado para a DLQ")
            await emit(pub, kind, idField, { status: "erro", log: `Falha interna no worker: ${reason}` }, id).catch(() => {})
            ch.nack(m, false, false)
        }
    })
}

let consuming = false

// consome as filas configuradas; se o rabbit cair ou ainda não estiver de pé, tenta de novo
async function start() {
    for (;;) {
        try {
            const connection = await amqp.connect(RABBIT_URL)
            connection.on("error", err => log().warn({ err: err.message }, "erro na conexão com o rabbitmq"))
            const ch = await connection.createChannel()
            const pub = await connection.createConfirmChannel()
            await ch.assertQueue(DLQ, { durable: true })
            for (const q of ALL_QUEUES) {
                await ch.assertQueue(q, queueOptions)
            }
            await ch.prefetch(1)
            for (const kind of KINDS) {
                await ch.consume(kind, m => { onMessage(kind, ch, pub, m) })
            }
            consuming = true
            log().info({ queues: KINDS }, "aguardando pedidos")
            await new Promise(resolve => connection.on("close", resolve))
            consuming = false
            log().warn("conexão com o rabbitmq perdida")
        } catch (err) {
            consuming = false
            log().warn({ err: err instanceof Error ? err.message : String(err) }, "rabbitmq indisponível, nova tentativa em 2 s")
        }
        await sleep(2000)
    }
}

// /health/live: processo de pé; /health/ready: conectado ao rabbit e consumindo as filas
const HEALTH_PORT = Number(process.env.HEALTH_PORT ?? 3005)
const startedAt = Date.now()
createServer((req, res) => {
    const live = req.url == "/health/live"
    const ready = consuming || live
    if (req.url != "/health" && req.url != "/health/ready" && !live) {
        res.writeHead(404).end()
        return
    }
    res.writeHead(ready ? 200 : 503, { "Content-type": "application/json" })
    res.end(JSON.stringify({
        status: ready ? "ok" : "fail",
        service: SERVICE,
        instance: INSTANCE,
        uptime_s: Math.round((Date.now() - startedAt) / 1000),
        ...(live ? {} : { checks: { rabbitmq: { status: consuming ? "ok" : "fail", critical: true }, queues: KINDS } })
    }))
}).listen(HEALTH_PORT)

start()
