import { pino } from "pino";
import type { Logger } from "pino";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

// Log estruturado (JSON, uma linha por evento) com Correlation ID.
// O ID chega no header X-Correlation-ID (ou é criado aqui), fica guardado durante
// a requisição inteira e é repassado em toda chamada a outro serviço.

export const SERVICE = "build-worker"
export const INSTANCE = hostname()
export const CORRELATION_HEADER = "X-Correlation-ID"

const root = pino({
    level: process.env.LOG_LEVEL ?? "info",
    base: { service: SERVICE, instance: INSTANCE },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) }
})

const storage = new AsyncLocalStorage<{ correlationId: string, logger: Logger }>()

export function correlationId(): string | undefined {
    return storage.getStore()?.correlationId
}

// logger da requisição atual (já carrega o correlation_id) ou o logger raiz
export function log(): Logger {
    return storage.getStore()?.logger ?? root
}

export function withCorrelation<T>(id: string, fn: () => T): T {
    return storage.run({ correlationId: id, logger: root.child({ correlation_id: id }) }, fn)
}

// cabeçalhos para chamadas a outros serviços, propagando o ID
export function correlationHeaders(headers?: HeadersInit): Headers {
    const result = new Headers(headers)
    const id = correlationId()
    if (id) {
        result.set(CORRELATION_HEADER, id)
    }
    return result
}

