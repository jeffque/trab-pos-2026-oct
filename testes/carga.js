// Teste de carga (k6) dos SLOs definidos em docs/arquitetura.md, seção 7.
//
//   docker run --rm -i --network host grafana/k6 run - < testes/carga.js
//
// Cada requisição leva um X-Correlation-ID "k6-...", então a carga pode ser
// filtrada no Grafana (dashboard "Logs", Correlation ID = k6).

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";

const SOURCE = __ENV.SOURCE_URL || "http://localhost:3002";
const WORKSPACE = __ENV.WORKSPACE_URL || "http://localhost:3004";
const BFF = __ENV.BFF_URL || "http://localhost:3000";

// tempo entre pedir a compilação do workspace e ver o objeto vinculado
// (fila compila + gcc + blob + evento compilacao.resultado)
const buildTurnaround = new Trend("build_turnaround", true);

export const options = {
    summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
    scenarios: {
        // leitura de conteúdo: passa por source-lb, source-service, blob-lb e blob-service
        leitura: {
            executor: "ramping-arrival-rate",
            exec: "leitura",
            startRate: 5,
            timeUnit: "1s",
            preAllocatedVUs: 20,
            maxVUs: 100,
            stages: [
                { target: 50, duration: "20s" },   // sobe até 50 req/s (2,5x o pico estimado)
                { target: 50, duration: "40s" },   // sustenta
                { target: 0, duration: "10s" },
            ],
        },
        // página do arquivo no BFF (renderização + chamadas ao source)
        pagina: {
            executor: "constant-arrival-rate",
            exec: "pagina",
            rate: 10,
            timeUnit: "1s",
            duration: "60s",
            preAllocatedVUs: 10,
            maxVUs: 40,
            startTime: "5s",
        },
        // compilação assíncrona: cada iteração monta um workspace (.c + .h), compila e acompanha
        builds: {
            executor: "constant-arrival-rate",
            exec: "build",
            rate: 2,
            timeUnit: "1s",
            duration: "40s",
            preAllocatedVUs: 10,
            maxVUs: 40,
            startTime: "10s",
        },
    },
    thresholds: {
        "http_req_duration{endpoint:conteudo}": ["p(95)<100", "p(99)<250"],
        "http_req_failed{endpoint:conteudo}": ["rate<0.01"],
        "http_req_duration{endpoint:pagina}": ["p(95)<200", "p(99)<500"],
        "http_req_failed{endpoint:pagina}": ["rate<0.01"],
        "build_turnaround": ["p(95)<5000"],
        "checks": ["rate>0.99"],
    },
};

const HEADER = `#ifndef CALC_H
#define CALC_H
int soma(int a, int b);
#endif
`;

const CODIGO = `#include <stdio.h>
#include "calc.h"

int soma(int a, int b) {
    return a + b;
}

int main(void) {
    for (int i = 0; i < 10; i++)
        printf("%d + %d = %d\\n", i, i, soma(i, i));
    return 0;
}
`;

function headers(tag, extra) {
    // no setup() não existe __ITER
    const iter = typeof __ITER === "undefined" ? 0 : __ITER;
    return Object.assign({ "X-Correlation-ID": `k6-${tag}-${__VU}-${iter}` }, extra || {});
}

// cria os arquivos do teste (nomes únicos, para poder rodar várias vezes)
export function setup() {
    const stamp = Date.now();
    const criar = (filename, content) => {
        const res = http.post(`${SOURCE}/source`, JSON.stringify({ filename, content }), {
            headers: headers("setup", { "Content-Type": "application/json" }),
        });
        if (res.status !== 201) {
            throw new Error(`setup falhou: ${res.status} ${res.body}. O ambiente está de pé? (docker compose ps)`);
        }
        return res.json("id");
    };
    // o .h precisa se chamar calc.h por causa do #include; se já existir, reaproveita
    let headerId = null;
    const lista = http.get(`${SOURCE}/source`).json();
    const existente = lista.find((s) => s.name === "calc.h");
    headerId = existente ? existente.id : criar("calc.h", HEADER);
    const name = `carga-${stamp}.c`;
    return { id: criar(name, CODIGO), name, headerId, stamp };
}

export function leitura(data) {
    const res = http.get(`${SOURCE}/content/${data.name}/1`, {
        headers: headers("leitura"),
        tags: { endpoint: "conteudo" },
    });
    check(res, { "conteúdo 200": (r) => r.status === 200 && r.body.includes("soma") });
}

export function pagina(data) {
    const res = http.get(`${BFF}/source/${data.id}`, {
        headers: headers("pagina"),
        tags: { endpoint: "pagina" },
    });
    check(res, { "página 200": (r) => r.status === 200 && r.body.includes(data.name) });
}

export function build(data) {
    const json = { "Content-Type": "application/json" };
    const ws = http.post(`${WORKSPACE}/workspaces`, JSON.stringify({ name: `k6-${data.stamp}-${__VU}-${__ITER}` }), {
        headers: headers("build", json), tags: { endpoint: "workspace_criar" },
    });
    if (!check(ws, { "workspace criado (201)": (r) => r.status === 201 })) {
        return;
    }
    const wsId = ws.json("id");
    for (const sourceId of [data.id, data.headerId]) {
        http.post(`${WORKSPACE}/workspaces/${wsId}/files`, JSON.stringify({ source_id: sourceId }), {
            headers: headers("build", json), tags: { endpoint: "workspace_incluir" },
        });
    }
    const started = Date.now();
    const res = http.post(`${WORKSPACE}/workspaces/${wsId}/compilar`, null, {
        headers: headers("build"), tags: { endpoint: "workspace_compilar" },
    });
    if (!check(res, { "compilação aceita (202)": (r) => r.status === 202 })) {
        return;
    }

    // acompanha como a interface faz (polling), por até 20 s
    for (let i = 0; i < 100; i++) {
        sleep(0.2);
        const st = http.get(`${WORKSPACE}/workspaces/${wsId}`, {
            headers: headers("build"), tags: { endpoint: "workspace_status" },
        });
        const status = st.status === 200 ? st.json("status") : null;
        if (status && status !== "na_fila") {
            buildTurnaround.add(Date.now() - started);
            check(status, { "workspace compilado": (s) => s === "compilado" });
            return;
        }
    }
    check(null, { "workspace compilado": () => false });
}
