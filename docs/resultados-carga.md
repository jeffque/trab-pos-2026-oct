# Resultados do teste de carga

Script: [`testes/carga.js`](../testes/carga.js) (k6). SLOs: [arquitetura.md, seção 7](arquitetura.md#7-requisitos-não-funcionais-e-slos). O SLO de consulta de metadados, com o protocolo proposto pelo grupo, tem relatório próprio em [`slos.md`](slos.md).

```bash
docker compose up --build -d          # ambiente completo, todos healthy
docker run --rm -i --network host grafana/k6 run - < testes/carga.js
```

## Ambiente da medição

- Data: 2026-10-30. Topologia completa do `docker-compose.yml` (20 containers): 2 réplicas de source-service e blob-service atrás de nginx, workspace-service e assemblage-service, 1 worker por fila, um Postgres por serviço, stack de logs ligada.
- Máquina: Intel Core i5-13450HX (16 threads), 31 GB RAM, Linux. **O k6 rodou na mesma máquina que o sistema**: não há latência de rede real entre cliente e servidor, e o k6 compete por CPU com os serviços.

## Cenários

| Cenário | Endpoint (tag) | Carga | O que exercita |
|---|---|---|---|
| `leitura` | `GET /content/:nome/1` no source-lb (`conteudo`) | rampa até **50 req/s** (2,5x o pico estimado), 70 s | source-lb → source-service → blob-lb → blob-service → 2 bancos |
| `pagina` | `GET /source/:id` no BFF (`pagina`) | **10 req/s**, 60 s | BFF → source-lb → source-service (+ blob) + workspace-service + renderização |
| `builds` | cria workspace, inclui `.c` + `.h`, `POST /workspaces/:id/compilar` e polling do status | **2 compilações/s**, 40 s | workspace-service → fila `compila` → compila-worker (gcc -c) → blob → evento `compilacao.resultado` → workspace-service |

## Resultados

Total: **3.808 requisições**, **0 falhas**, **3.644/3.644 checks ok**, todos os thresholds aprovados.

### Latência (ms)

| Endpoint | Requisições | p50 | p90 | p95 | p99 | máx | SLO | Aderência |
|---|---|---|---|---|---|---|---|---|
| Leitura de conteúdo | 2.800 | 2,27 | 2,82 | **3,04** | **3,63** | 12,96 | p95 < 100, p99 < 250 | ✅ ~33x de folga no p95 |
| Página no BFF | 601 | 9,82 | 12,76 | **13,66** | **14,94** | 27,99 | p95 < 200, p99 < 500 | ✅ ~15x de folga no p95 |

### Taxa de erro

| Endpoint | Falhas | SLO | Aderência |
|---|---|---|---|
| Leitura de conteúdo | 0 / 2.800 (0 %) | < 1 % | ✅ |
| Página no BFF | 0 / 601 (0 %) | < 1 % | ✅ |

### Compilação de workspaces (assíncrona)

Tempo real de cada compilação, do pedido até o evento "compilei" vincular o objeto (`compiled_at - queued_at` no banco do workspace-service, workspaces criados pelo k6):

| Workspaces | Compilados | p50 | p95 | p99 | SLO | Aderência |
|---|---|---|---|---|---|---|
| 81 (`.c` + `.h` cada) | 81 | 24,2 ms | **27,9 ms** | 31,3 ms | 95 % < 5 s | ✅ |

Do ponto de vista do cliente (k6 consultando a cada 200 ms), o tempo até ver `compilado` foi p95 = 205 ms. A diferença é a granularidade do polling, não o processamento: o mesmo vale para a interface, que consulta a cada 1 s. Fora da carga, uma assemblagem de dois objetos (linkagem estática) levou 62 ms do pedido ao evento de volta.

### Throughput e limite (teste de estresse)

Para achar o limite, rodamos um teste extra só de leitura de conteúdo com rampa **200 → 400 → 800 req/s** (90 s):

| Requisições | Throughput médio | Falhas | p50 | p95 | p99 | máx |
|---|---|---|---|---|---|---|
| 36.376 | 404 req/s (pico de 800 req/s) | **0** | 1,25 ms | 1,90 ms | 2,32 ms | 17,7 ms |

**O sistema não saturou a 800 req/s**, 40x o pico estimado. O limite real fica acima disso nesta máquina.

## Conclusão sobre os SLOs

1. **Todos os SLOs foram atendidos** com folga de uma ordem de grandeza: leitura p95 de 3 ms (SLO 100 ms), página p95 de 14 ms (SLO 200 ms), 0 % de erro (SLO < 1 %) e compilação de workspace com p95 de 28 ms (SLO 5 s).
2. **A folga existe porque o caminho é curto e os dados são pequenos:** arquivos de poucas centenas de bytes, Postgres com dados em memória e rede local. Os SLOs foram definidos pensando em produção (rede real, arquivos maiores, banco frio), então **não vamos apertá-los** só com base neste ambiente. A regra da Aula 3 vale: começar conservador e revisar com dados reais.
3. **A latência é dominada pelos saltos, não pelo processamento:** a página do BFF (BFF → source-lb → source → blob-lb → blob, mais a consulta ao workspace-service) custa ~4x a leitura direta no source-lb. Esse é o custo da composição de serviços síncronos (ADR-003) e é o primeiro lugar para olhar se a latência crescer.
4. **A compilação assíncrona cumpre o objetivo do ADR-011:** durante o teste, 81 workspaces foram compilados junto com a leitura sem afetar a latência dela (p99 de 3,6 ms).
5. **Riscos não cobertos por esta medição:** latência de rede real, arquivos grandes (o `BYTEA` serializado em JSON no blob-service deve degradar com MB, ver ADR-010), compilações pesadas (código que leva segundos para compilar, onde o número de workers vira o limite) e falha de componentes únicos (LBs, bancos, RabbitMQ).

## Como acompanhar a carga nos logs

Toda requisição do k6 leva `X-Correlation-ID: k6-<cenário>-<vu>-<iteração>`. No Grafana (http://localhost:3003, dashboard "Logs"), digite `k6-build` no campo Correlation ID para ver só as compilações do teste passando por todos os serviços, inclusive o evento de volta.
