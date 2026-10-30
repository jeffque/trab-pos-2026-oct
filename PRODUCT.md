# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Desenvolvedores que escrevem pequenos programas em C e querem guardá-los com histórico de versões e, futuramente, compilá-los ou ver o assembly gerado sem configurar toolchain local. O uso é de trabalho: abrir um arquivo, ler/editar o código, alternar entre versões.

Público secundário: banca/professor da disciplina de Arquitetura de Microsserviços (Pós Unifor 2026), que vê a tela durante a demonstração ao vivo.

## Product Purpose

Toolchain C em microsserviços: `blob-service` guarda bytes opacos, `source-service` guarda fontes e revisões, `workspace-service` compila conjuntos de fontes em arquivos objeto, `assemblage-service` linka objetos em executáveis, `bff` serve a interface web. Sucesso: ir de fontes versionadas a um executável com o mínimo de atrito.

## Operating Context

- Interface servida pelo BFF (Express + Liquid + HTMX, renderização no servidor); navegador envia formulários url-encoded, BFF fala JSON com o source-service.
- Uso em desktop, em sessões de leitura/edição de código.
- Demonstração ao vivo via `docker compose up --build` na apresentação final (31/10/2026).

## Capabilities and Constraints

- Fontes: criar arquivo (REV 1), salvar nova revisão (REV n+1), listar, ler qualquer revisão.
- Workspaces: conjunto de fontes `.c`/`.h`, cada uma fixa numa revisão; ciclo rascunho → na fila → compilado/erro. Compilar publica na fila `compila`; o `compila-worker` roda `gcc -c` (+ `ld -r`) e devolve o evento `compilacao.resultado`, que vincula o arquivo objeto (`.o`) ao workspace.
- Assemblagens: conjunto de objetos de workspaces compilados, linkado num executável estático pelo `assembla-worker` (fila `assembla`, evento `assemblagem.resultado`). O programa nunca é executado no servidor.
- Revisões não guardam data nem descrição; a interface não as inventa.
- Nome de arquivo, workspace e assemblagem é único.
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
