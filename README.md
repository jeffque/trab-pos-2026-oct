# Registro de Fontes

Uma toolchain C em microsserviços: **fontes** `.c`/`.h` com histórico de revisões, **workspaces** que compilam um conjunto de fontes num arquivo objeto (`.o`) e **assemblagens** que linkam objetos num executável. Compilar e linkar são assíncronos (RabbitMQ), com o resultado voltando por evento. Construída para a disciplina *Arquitetura de Microsserviços e Escalabilidade* (Pós Unifor 2026.2).

- Arquitetura, SLOs, observabilidade e segurança: [`docs/arquitetura.md`](docs/arquitetura.md)
- Decisões arquiteturais: [`docs/ADR-001.md`](docs/ADR-001.md) … [`docs/ADR-012.md`](docs/ADR-012.md)
- SLOs e testes de carga: [`docs/slos.md`](docs/slos.md) (protocolo do grupo, [`testes/slo-source.js`](testes/slo-source.js)) e [`docs/resultados-carga.md`](docs/resultados-carga.md) ([`testes/carga.js`](testes/carga.js))

## Membros do grupo

| Nome | GitHub |
|---|---|
| _a preencher_ | |

## Como rodar

Pré-requisito: Docker com Compose v2. As portas 3000 a 3005 e 15672 precisam estar livres.

```bash
docker compose up --build
```

Na primeira vez demora alguns minutos (instalação das dependências e do gcc nos workers). Quando os serviços ficarem `healthy` (`docker compose ps`), acesse:

| O quê | Endereço |
|---|---|
| **Aplicação** | http://localhost:3000 |
| Logs centralizados (Grafana, dashboard "Logs") | http://localhost:3003 |
| Painel do RabbitMQ (guest / guest) | http://localhost:15672 |
| API do source-service (via load balancer) | http://localhost:3002 |
| API do blob-service (via load balancer) | http://localhost:3001 |
| API do workspace-service | http://localhost:3004 |
| API do assemblage-service | http://localhost:3005 |

Parar e apagar tudo (os dados não são persistidos): `docker compose down`.

## Serviços

```
navegador → bff ─┬→ source-lb → source-service ×2 → postgres-sources
                 ├→ workspace-service → postgres-workspaces
                 └→ assemblage-service → postgres-assemblages
source-service e workers → blob-lb → blob-service ×2 → postgres-blob

workspace-service  ── fila compila  ──→ compila-worker  ── evento compilacao.resultado ──→ workspace-service
assemblage-service ── fila assembla ──→ assembla-worker ── evento assemblagem.resultado ──→ assemblage-service

logs: todos os containers → alloy → loki → grafana
```

| Pasta | Serviço | Responsabilidade |
|---|---|---|
| [`bff/`](bff) | `bff` | Interface web (Express + Liquid + HTMX) |
| [`source-service/`](source-service) | `source-service` | Fontes e revisões |
| [`workspace-service/`](workspace-service) | `workspace-service` | Workspaces (fontes em revisões fixas → arquivo objeto) |
| [`assemblage-service/`](assemblage-service) | `assemblage-service` | Assemblagens (objetos → executável) |
| [`blob-service/`](blob-service) | `blob-service` | Armazenamento de bytes opacos por UUID |
| [`build-worker/`](build-worker) | `compila-worker`, `assembla-worker` | Consomem as filas, rodam gcc/ld e publicam o evento de resultado |
| [`load-balancer/`](load-balancer) | `source-lb`, `blob-lb` | nginx com round-robin entre réplicas |
| [`postgres-schemas/`](postgres-schemas) | `postgres-*` | Criação dos schemas/tabelas de cada banco |
| [`observability/`](observability) | `alloy`, `loki`, `grafana` | Coleta e consulta de logs |

## Endpoints

Todos os serviços HTTP têm `GET /health/live` (processo de pé) e `GET /health/ready` (dependências, com latência de cada uma).

### source-service (`localhost:3002`)

| Método e rota | Descrição |
|---|---|
| `GET /source?page=N` | Lista arquivos (50 por página) |
| `POST /source` `{filename, content}` | Cria o arquivo na REV 1 → `201 {id, version}` |
| `GET /source/:id` | Nome e lista de revisões |
| `POST /source/:id/versions` `{content}` | Cria a REV n+1 → `201 {id, version}` |
| `GET /content/:nome/:rev` | Conteúdo de uma revisão |

### workspace-service (`localhost:3004`)

| Método e rota | Descrição |
|---|---|
| `GET /workspaces` (`?source_id=` filtra quem usa uma fonte) | Lista workspaces |
| `POST /workspaces` `{name}` | Cria em `rascunho` → `201` |
| `GET /workspaces/:id` | Estado, fontes fixadas, log do gcc |
| `POST /workspaces/:id/files` `{source_id, version?}` | Inclui (ou troca a revisão de) um `.c`/`.h`; sem `version` = última |
| `DELETE /workspaces/:id/files/:sourceId` | Remove uma fonte |
| `POST /workspaces/:id/compilar` | Workspace pronto → fila `compila` → `202` |
| `GET /workspaces/:id/objeto` | Arquivo objeto (`.o`) gerado |

### assemblage-service (`localhost:3005`)

| Método e rota | Descrição |
|---|---|
| `GET /assemblages` | Lista assemblagens |
| `POST /assemblages` `{name, workspace_ids}` | Linka os objetos de workspaces compilados → fila `assembla` → `202` |
| `GET /assemblages/:id` | Estado, objetos usados, log do linker |
| `GET /assemblages/:id/executavel` | Executável gerado |

### blob-service (`localhost:3001`)

| Método e rota | Descrição |
|---|---|
| `POST /blob` (corpo `application/octet-stream`) | Guarda bytes → `201 {id}` |
| `GET /blob?page=N` | Lista blobs |
| `GET /blob/:id` | Blob em JSON (com md5) |
| `GET /content/:id` | Bytes crus |

### bff (`localhost:3000`)

| Rota | Tela / ação |
|---|---|
| `GET /`, `/novo`, `/source/:id?rev=N` | Arquivos: registro, criação e prancha com o código (Ctrl+S salva nova revisão) |
| `GET /workspaces`, `/workspaces/novo`, `/workspaces/:id` | Workspaces: montar, fixar revisões e compilar |
| `GET /assemblagens`, `/assemblagens/novo`, `/assemblagens/:id` | Assemblagens: escolher objetos, linkar e baixar o executável |

### Exemplo pela API

```bash
# fontes
H=$(curl -s -X POST localhost:3002/source -H 'Content-Type: application/json' \
  -d '{"filename":"soma.h","content":"int soma(int a, int b);\n"}' | jq -r .id)
C=$(curl -s -X POST localhost:3002/source -H 'Content-Type: application/json' \
  -d '{"filename":"soma.c","content":"#include \"soma.h\"\nint soma(int a, int b) { return a + b; }\n"}' | jq -r .id)
# workspace: inclui as fontes e compila
W=$(curl -s -X POST localhost:3004/workspaces -H 'Content-Type: application/json' -d '{"name":"biblioteca"}' | jq -r .id)
curl -s -X POST localhost:3004/workspaces/$W/files -H 'Content-Type: application/json' -d "{\"source_id\":\"$C\"}"
curl -s -X POST localhost:3004/workspaces/$W/files -H 'Content-Type: application/json' -d "{\"source_id\":\"$H\"}"
curl -s -X POST localhost:3004/workspaces/$W/compilar
curl -s localhost:3004/workspaces/$W | jq .status          # "compilado"
# assemblagem: junte com um workspace que tenha main() e linke
curl -s -X POST localhost:3005/assemblages -H 'Content-Type: application/json' -d "{\"name\":\"programa\",\"workspace_ids\":[\"$W\",\"<workspace com main>\"]}"
```

## Roteiro da demonstração

1. `docker compose up --build` e `docker compose ps` (todos `healthy`).
2. **Arquivos**: criar `calc.h`, `calc.c` (funções) e `app.c` (com `main`); salvar uma REV 2 de `calc.c` (Ctrl+S).
3. **Workspaces**: `calc-lib` com `calc.c` + `calc.h`; `calc-app` com `app.c` + `calc.h`. Compilar os dois: "na fila" vira "compilado" quando o evento volta. Mostrar um workspace com erro do gcc.
4. **Assemblagens**: `calculadora` com os dois objetos → baixar o executável e rodar no terminal.
5. Clicar em **logs** numa compilação: o Grafana mostra o mesmo Correlation ID em bff, workspace-service, compila-worker, source-lb, source-service, blob-lb e blob-service, até o evento voltar.
6. Balanceamento e falha:
   ```bash
   for i in 1 2 3 4; do curl -sI localhost:3002/source | grep X-Upstream; done   # alterna entre réplicas
   docker stop trab-pos-2026-oct-source-service-1                              # a aplicação continua respondendo
   docker compose restart postgres-sources                                      # o serviço sobrevive ao reinício do banco
   curl -s localhost:3002/health/ready                                          # estado das dependências
   ```
7. Escala: `docker compose up -d --scale compila-worker=3` e o painel do RabbitMQ (filas de trabalho e de eventos).
8. Testes de carga:
   ```bash
   docker run --rm -i --network host grafana/k6 run - < testes/carga.js          # misto, ~70 s
   docker run --rm -i --network host --user "$(id -u):$(id -g)" -v "$PWD/testes/resultados:/out" \
     grafana/k6 run - < testes/slo-source.js                                       # protocolo do SLO, ~6 min
   ```

## Desenvolvimento

Cada serviço Node roda com `npm run dev` (nodemon + tsc) e lê a configuração de variáveis de ambiente (`.env.example` em cada pasta). As URLs entre serviços vêm de `docker.env` (`BLOB_MODULE`, `SOURCE_MODULE`, `WORKSPACE_MODULE`, `ASSEMBLAGE_MODULE`, `RABBIT_URL`).
