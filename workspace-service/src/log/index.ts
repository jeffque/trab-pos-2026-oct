import { pino } from "pino";
import type { Logger } from "pino";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import type { Request, Response, NextFunction } from "express";

// Log estruturado (JSON, uma linha por evento) com Correlation ID.
// O ID chega no header X-Correlation-ID (ou é criado aqui), fica guardado durante
// a requisição inteira e é repassado em toda chamada a outro serviço.

export const SERVICE = "workspace-service"
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

const VALID_ID = /^[\w.-]{1,64}$/

export function correlation(req: Request, res: Response, next: NextFunction) {
    const incoming = req.header(CORRELATION_HEADER)
    const id = incoming && VALID_ID.test(incoming) ? incoming : randomUUID()
    res.setHeader(CORRELATION_HEADER, id)

    const started = process.hrtime.bigint()
    withCorrelation(id, () => {
        const logger = log()
        res.on("finish", () => {
            if (req.path.startsWith("/health")) {
                return
            }
            const fields = {
                method: req.method,
                path: req.originalUrl,
                status: res.statusCode,
                duration_ms: Math.round(Number(process.hrtime.bigint() - started) / 1e4) / 100
            }
            if (res.statusCode >= 500) {
                logger.error(fields, "requisição")
            } else {
                logger.info(fields, "requisição")
            }
        })
        next()
    })
}
