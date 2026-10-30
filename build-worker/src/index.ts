import init from "./env/index.js";
import amqp from "amqplib";
import type { Channel, ConsumeMessage } from "amqplib";
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

type BuildMessage = {
    build_id: string,
    source_id: string,
    name: string,
    version: number,
    kind: BuildKind,
    correlation_id?: string
}

// precisa ser idêntico à declaração do source-service, senão o rabbit recusa (PRECONDITION_FAILED)
const DLQ = "builds.dlq"
const queueOptions = {
    durable: true,
    arguments: { "x-dead-letter-exchange": "", "x-dead-letter-routing-key": DLQ }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// nome seguro para o arquivo temporário: só o basename, sem caracteres estranhos
// e sem "-" no início (senão o gcc leria o nome do arquivo como uma opção)
function safeName(name: string): string {
    const base = (name.split(/[\\/]/).pop() ?? "").replace(/[^\w.-]/g, "_").replace(/^-+/, "")
    return base || "fonte.c"
}

function gccArgs(kind: BuildKind, input: string, output: string): string[] {
    const common = [ "-x", "c", "-std=c17", "-Wall", "-Wextra" ]
    if (kind == "compila") {
        // estático: o binário roda em qualquer Linux x86-64, sem depender da musl do worker
        return [ ...common, "-O0", "-static", "-o", output, input ]
    }
    // assembly legível: sintaxe intel (só em x86_64) e sem diretivas .cfi
    const syntax = process.arch == "x64" ? [ "-masm=intel" ] : []
    return [ ...common, "-O1", "-S", ...syntax, "-fno-asynchronous-unwind-tables", "-o", output, input ]
}

// gcc com tempo limite, sem herdar variáveis de ambiente do worker
function gcc(args: string[], cwd: string): Promise<{ ok: boolean, output: string, timedOut: boolean }> {
    return new Promise(resolve => {
        execFile("gcc", args, {
            cwd,
            timeout: TIMEOUT_MS,
            killSignal: "SIGKILL",
            maxBuffer: 1024 * 1024,
            env: { PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin" }
        }, (err, stdout, stderr) => {
            resolve({ ok: !err, output: `${stdout}${stderr}`, timedOut: Boolean(err?.killed) })
        })
    })
}

async function fetchSource(name: string, version: number): Promise<string> {
    const response = await fetch(`${SOURCE_URL}content/${encodeURIComponent(name)}/${version}`, { headers: correlationHeaders() })
    if (!response.ok) {
        throw new Error(`source-service respondeu ${response.status} ao buscar ${name} REV ${version}`)
    }
    return response.text()
}

async function pushBlob(bytes: Buffer): Promise<string> {
    const response = await fetch(`${BLOB_URL}blob`, {
        method: "POST",
        headers: correlationHeaders({ "Content-type": "application/octet-stream" }),
        body: new Uint8Array(bytes)
    })
    if (!response.ok) {
        throw new Error(`blob-service respondeu ${response.status}`)
    }
    const json = await response.json() as { id: string }
    return json.id
}

async function report(buildId: string, body: { status: "ok" | "erro", blob_id?: string, size?: number, log: string }) {
    const response = await fetch(`${SOURCE_URL}builds/${buildId}`, {
        method: "PUT",
        headers: correlationHeaders({ "Content-type": "application/json" }),
        body: JSON.stringify(body)
    })
    if (!response.ok) {
        throw new Error(`source-service respondeu ${response.status} ao registrar o resultado`)
    }
}

async function handle(msg: BuildMessage): Promise<"ok" | "erro"> {
    const dir = await mkdtemp(join(tmpdir(), "build-"))
    try {
        const code = await fetchSource(msg.name, msg.version)
        const input = safeName(msg.name)
        await writeFile(join(dir, input), code)

        const output = msg.kind == "compila" ? "programa.out" : "saida.s"
        const result = await gcc(gccArgs(msg.kind, input, output), dir)

        let text = result.output
        if (result.timedOut) {
            text += `\nTempo limite de ${TIMEOUT_MS / 1000} s excedido; o gcc foi interrompido.`
        }
        if (text.length > MAX_LOG) {
            text = text.slice(0, MAX_LOG) + "\n[log truncado]"
        }

        if (!result.ok) {
            await report(msg.build_id, { status: "erro", log: text })
            return "erro"
        }

        const bytes = await readFile(join(dir, output))
        const blob_id = await pushBlob(bytes)
        await report(msg.build_id, { status: "ok", blob_id, size: bytes.length, log: text })
        return "ok"
    } finally {
        await rm(dir, { recursive: true, force: true })
    }
}

async function onMessage(ch: Channel, m: ConsumeMessage | null) {
    if (!m) {
        return
    }
    let msg: BuildMessage
    try {
        msg = JSON.parse(m.content.toString())
    } catch {
        log().error({ queue: m.fields.routingKey }, "mensagem ilegível, enviada para a DLQ")
        return ch.nack(m, false, false)
    }

    // o id vem do source-service (que recebeu do bff); sem ele, cria um para não perder o rastro
    const id = msg.correlation_id ?? m.properties.correlationId ?? randomUUID()
    await withCorrelation(id, async () => {
        const fields = { build_id: msg.build_id, kind: msg.kind, name: msg.name, version: msg.version }
        log().info(fields, "build recebido da fila")
        const started = Date.now()
        try {
            const status = await handle(msg)
            ch.ack(m)
            log().info({ ...fields, status, duration_ms: Date.now() - started }, "build concluído")
        } catch (err) {
            const reason = err instanceof Error ? err.message : String(err)
            log().error({ ...fields, err: reason }, "build falhou, enviado para a DLQ")
            await report(msg.build_id, { status: "erro", log: `Falha interna no worker: ${reason}` }).catch(() => {})
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
            await ch.assertQueue(DLQ, { durable: true })
            await ch.prefetch(1)
            for (const kind of KINDS) {
                await ch.assertQueue(kind, queueOptions)
                await ch.consume(kind, m => { onMessage(ch, m) })
            }
            consuming = true
            log().info({ queues: KINDS }, "aguardando builds")
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
