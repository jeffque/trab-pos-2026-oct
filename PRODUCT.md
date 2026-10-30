# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Desenvolvedores que escrevem pequenos programas em C e querem guardá-los com histórico de versões e, futuramente, compilá-los ou ver o assembly gerado sem configurar toolchain local. O uso é de trabalho: abrir um arquivo, ler/editar o código, alternar entre versões.

Público secundário: banca/professor da disciplina de Arquitetura de Microsserviços (Pós Unifor 2026), que vê a tela durante a demonstração ao vivo.

## Product Purpose

Plataforma de armazenamento e versionamento de arquivos-fonte (C), construída como microsserviços: `blob-service` guarda bytes opacos, `source-service` guarda nomes e versões, `bff` serve a interface web. Sucesso: salvar um arquivo, encontrá-lo de novo e ler qualquer versão dele com o mínimo de atrito.

## Operating Context

- Interface servida pelo BFF (Express + Liquid + HTMX, renderização no servidor); navegador envia formulários url-encoded, BFF fala JSON com o source-service.
- Uso em desktop, em sessões de leitura/edição de código.
- Demonstração ao vivo via `docker compose up --build` na apresentação final (31/10/2026).

## Capabilities and Constraints

- Funciona hoje: criar arquivo (REV 1), salvar nova revisão (REV n+1, via `POST /source/:id/versions`), listar arquivos, ler o conteúdo de qualquer revisão.
- Compilar e assemblar (assíncrono): o source-service publica o pedido nas filas `compila`/`assembla` do RabbitMQ; o `build-worker` roda o gcc (C17, `-Wall -Wextra`), guarda a saída no blob-service e devolve status e log. Compilar gera um binário estático para Linux x86-64; Assemblar gera assembly (sintaxe Intel). O programa compilado nunca é executado no servidor.
- Revisões não guardam data nem descrição; a interface não as inventa.
- Nome de arquivo é único.
- Interface em português.
- Sem framework de frontend; HTMX + templates Liquid.

## Evidence on Hand

- Diagrama da arquitetura alvo (fornecido pelo grupo, ainda não versionado no repositório).
- Nenhum logotipo, marca ou identidade visual existente.

## Product Principles

1. O código é o protagonista: a tela existe para ler e escrever código.
2. Nunca fingir capacidade: o que o backend não faz aparece como indisponível, não como mock.
3. Versão sempre visível: o usuário sabe em que arquivo e em que versão está.
4. Navegação rápida entre arquivos sem recarregar a página.
