# SLOs e respectivos SLIs propostos

> Proposta escrita pelo grupo sobre o commit original e adotada como o SLO de consulta de metadados do projeto. Executada em 2026-10-30 com [`testes/slo-source.js`](../testes/slo-source.js). Os demais SLOs (leitura de conteúdo, página e compilação) estão em [`arquitetura.md`](arquitetura.md#7-requisitos-não-funcionais-e-slos) e [`resultados-carga.md`](resultados-carga.md).

## Escopo e condições

Metas iniciais propostas para um experimento acadêmico local; não são resultados medidos nem promessa de produção. Foram acordadas antes da execução e não foram alteradas depois dela.

- Endpoint: GET http://localhost:3002/source/{id}, com UUID de uma fonte previamente cadastrada.
- Base: 100 fontes cadastradas pelo próprio teste (`setup`), com conteúdo textual de aproximadamente 1 KiB por fonte. Um dos IDs é sorteado a cada requisição.
- Topologia: a do `docker-compose.yml` no momento da execução. **Diferença em relação à proposta original**, que previa uma instância de cada serviço e uma instância PostgreSQL: hoje o endpoint passa pelo `source-lb` (nginx) com **2 réplicas** do source-service e um banco próprio (`postgres-sources`), conforme os ADR-006 e ADR-007.
- Aquecimento de 30 segundos, excluído dos resultados (cenário `aquecimento`, tag `fase:aquecimento`).
- Janela de medição de 5 minutos, com taxa de chegada constante de 20 requisições por segundo: 6.000 requisições planejadas (executor `constant-arrival-rate`).
- Gerador com concorrência suficiente para sustentar essa taxa (até 100 VUs). Requisições não iniciadas por falta de capacidade aparecem como `dropped_iterations`.
- Timeout de 2 segundos por requisição.
- Ambiente registrado abaixo. O gerador estava na mesma máquina que o sistema.

| SLI | Como medir | SLO proposto |
|---|---|---|
| Latência HTTP p50 | Tempo do cliente entre iniciar a requisição e receber a resposta completa, percentil 50 | Até 100 ms |
| Latência HTTP p95 | Mesmo indicador, percentil 95 | Até 300 ms |
| Latência HTTP p99 | Mesmo indicador, percentil 99 | Até 800 ms |
| Taxa de sucesso | Respostas HTTP 200 com JSON válido e id igual ao solicitado / 6.000 requisições planejadas | Pelo menos 99% |
| Throughput útil | Número de respostas válidas de sucesso / 300 segundos | Pelo menos 19,8 respostas por segundo |

As metas de taxa de sucesso e throughput útil são duas formas de expressar a mesma exigência nesse cenário de taxa fixa. O throughput total de respostas, incluindo erros, também é registrado, para não confundir volume com qualidade.

Os percentis usam todas as requisições iniciadas, inclusive respostas de erro; timeouts e erros de rede são contados à parte. Os percentis são sempre avaliados junto da taxa de sucesso: falhar rápido não significa bom desempenho. Requisições não iniciadas contam como falha na taxa de sucesso e não recebem uma latência inventada.

## Limites da conclusão

Esse endpoint mede a consulta de metadados no source-service e no PostgreSQL. Ele não chama o blob-service e não valida a performance do fluxo completo de recuperação de conteúdo. A medição de um endpoint atende ao mínimo descrito no plano; a integração com o blob (`GET /content/{nome}/1`, conferindo o conteúdo retornado) é medida no teste misto de [`resultados-carga.md`](resultados-carga.md).

A taxa de sucesso em cinco minutos é um indicador experimental. Não equivale a comprovar disponibilidade mensal de 99% nem qualquer SLA de produção. Uma meta operacional de disponibilidade temporal precisaria de janela maior e monitoramento contínuo.

## Ambiente da execução

| Item | Valor |
|---|---|
| Data | 2026-10-30 |
| Commit | `4162aa9` (branch `feat/arquitetura-completa`) |
| Máquina | Intel Core i5-13450HX, 16 threads, 31 GB de RAM, Linux 7.0 |
| Docker | 29.6.1, Compose v5.3.1 |
| Ferramenta de carga | k6 v2.3.0 (imagem `grafana/k6`), na mesma máquina: disputa CPU com os serviços |
| Containers | 20 (source-service ×2 atrás de nginx, blob-service ×2 atrás de nginx, workspace, assemblage, 2 workers, 4 Postgres, RabbitMQ, Alloy/Loki/Grafana); sem limite de CPU/memória nos serviços HTTP, workers com 512 MB / 1 CPU |
| Comando | `docker run --rm -i --network host --user "$(id -u):$(id -g)" -v "$PWD/testes/resultados:/out" grafana/k6 run - < testes/slo-source.js` |
| Saída original | [`testes/resultados/slo-source-saida.txt`](../testes/resultados/slo-source-saida.txt) e [`slo-source-resultado.json`](../testes/resultados/slo-source-resultado.json) |

## Relatório

| Resultado | Valor observado | Meta | Atendeu? |
|---|---|---|---|
| p50 | 1,33 ms | <= 100 ms | Sim |
| p95 | 1,64 ms | <= 300 ms | Sim |
| p99 | 1,81 ms | <= 800 ms | Sim |
| Taxa de sucesso | 100,00 % | >= 99% | Sim |
| Throughput útil | 20,00 resp/s | >= 19,8/s | Sim |

| Contagem | Valor |
|---|---|
| Planejadas | 6.000 |
| Iniciadas | 6.000  |
| Concluídas com resposta válida (200 + JSON + id igual) | 6.000 |
| Erros por status | 0 |
| Timeouts | 0 |
| Erros de rede | 0 |
| Não iniciadas por falta de capacidade | 0 |
| Latência máxima | 6,33 ms |
| Throughput total | 20,00 resp/s |

**Conclusão:** nesse cenário, **todos os SLOs propostos foram atendidos**, com folga de duas ordens de grandeza nos percentis (p99 de 1,81 ms contra 800 ms). A folga vem de um caminho curto: uma consulta por chave primária no Postgres, atrás de um nginx, em rede local e com o gerador na mesma máquina. Respeitando o que a proposta já previa, isso **não** comprova o fluxo completo de conteúdo (medido à parte) nem disponibilidade mensal. As metas não foram apertadas com base neste resultado: elas valem para uma rede real e precisariam de revisão com dados de produção.
