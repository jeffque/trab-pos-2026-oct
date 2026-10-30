# Registro de Fontes

Plataforma para guardar arquivos de código C com histórico de revisões e, a partir de qualquer revisão, **compilar** (log do gcc + binário) ou **gerar o assembly**. Construída como microsserviços para a disciplina *Arquitetura de Microsserviços e Escalabilidade* (Pós Unifor 2026.2).

- Arquitetura, SLOs, observabilidade e segurança: [`docs/arquitetura.md`](docs/arquitetura.md)
- Decisões arquiteturais: [`docs/ADR-001.md`](docs/ADR-001.md) … [`docs/ADR-010.md`](docs/ADR-010.md)
- Teste de carga: [`testes/carga.js`](testes/carga.js) e [`docs/resultados-carga.md`](docs/resultados-carga.md)

## Membros do grupo

| Nome | GitHub |
|---|---|
| _a preencher_ | |

## Como rodar

Pré-requisito: Docker com Compose v2. As portas 3000, 3001, 3002, 3003 e 15672 precisam estar livres.

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

Parar e apagar tudo (os dados não são persistidos): `docker compose down`.

## Serviços

```
navegador → bff → source-lb → source-service ×2 → postgres-sources
                                   ├→ blob-lb → blob-service ×2 → postgres-blob
                                   └→ rabbitmq (compila / assembla) → compila-worker, assembla-worker
logs: todos os containers → alloy → loki → grafana
```

| Pasta | Serviço | Responsabilidade |
|---|---|---|
| [`bff/`](bff) | `bff` | Interface web (Express + Liquid + HTMX) |
| [`source-service/`](source-service) | `source-service` | Arquivos, revisões e pedidos de build |
| [`blob-service/`](blob-service) | `blob-service` | Armazenamento de bytes opacos por UUID |
| [`build-worker/`](build-worker) | `compila-worker`, `assembla-worker` | Consomem as filas e rodam o gcc |
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
| `POST /source/:id/versions/:rev/builds` `{kind: "compila" \| "assembla"}` | Pede build → `202` (vai para a fila) |
| `GET /source/:id/builds?version=N` | Builds de uma revisão (status `pendente`, `ok`, `erro`) |
| `GET /builds/:id` | Status, log do gcc e tamanho do artefato |
| `GET /builds/:id/content` | Artefato gerado (binário ou `.s`) |
| `PUT /builds/:id` | Uso interno: resultado enviado pelo worker |

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
| `GET /` | Registro de arquivos |
| `GET /novo`, `POST /novo` | Criar arquivo |
| `GET /source/:id?rev=N` | Prancha com o código da revisão |
| `POST /source/:id/revisoes` | Salvar nova revisão (Ctrl+S) |
| `POST /source/:id/emitir` | Pedir compilação/assembly |
| `GET /source/:id/saida/:buildId` | Log do gcc, assembly ou download do binário |

### Exemplo pela API

```bash
curl -X POST localhost:3002/source -H 'Content-Type: application/json' \
  -d '{"filename":"ola.c","content":"#include <stdio.h>\nint main(void){puts(\"ola\");}\n"}'
# → {"id":"<uuid>","version":1}

curl -X POST localhost:3002/source/<uuid>/versions/1/builds -H 'Content-Type: application/json' -d '{"kind":"assembla"}'
curl "localhost:3002/source/<uuid>/builds?version=1"
```

## Roteiro da demonstração

1. `docker compose up --build` e `docker compose ps` (todos `healthy`).
2. Na aplicação: criar `soma.c`, salvar uma REV 2 (Ctrl+S), voltar para a REV 1.
3. **Compilar** e **Assemblar**: ver "na fila…" virar resultado; abrir o assembly; mostrar um erro de compilação.
4. Clicar em **logs** num build: o Grafana mostra o mesmo Correlation ID passando por bff, source-lb, source-service, worker, blob-lb e blob-service.
5. Balanceamento e falha:
   ```bash
   for i in 1 2 3 4; do curl -sI localhost:3002/source | grep X-Upstream; done   # alterna entre réplicas
   docker stop trab-pos-2026-oct-source-service-1                              # a aplicação continua respondendo
   curl -s localhost:3002/health/ready                                          # estado das dependências
   ```
6. Escala: `docker compose up -d --scale compila-worker=3` e o painel do RabbitMQ.
7. Teste de carga: `docker run --rm -i --network host grafana/k6 run - < testes/carga.js`.

## Desenvolvimento

Cada serviço Node roda com `npm run dev` (nodemon + tsc) e lê a configuração de variáveis de ambiente (`.env.example` em cada pasta). As URLs entre serviços vêm de `docker.env` (`BLOB_MODULE`, `SOURCE_MODULE`, `RABBIT_URL`).
