---
name: Registro de fontes
description: Cada arquivo-fonte C é uma prancha de desenho técnico; cada versão salva é uma revisão no carimbo.
colors:
  paper: "#F3F5F4"
  sheet: "#FBFCFB"
  ink: "#16191D"
  ink-2: "#49515A"
  line: "#8A929B"
  line-text: "#6A727B"
  hair: "#D3D8D6"
  tint: "#E8ECEA"
  red: "#D2361F"
  red-ink: "#A82A17"
  red-wash: "#F8E6E2"
  on-red: "#FFFFFF"
typography:
  headline:
    fontFamily: "Barlow Semi Condensed, Barlow, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.06em"
  title:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  ui:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "normal"
  data:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "\"tnum\" 1"
  code:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: "22px"
    fontFeature: "\"liga\" 0, \"calt\" 0"
  label:
    fontFamily: "Barlow Semi Condensed, Barlow, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "0.08em"
rounded:
  none: "0px"
  hair: "2px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  zone-band: "18px"
components:
  button:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    typography: "{typography.ui}"
    rounded: "{rounded.hair}"
    padding: "0 16px"
    height: "38px"
  button-hover:
    backgroundColor: "{colors.tint}"
  button-active:
    backgroundColor: "{colors.hair}"
  button-primary:
    backgroundColor: "{colors.red}"
    textColor: "{colors.on-red}"
    typography: "{typography.ui}"
    rounded: "{rounded.hair}"
    padding: "0 16px"
    height: "38px"
  button-primary-hover:
    backgroundColor: "{colors.red-ink}"
  button-primary-current:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.red-ink}"
  button-disabled:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
  filter-input:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    padding: "0 10px"
    height: "36px"
  ledger-row:
    textColor: "{colors.ink}"
    typography: "{typography.data}"
    padding: "0 6px"
    height: "40px"
  ledger-row-hover:
    backgroundColor: "{colors.tint}"
  ledger-row-current:
    backgroundColor: "{colors.sheet}"
  revision-item:
    textColor: "{colors.ink}"
    typography: "{typography.data}"
    padding: "0 8px"
    height: "40px"
  revision-item-selected:
    backgroundColor: "{colors.sheet}"
  delta:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ink}"
    width: "22px"
    height: "19px"
  delta-active:
    backgroundColor: "{colors.red}"
    textColor: "{colors.on-red}"
  stamp-cell:
    backgroundColor: "{colors.sheet}"
    padding: "6px 10px 8px"
  stamp-cell-foot:
    backgroundColor: "{colors.tint}"
  alert:
    backgroundColor: "{colors.red-wash}"
    textColor: "{colors.ink}"
    padding: "12px 14px"
  drawing-note:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.ink}"
    padding: "10px 16px"
  drawing-error:
    backgroundColor: "{colors.red-wash}"
    textColor: "{colors.red-ink}"
    padding: "10px 16px"
  kbd:
    textColor: "{colors.ink}"
    rounded: "{rounded.hair}"
    padding: "2px 5px"
  kind-tag:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "3px 8px"
  kind-tag-error:
    textColor: "{colors.red-ink}"
  job-row:
    textColor: "{colors.ink}"
    padding: "10px 2px"
  job-row-error:
    textColor: "{colors.red-ink}"
  job-spinner:
    size: "10px"
  build-log:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    padding: "8px 16px 14px"
  build-log-error:
    textColor: "{colors.red-ink}"
---

# Design System: Registro de fontes

## Overview

**Creative North Star: "A Folha de Desenho Técnico"**

Cada arquivo-fonte é uma prancha: uma folha clara emoldurada por uma malha de zonas (1–6 no topo e na base, A–D nas laterais), com marcas de centro e um carimbo de linhas finas no canto inferior direito. Versões não são "commits" nem abas: são revisões, numeradas dentro do triângulo de revisão (delta) que os desenhos de engenharia usam para marcar alterações. O sistema recusa conscientemente o IDE escuro com árvore de arquivos e abas; o código aparece como tinta sobre papel frio.

A densidade é de ferramenta de trabalho: três colunas fixas (registro, prancha, revisões + carimbo) ocupando a altura da janela, a prancha com o código esticada de cima a baixo. A hierarquia vem de espessura de traço e de tipo, não de cor nem de sombra. A única cor saturada é o vermelho de revisão, a caneta do revisor: marca a revisão ativa, a ação primária, onde está o foco e o que está errado.

O movimento é escasso e mecânico: transições de 160ms em estados de hover e, ao trocar de prancha, a folha nova é "plotada" de cima para baixo (clip-path de 420ms) enquanto a antiga some em 140ms. O único movimento contínuo é um anel de 10px que gira enquanto uma emissão (compilação ou assembly) espera na fila. Com `prefers-reduced-motion`, a plotagem e as transições são desligadas e o anel passa a girar devagar (2s por volta) em vez de parar.

**Key Characteristics:**
- Papel frio e traço quase preto; nenhuma sombra, nenhuma superfície flutuante.
- Hierarquia por espessura de linha (1.5px, 1px, fio claro, tracejado).
- Vermelho de revisão como único acento, reservado e funcional.
- Três vozes tipográficas: Barlow para prosa e controles, Barlow Semi Condensed em caixa alta para o letreiro técnico, JetBrains Mono para tudo que é dado.
- Cantos retos; o arredondamento máximo de canto é 2px (o único círculo é o anel da fila de emissões).
- Vocabulário próprio do desenho técnico: malha de zonas, carimbo, delta, prancha.

## Colors

Uma paleta de papel e grafite praticamente acromática (matizes frios, croma abaixo de 0.02), com um único vermelho de revisão quente.

### Primary
- **Vermelho de Revisão** (`red`): a caneta do revisor. Preenche a ação primária (Novo arquivo, Salvar como REV n, Registrar arquivo, Criar o primeiro arquivo), o delta da revisão ativa, o anel de foco (2px, offset 2px), o cursor de texto do editor, o fio do filtro e do nome de arquivo em foco e o fio da calha de números quando o editor tem foco. Também contorna o alerta de erro.
- **Vermelho Tinta** (`red-ink`): o vermelho em versão legível como texto. Hover do botão primário, texto e contorno do primário quando aponta para a página atual, número do arquivo atual no registro, link "ir para a REV n", título do alerta e texto de erro. Nas emissões, é a cor da falha: texto e contorno da etiqueta de tipo de uma emissão que falhou, status e link "ver erro" na fila e o texto das mensagens do gcc quando a emissão falha.
- **Vermelho Lavado** (`red-wash`): fundo de mensagens de erro (alerta do registro, erro do formulário, faixa de falha da emissão) e da seleção de texto. Nunca usado como fundo decorativo.
- **Branco sobre Vermelho** (`on-red`): texto sobre o vermelho cheio (botão primário e delta ativo). No CSS aparece como o literal `#fff`, não como propriedade customizada.

### Neutral
- **Papel Frio** (`paper`): fundo da página, atrás das três colunas; também o fundo do cabeçalho fixo da tabela do registro.
- **Folha** (`sheet`): a superfície da prancha, dos botões secundários e das células do carimbo; também marca a linha atual no registro e a revisão selecionada (a linha "volta a ser folha").
- **Traço** (`ink`): texto principal e todo traço estrutural (moldura da prancha, divisões do cabeçalho e rodapé da prancha, borda dos botões, grade do carimbo, contorno do delta).
- **Grafite** (`ink-2`): texto secundário (contagens, status, rótulos do carimbo, cabeçalhos de tabela, textos de estado vazio, texto de botões desabilitados).
- **Linha de Cota** (`line`): a borda externa da folha, os números e letras da malha de zonas, o sublinhado do filtro, o tracejado do campo de nome e a barra de rolagem. Não é cor de texto legível.
- **Linha de Cota Legível** (`line-text`): a versão de `line` com contraste para texto: números da calha do editor e placeholders.
- **Fio** (`hair`): divisórias entre linhas de tabelas e listas, divisória da calha, tracejado de botões desabilitados, estado pressionado do botão.
- **Tinta Clara** (`tint`): hover de linhas e botões, faixa de aviso (revisão antiga) e a célula de rodapé do carimbo.

### Named Rules
**A Regra do Traço Vermelho.** O vermelho só aparece onde um revisor marcaria a folha: a revisão ativa, a ação primária, o ponto de foco/edição e o erro. Nunca como decoração, nunca em títulos, nunca como fundo de área grande (o máximo é `red-wash` em mensagens de erro).

**A Regra do Vermelho Legível.** Texto vermelho é sempre `red-ink`; `red` é para preenchimentos, fios e anéis de foco.

**A Regra do Erro em Tinta.** Uma falha se marca em texto e contorno `red-ink`, não em área: a etiqueta de tipo, o status na fila e as mensagens do gcc ficam sobre `sheet`, mesmo quando o log ocupa a prancha inteira. O único fundo vermelho de uma falha continua sendo a faixa `red-wash`. Quando um contorno envolve texto vermelho (etiqueta com erro, primário na página atual), contorno e texto usam o mesmo `red-ink`.

**A Regra da Cota Muda.** `line` desenha, `line-text` informa. Qualquer texto que o usuário precise ler usa `line-text` ou mais escuro.

## Typography

**Display Font:** Barlow Semi Condensed (com Barlow, system-ui, sans-serif)
**Body Font:** Barlow (com system-ui, sans-serif)
**Label/Mono Font:** JetBrains Mono (com ui-monospace, monospace)

**Character:** Barlow tem a geometria de sinalização rodoviária e placas técnicas; sua versão Semi Condensed em caixa alta espaçada é o letreiro normatizado de um carimbo de desenho. JetBrains Mono carrega tudo que é dado, do código aos números de revisão. As três fontes são servidas localmente (woff2 via @fontsource) para a demo funcionar sem internet.

### Hierarchy
- **Headline** (Barlow Semi Condensed 600, 22px, 1.2, caixa alta, 0.06em): título de estados vazios e de erro dentro da prancha ("Registro vazio", "Arquivo não encontrado"). Largura do bloco limitada a 46ch.
- **Title** (JetBrains Mono 600, 18px, 1.2, -0.01em): nome do arquivo no cabeçalho da prancha e no campo de nome de um arquivo novo; no carimbo, a mesma voz em 17px/1.3.
- **Body** (Barlow 400, 15px, 1.5): prosa da interface; textos de status e avisos em 14px, notas de painel e linhas da fila de emissões em 13.5px.
- **UI** (Barlow 500, 14px, 1): rótulos de botões e links de ação.
- **Data** (JetBrains Mono 400, 14px, algarismos tabulares): nomes de arquivo no registro, itens de revisão (500), valores do carimbo (12.5–14px), números de arquivo (11.5px), contagem de linhas e cursor.
- **Code** (JetBrains Mono 400, 13.5px / 22px, ligaduras desligadas, tab de 4): o conteúdo da prancha e a calha de números, inclusive o assembly gerado (somente leitura). Sem quebra de linha (`white-space: pre`). As mensagens do gcc usam a mesma voz um degrau abaixo: mono 12.5px / 1.6, também sem quebra.
- **Label** (Barlow Semi Condensed 600, 10–15px, 0.08em, caixa alta): o letreiro técnico. 11px em cabeçalhos de tabela e etiquetas, 10px nos rótulos do carimbo, 12px no marcador de REV, no guia de linhas e no rótulo de cada emissão na fila (Compilar, Assemblar), 11px também na etiqueta de tipo da prancha de saída (Assembly, Compilação) e no título "Mensagens do gcc", 13px nos títulos de painel, 15px no título do registro.

### Named Rules
**A Regra das Três Vozes.** Prosa e controles em Barlow; nomes de campos e seções em letreiro (Semi Condensed, caixa alta, 0.08em); qualquer coisa que seja dado (nome de arquivo, número de revisão, ID, tamanho, posição de cursor, contagem de linhas) em JetBrains Mono. Nome de arquivo é sempre mono.

**A Regra do Letreiro.** Caixa alta condensada só para rótulos curtos que nomeiam um campo ou seção da folha (Revisões, Nº, Rev, Título, atual). Frases e mensagens nunca vão em caixa alta.

## Layout

Três colunas em grid ocupando 100vh: registro (240–280px), prancha (flexível) e lateral (250–300px), com 20px de gap e 20px de padding externo. A prancha é um grid 3×3: uma faixa de 18px em cada borda carrega a malha de zonas (1–6 em cima e embaixo, A–D nas laterais, distribuídas com `space-around`) e marcas de centro de 8px em traço; a moldura de 1.5px fica na célula central. Dentro dela, a prancha empilha cabeçalho (mín. 52px), editor (flexível, rola por dentro) e rodapé (mín. 60px).

O ritmo de espaçamento é 4 / 8 / 12 / 16 / 20 / 24px: 8px entre ícone e rótulo e entre botões irmãos, 12px dentro de listas, 16px de padding horizontal da prancha e de gap no registro, 24px entre painéis da lateral. Linhas de tabela e lista têm 40px de altura; botões, 38px.

Responsivo:
- **≤ 1100px:** duas colunas. O registro ocupa a coluna esquerda inteira; a prancha fica com altura `100vh - 40px` e a lateral desce para baixo dela, em duas colunas, com o carimbo atravessando a largura toda.
- **≤ 760px:** uma coluna, padding de 12px e gap de 16px. O registro rola até 40vh, a prancha tem 68vh e a faixa de zonas cai para 12px. O cabeçalho da prancha quebra linha e a dica de atalho (Ctrl S) some.

### Named Rules
**A Regra da Prancha Central.** O código ocupa a coluna central na altura inteira disponível; nada se sobrepõe a ele nem o empurra para baixo da dobra. Avisos e erros entram como faixas entre o cabeçalho e o editor, não como sobreposições. Na prancha de saída, as mensagens do gcc também entram como faixa acima do assembly (até 45% da altura, rolando por dentro); só quando a emissão falha, e não há saída para mostrar, o log ocupa a altura restante da prancha.

## Elevation & Depth

O sistema é plano. Não existe `box-shadow` em lugar nenhum. A profundidade é dada por dois degraus tonais (o `paper` da mesa e a `sheet` da folha) e pela espessura dos traços. O único elemento que "sobe" é o cabeçalho fixo do registro, que usa o fundo `paper` e `z-index` para cobrir as linhas rolando, sem sombra.

### Named Rules
**A Regra do Papel Plano.** Nada flutua sobre a folha. Estado (hover, atual, selecionado) se expressa por troca de fundo entre `tint` e `sheet`, nunca por elevação.

**A Regra da Espessura.** A hierarquia de traço é fixa: 1.5px `ink` para molduras e réguas principais (moldura da prancha, topo do registro, régua sob títulos de painel, contorno do carimbo); 1px `ink` para divisões estruturais (cabeçalho e rodapé da prancha, cabeçalho da tabela, borda de botão, contorno da etiqueta de tipo, base do bloco de mensagens do gcc); 1px `line` para a borda externa da folha e sublinhados de campo; 1px `hair` entre linhas (inclusive o topo e as divisões da fila de emissões); tracejado para o que ainda não existe (botões desabilitados, nome de arquivo ainda não preenchido).

## Shapes

Cantos retos por padrão. Só botões e teclas (`kbd`) recebem 2px de raio, o suficiente para tirar a aspereza do pixel sem virar "pílula". Painéis, tabela, carimbo, prancha, alertas e a etiqueta de tipo têm cantos vivos.

A única forma redonda é o anel da fila: um círculo de 10px desenhado com traço de 1.5px em `hair`, com o quarto superior em `ink`, que gira enquanto o pedido espera. É um círculo de compasso, não um canto arredondado; a regra dos 2px vale para cantos de retângulos.

A forma assinatura é o **delta**: um triângulo de 22×19px recortado com `clip-path`, contorno em `ink` e miolo em `sheet`, com o número da revisão em mono 600 de 10px apoiado na base. Ativo, o triângulo inteiro vira vermelho com número branco. O favicon é o mesmo delta, em três triângulos aninhados (vermelho, folha, traço).

Ícones são SVG de traço, 16×16px, traço de 1.5 com pontas e junções arredondadas, sempre em `currentColor` e `aria-hidden`.

## Components

### Buttons
Instrumentos de mesa: retangulares, firmes, com borda de traço.
- **Shape:** quase reto (2px), altura mínima de 38px, padding horizontal de 16px, gap de 8px entre ícone e rótulo.
- **Padrão (secundário):** fundo `sheet`, borda 1px `ink`, texto `ink` em Barlow 500 14px. Hover em `tint`, pressionado em `hair`. Transição de fundo, cor e borda em 160ms.
- **Primário:** fundo e borda `red`, texto branco; hover escurece para `red-ink`.
- **Primário na página atual:** quando a ação primária aponta para a página em que o usuário já está (`aria-current="page"`, ex.: "Novo arquivo" estando em /novo), o botão fica contornado: fundo `sheet`, texto e borda `red-ink`, sem hover.
- **Desabilitado:** fundo transparente, borda 1px tracejada em `hair`, texto `ink-2`, cursor `not-allowed`. Usado em "Salvar" sem alterações e em Compilar/Assemblar quando nenhum arquivo está aberto, sempre acompanhado de uma nota que explica por quê (ligada por `aria-describedby`).
- **Bloco:** nas emissões, os dois botões padrão dividem a largura do painel em duas colunas iguais, com 8px de gap, cada um com seu ícone de traço.
- **Foco:** anel global de 2px `red`, offset 2px.
- **Em envio:** o botão de salvar desabilita e troca o rótulo para "Salvando…".

### Inputs / Fields
- **Filtro do registro:** sem caixa; só um sublinhado 1px `line`, ícone de lupa à esquerda em `ink-2`, altura de 36px. Em foco, o sublinhado vira `red`. Aparece só quando há mais de 4 arquivos.
- **Nome de arquivo (prancha nova):** sem caixa, sublinhado tracejado 1px `line`, texto na voz Title (mono 600 18px); em foco ou inválido, o sublinhado fica sólido em `red`. Placeholder em `line-text`.
- **Editor:** textarea sem borda sobre a folha, calha de números à direita alinhada em `line-text` com divisória `hair`; quando o editor tem foco, a divisória da calha vira `red` e o cursor de texto é `red`.

### Registro (ledger)
A lista de arquivos é uma tabela de desenhos: régua de 1.5px `ink` no topo, cabeçalho em letreiro de 11px com fio `ink`, cabeçalho fixo ao rolar. Colunas: Nº (84px, mono 11.5px `ink-2`), Arquivo (mono 14px, com reticências) e Rev (44px, delta centralizado). Linhas de 40px separadas por fio `hair`; a linha inteira é clicável. Hover em `tint`; a linha atual volta a `sheet`, com nome em 600, Nº em `red-ink` e delta ativo. Foco desenha um anel `red` por dentro da linha.

### Lista de revisões
Itens de 40px com delta, "REV n" em mono 500 14px e a etiqueta "atual" em letreiro 11px `ink-2` alinhada à direita. Hover em `tint`; a revisão selecionada fica em `sheet`, peso 600 e delta vermelho. A lista rola dentro de 30vh.

### Prancha (signature)
A folha central: fundo `sheet`, borda externa 1px `line`, faixa de zonas de 18px com letras e números em letreiro 10px `line`, marcas de centro em traço, moldura interna de 1.5px `ink`. O cabeçalho traz o título do arquivo, o marcador "delta + REV n" em letreiro 12px e, à direita, o guia de linhas visíveis ("L 1–40 / 120") em letreiro tabular `ink-2`. O rodapé traz o status (`ink-2`, ou `ink` 500 quando há alterações não salvas), a dica de teclado e o botão primário. A troca de prancha anima com o efeito de plotagem.

### Carimbo (signature)
O bloco de título do desenho, fixado no fim da lateral. Grade de duas colunas desenhada com gap de 1px sobre fundo `ink` e contorno de 1.5px `ink`, o que produz fios de 1px entre as células. Cada célula: rótulo em letreiro 10px `ink-2`, valor em 14px (mono 12.5px para dados), com reticências. O título ocupa a largura toda em mono 600 17px; a célula de rodapé ("Armazenamento") usa fundo `tint`. Campos sem valor mostram "—".

### Emissões (fila)
O painel "Emissões · REV n" da lateral funciona como uma ordem de serviço anotada na folha. Abaixo dos botões Compilar e Assemblar (padrão, contornados em `ink`; a emissão não é a ação primária da tela), uma lista com fio `hair` no topo registra cada pedido da revisão aberta. Cada linha é uma grade de três colunas (rótulo, status, link) com 10×2px de padding e fio `hair` embaixo:
- **Rótulo:** a emissão em letreiro 12px (COMPILAR, ASSEMBLAR), em `ink`.
- **Status:** Barlow 13.5px em `ink-2` (ex.: "binário de 137 kB", "na fila"), com " · com avisos" quando o gcc emitiu avisos. Pedido na fila mostra o anel giratório antes do texto.
- **Link:** "ver saída", Barlow 500, sublinhado de 1px na cor do texto; some enquanto o pedido está na fila.
- **Falha:** status em `red-ink` 500 ("falhou") e link "ver erro" em `red-ink`.
- **Atualização:** enquanto houver pedido na fila, o painel se recarrega sozinho a cada 1s (HTMX, trocando só o próprio painel) e a lista é `aria-live="polite"`; quando a fila esvazia, o polling para. Sem pedidos, o painel mostra uma nota explicando o que cada emissão faz.

### Prancha de saída
A saída de uma emissão abre na mesma prancha, com o mesmo cabeçalho: título do arquivo, uma etiqueta de tipo e o marcador "delta + REV n".
- **Etiqueta de tipo:** caixa de cantos vivos, contorno 1px `ink`, padding 3×8px, letreiro 11px/1 (ASSEMBLY ou COMPILAÇÃO). Quando a emissão falhou, contorno e texto passam a `red-ink`.
- **Mensagens do gcc:** bloco abaixo do cabeçalho (e da faixa de erro, se houver), com título em letreiro 11px `ink-2` e o log em mono 12.5px / 1.6 `ink`, base em 1px `ink`, rolando por dentro até 45% da altura. Na falha, o texto vira `red-ink` e o bloco ocupa toda a altura restante. Só aparece quando há log.
- **Assembly:** o mesmo editor da prancha (calha de números + área de código), em somente leitura, com o guia de linhas no cabeçalho. O rodapé traz "Baixar .s" e "Voltar ao código", ambos botões padrão.
- **Binário:** sem conteúdo para ler, a prancha mostra o estado vazio "Binário gerado" com tamanho, uma frase sobre o que foi gerado e o botão primário "Baixar binário" (ícone de seta para baixo).
- **Na fila:** faixa `tint` explicando que a lista ao lado se atualiza sozinha.

### Faixas e alertas
- **Aviso (revisão antiga, emissão na fila):** faixa `tint` entre o cabeçalho e o editor, 14px, fio `hair` embaixo.
- **Erro de formulário / falha de emissão:** mesma faixa, fundo `red-wash`, texto `red-ink` 500.
- **Alerta do registro:** caixa com borda 1px `red`, fundo `red-wash`, padding 12×14px, título em `red-ink` 500 e instrução com `code` para o comando de diagnóstico.

### Estado vazio
Bloco centralizado na prancha, até 46ch: título Headline em letreiro 22px, texto em `ink-2`, e no máximo uma ação. O detalhe técnico de uma falha aparece em mono 13px `red-ink`.

### Teclas
`kbd` com borda 1px `line`, raio de 2px, padding 2×5px, mono 11px em `ink`, largura mínima de 22px.

## Do's and Don'ts

### Do:
- **Do** marque toda revisão com o delta, e pinte de vermelho apenas o delta da revisão ativa/selecionada.
- **Do** mantenha o vermelho restrito a revisão ativa, ação primária, foco/cursor e erro (A Regra do Traço Vermelho); texto vermelho sempre em `red-ink`.
- **Do** transforme o botão primário em contornado (`sheet` + `red-ink`) quando ele aponta para a página atual.
- **Do** expresse hierarquia com a escala de traço: 1.5px `ink` para molduras, 1px `ink` para divisões, `hair` entre linhas, tracejado para o que ainda não existe.
- **Do** escreva todo dado (nomes de arquivo, revisões, IDs, tamanhos, cursor) em JetBrains Mono com algarismos tabulares.
- **Do** use caixa alta condensada com 0.08em apenas em rótulos curtos de campo e seção.
- **Do** mostre recursos ainda não implementados ou indisponíveis (ex.: emissões sem arquivo aberto) como botões desabilitados tracejados com uma nota explicativa ao lado.
- **Do** marque a falha de uma emissão em texto e contorno `red-ink` (etiqueta, status, link, log) e deixe o fundo vermelho só para a faixa `red-wash` (A Regra do Erro em Tinta).
- **Do** mostre o anel giratório só enquanto há pedido na fila, e pare o polling do painel quando a fila esvazia.
- **Do** use ícones SVG de traço 16px, 1.5 de espessura, em `currentColor`.
- **Do** desligue a plotagem da prancha e as transições sob `prefers-reduced-motion`; o anel da fila não para, gira devagar (2s por volta).

### Don't:
- **Don't** use tema escuro de IDE, árvore de arquivos ou abas; a superfície é papel claro (`color-scheme: light`).
- **Don't** use `box-shadow` nem superfícies flutuantes; estado se mostra por troca de fundo.
- **Don't** arredonde cantos além de 2px, e só em botões e teclas; o anel da fila é o único círculo do sistema.
- **Don't** adicione outro movimento em loop além do anel da fila.
- **Don't** use `red` como cor de texto, de título ou de fundo de área grande.
- **Don't** use `line` para texto que precisa ser lido; use `line-text` ou mais escuro.
- **Don't** escreva frases ou mensagens em caixa alta.
- **Don't** introduza uma segunda cor de acento.
