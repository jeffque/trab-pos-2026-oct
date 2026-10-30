import init from "../env/index.js";
import amqp from "amqplib";
import type { ConfirmChannel, ConsumeMessage } from "amqplib";
import { log, correlationId, withCorrelation } from "../log/index.js";

init();

const RABBIT_URL = process.env.RABBIT_URL ?? "amqp://localhost"

// Filas de trabalho (pedidos para os workers) e de eventos (resultados que voltam).
// A declaração precisa ser idêntica em todos os serviços, senão o rabbit recusa (PRECONDITION_FAILED).
export const QUEUES = {
    compila: "compila",
    assembla: "assembla",
    compilado: "compilacao.resultado",
    assemblado: "assemblagem.resultado"
} as const

export const DLQ = "builds.dlq"
export const queueOptions = {
    durable: true,
    arguments: { "x-dead-letter-exchange": "", "x-dead-letter-routing-key": DLQ }
}

async function declare(ch: amqp.Channel) {
    await ch.assertQueue(DLQ, { durable: true })
    for (const q of Object.values(QUEUES)) {
        await ch.assertQueue(q, queueOptions)
    }
}

let channel: Promise<ConfirmChannel> | null = null

// conexão preguiçosa para publicar: o serviço sobe mesmo sem o rabbit e reconecta no próximo publish
function getChannel(): Promise<ConfirmChannel> {
    if (!channel) {
        channel = (async () => {
            const connection = await amqp.connect(RABBIT_URL)
            connection.on("close", () => { channel = null })
            connection.on("error", (err) => { log().warn({ err: err.message }, "rabbitmq: erro de conexão") })
            const ch = await connection.createConfirmChannel()
            await declare(ch)
            return ch
        })()
        channel.catch(() => { channel = null })
    }
    return channel
}

// o correlation id da requisição viaja dentro da mensagem
export async function publish(queue: string, message: object): Promise<void> {
    const ch = await getChannel()
    const id = correlationId()
    const body = { ...message, ...(id ? { correlation_id: id } : {}) }
    ch.sendToQueue(queue, Buffer.from(JSON.stringify(body)), {
        persistent: true,
        contentType: "application/json",
        ...(id ? { correlationId: id } : {})
    })
    await ch.waitForConfirms()
    log().info({ queue }, "mensagem publicada")
}

export async function ping(): Promise<void> {
    const ch = await getChannel()
    await ch.checkQueue(QUEUES.compila)
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// consome uma fila de eventos com reconexão; cada mensagem roda no contexto do seu correlation id
export async function consume(queue: string, handler: (message: any) => Promise<void>) {
    for (;;) {
        try {
            const connection = await amqp.connect(RABBIT_URL)
            connection.on("error", (err) => log().warn({ err: err.message }, "rabbitmq: erro de conexão (consumidor)"))
            const ch = await connection.createChannel()
            await declare(ch)
            await ch.prefetch(1)
            await ch.consume(queue, (m: ConsumeMessage | null) => {
                if (!m) {
                    return
                }
                let message: any
                try {
                    message = JSON.parse(m.content.toString())
                } catch {
                    log().error({ queue }, "evento ilegível, enviado para a DLQ")
                    return ch.nack(m, false, false)
                }
                const id = message.correlation_id ?? m.properties.correlationId ?? "sem-correlation-id"
                withCorrelation(id, async () => {
                    try {
                        await handler(message)
                        ch.ack(m)
                    } catch (err) {
                        log().error({ queue, err }, "falha ao processar evento, enviado para a DLQ")
                        ch.nack(m, false, false)
                    }
                })
            })
            log().info({ queue }, "consumindo eventos")
            await new Promise(resolve => connection.on("close", resolve))
            log().warn({ queue }, "conexão com o rabbitmq perdida (consumidor)")
        } catch (err) {
            log().warn({ queue, err: err instanceof Error ? err.message : String(err) }, "rabbitmq indisponível, nova tentativa em 2 s")
        }
        await sleep(2000)
    }
}
