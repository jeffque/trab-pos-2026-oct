// Teste do SLO de consulta de metadados, seguindo o protocolo de docs/slos.md:
//   - GET http://localhost:3002/source/{id}, id sorteado entre 100 fontes de ~1 KiB
//   - 30 s de aquecimento (fora do resultado) + 5 min a 20 req/s constantes = 6.000 planejadas
//   - timeout de 2 s; sucesso = HTTP 200 + JSON válido + id igual ao pedido
//
//   docker run --rm -i --network host -v "$PWD/testes:/out" grafana/k6 run - < testes/slo-source.js
//
// O resumo vai para a saída e para testes/slo-source-resultado.json.

import http from "k6/http";
import { check } from "k6";
import { Counter, Rate } from "k6/metrics";

const SOURCE = __ENV.SOURCE_URL || "http://localhost:3002";
const FONTES = 100;
const TAXA = 20;            // req/s
const MEDICAO_S = 300;      // 5 min
const PLANEJADAS = TAXA * MEDICAO_S;

const validas = new Counter("respostas_validas");
const sucesso = new Rate("taxa_sucesso");
const timeouts = new Counter("timeouts");
const errosRede = new Counter("erros_rede");

export const options = {
    summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max", "count"],
    scenarios: {
        aquecimento: {
            executor: "constant-arrival-rate", exec: "consulta", rate: TAXA, timeUnit: "1s",
            duration: "30s", preAllocatedVUs: 20, maxVUs: 100, tags: { fase: "aquecimento" },
        },
        medicao: {
            executor: "constant-arrival-rate", exec: "consulta", rate: TAXA, timeUnit: "1s",
            duration: `${MEDICAO_S}s`, startTime: "30s", preAllocatedVUs: 20, maxVUs: 100, tags: { fase: "medicao" },
        },
    },
    thresholds: {
        "http_req_duration{fase:medicao}": ["med<=100", "p(95)<=300", "p(99)<=800"],
        "taxa_sucesso{fase:medicao}": ["rate>=0.99"],
        // só para o resumo separar a fase de medição (sempre passam)
        "http_reqs{fase:medicao}": ["count>=0"],
        "respostas_validas{fase:medicao}": ["count>=0"],
        "timeouts{fase:medicao}": ["count>=0"],
        "erros_rede{fase:medicao}": ["count>=0"],
        "dropped_iterations{scenario:medicao}": ["count>=0"],
    },
};

function conteudo(i) {
    // ~1 KiB de texto C por fonte
    let s = `/* fonte ${i} do teste de SLO */\n#include <stdio.h>\n\n`;
    let n = 0;
    while (s.length < 1000) {
        s += `int f${i}_${n}(int x) { return x * ${n + 1} + ${i}; }\n`;
        n++;
    }
    return s;
}

export function setup() {
    const stamp = Date.now();
    const ids = [];
    for (let i = 0; i < FONTES; i++) {
        const res = http.post(`${SOURCE}/source`, JSON.stringify({ filename: `slo-${stamp}-${i}.c`, content: conteudo(i) }), {
            headers: { "Content-Type": "application/json", "X-Correlation-ID": `slo-setup-${i}` },
        });
        if (res.status !== 201) {
            throw new Error(`setup falhou na fonte ${i}: ${res.status} ${res.body}. O ambiente está de pé? (docker compose ps)`);
        }
        ids.push(res.json("id"));
    }
    return { ids };
}

export function consulta(data) {
    const id = data.ids[Math.floor(Math.random() * data.ids.length)];
    const res = http.get(`${SOURCE}/source/${id}`, {
        timeout: "2s",
        headers: { "X-Correlation-ID": `slo-${__VU}-${__ITER}` },
    });

    if (res.error_code === 1050) {
        timeouts.add(1);
    } else if (res.status === 0) {
        errosRede.add(1);
    }

    let ok = false;
    if (res.status === 200) {
        try {
            ok = res.json("id") === id;
        } catch (e) {
            ok = false;
        }
    }
    sucesso.add(ok);
    if (ok) {
        validas.add(1);
    }
    check(res, { "200 + JSON válido + id igual": () => ok });
}

// relatório no formato da tabela de docs/slos.md
export function handleSummary(data) {
    const m = (name) => data.metrics[name];
    const dur = m("http_req_duration{fase:medicao}")?.values ?? {};
    const reqs = m("http_reqs{fase:medicao}")?.values?.count ?? 0;
    const valid = m("respostas_validas{fase:medicao}")?.values?.count ?? 0;
    const dropped = m("dropped_iterations{scenario:medicao}")?.values?.count ?? 0;
    const tout = m("timeouts{fase:medicao}")?.values?.count ?? 0;
    const rede = m("erros_rede{fase:medicao}")?.values?.count ?? 0;
    const resultado = {
        planejadas: PLANEJADAS,
        iniciadas: reqs,
        nao_iniciadas: dropped,
        respostas_validas: valid,
        timeouts: tout,
        erros_rede: rede,
        p50_ms: dur.med, p95_ms: dur["p(95)"], p99_ms: dur["p(99)"], max_ms: dur.max,
        taxa_sucesso: valid / PLANEJADAS,
        throughput_util_por_s: valid / MEDICAO_S,
        throughput_total_por_s: reqs / MEDICAO_S,
    };
    const f = (x, d = 2) => (x === undefined ? "?" : Number(x).toFixed(d));
    const texto = `
RESULTADO (fase de medição, ${MEDICAO_S} s a ${TAXA} req/s)
  planejadas ........ ${PLANEJADAS}
  iniciadas ......... ${reqs}
  não iniciadas ..... ${dropped}
  respostas válidas . ${valid}
  timeouts / rede ... ${tout} / ${rede}
  p50 / p95 / p99 ... ${f(dur.med)} / ${f(dur["p(95)"])} / ${f(dur["p(99)"])} ms (máx ${f(dur.max)} ms)
  taxa de sucesso ... ${f(100 * resultado.taxa_sucesso, 2)} %
  throughput útil ... ${f(resultado.throughput_util_por_s, 2)} resp/s (total ${f(resultado.throughput_total_por_s, 2)} resp/s)
`;
    return {
        stdout: texto,
        "/out/slo-source-resultado.json": JSON.stringify({ resultado, metricas: data.metrics }, null, 2),
    };
}
