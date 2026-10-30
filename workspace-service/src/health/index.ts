import express from "express";
import { SERVICE, INSTANCE } from "../log/index.js";

// /health/live: o processo está de pé (liveness)
// /health e /health/ready: o serviço consegue atender, checando as dependências (readiness).
// Dependência crítica fora do ar -> 503 "fail"; não crítica -> 200 "degraded".

type CheckResult = { status: "ok" | "fail", critical: boolean, latency_ms: number, error?: string }
export type Dependency = { critical: boolean, run: () => Promise<unknown> }

const TIMEOUT_MS = 2000
const started = Date.now()

async function runCheck(dep: Dependency): Promise<CheckResult> {
    const begin = Date.now()
    try {
        await Promise.race([
            dep.run(),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`sem resposta em ${TIMEOUT_MS} ms`)), TIMEOUT_MS))
        ])
        return { status: "ok", critical: dep.critical, latency_ms: Date.now() - begin }
    } catch (err) {
        return { status: "fail", critical: dep.critical, latency_ms: Date.now() - begin, error: err instanceof Error ? err.message : String(err) }
    }
}

export async function httpPing(url: string): Promise<void> {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
    }
}

export function healthRouter(dependencies: Record<string, Dependency>) {
    const router = express.Router()

    router.get("/health/live", (req, res) => {
        res.send({ status: "ok", service: SERVICE, instance: INSTANCE, uptime_s: Math.round((Date.now() - started) / 1000) })
    })

    router.get([ "/health", "/health/ready" ], async (req, res) => {
        const names = Object.keys(dependencies)
        const results = await Promise.all(names.map(name => runCheck(dependencies[name]!)))
        const checks = Object.fromEntries(names.map((name, i) => [ name, results[i] ]))
        const criticalDown = results.some(r => r.status == "fail" && r.critical)
        const anyDown = results.some(r => r.status == "fail")
        res.status(criticalDown ? 503 : 200).send({
            status: criticalDown ? "fail" : anyDown ? "degraded" : "ok",
            service: SERVICE,
            instance: INSTANCE,
            uptime_s: Math.round((Date.now() - started) / 1000),
            checks
        })
    })

    return router
}
