import init from "../env/index.js";
import amqp from "amqplib";
import type { ConfirmChannel } from "amqplib";
import { log, correlationId } from "../log/index.js";

init();

const RABBIT_URL = process.env.RABBIT_URL ?? "amqp://localhost"

export type BuildKind = "compila" | "assembla"
export const KINDS: BuildKind[] = [ "compila", "assembla" ]

export type BuildMessage = {
    build_id: string,
    source_id: string,
    name: string,
    version: number,
    kind: BuildKind,
    correlation_id?: string
}

// mesma declaração no build-worker: filas duráveis e mensagens rejeitadas vão para a DLQ
export const DLQ = "builds.dlq"
export const queueOptions = {
    durable: true,
    arguments: { "x-dead-letter-exchange": "", "x-dead-letter-routing-key": DLQ }
}

let channel: Promise<ConfirmChannel> | null = null

// conexão preguiçosa: o serviço sobe mesmo sem o rabbit; se a conexão cair, reconecta no próximo publish
function getChannel(): Promise<ConfirmChannel> {
    if (!channel) {
        channel = (async () => {
            const connection = await amqp.connect(RABBIT_URL)
            connection.on("close", () => { channel = null })
            connection.on("error", (err) => { log().warn({ err: err.message }, "rabbitmq: erro de conexão") })
            const ch = await connection.createConfirmChannel()
            await ch.assertQueue(DLQ, { durable: true })
            for (const kind of KINDS) {
                await ch.assertQueue(kind, queueOptions)
            }
            return ch
        })()
        channel.catch(() => { channel = null })
    }
    return channel
}

// o correlation id da requisição viaja dentro da mensagem até o worker
export async function publish(message: BuildMessage): Promise<void> {
    const ch = await getChannel()
    const id = correlationId()
    const body = { ...message, ...(id ? { correlation_id: id } : {}) }
    ch.sendToQueue(message.kind, Buffer.from(JSON.stringify(body)), {
        persistent: true,
        contentType: "application/json",
        ...(id ? { correlationId: id } : {})
    })
    await ch.waitForConfirms()
    log().info({ build_id: message.build_id, queue: message.kind }, "build publicado na fila")
}

export async function ping(): Promise<void> {
    const ch = await getChannel()
    await ch.checkQueue(KINDS[0]!)
}
