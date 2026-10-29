# Product

<!-- impeccable:product-schema 1 -->

## Platform

web (desktop ≥ 1100 px para o escritório; a rota `#campo`, o WhatsApp do mestre, também no celular a partir de 390 px)

## Users

- **Gerente/engenheiro de obra** de construtora pequena e média no Brasil (residencial, comercial, galpões).
  Hoje usa planilha, Power BI e WhatsApp; às vezes um ERP de obra.
  Abre o Canteiro de manhã, no escritório ou no carro, para decidir o dia, e volta ao longo do dia para aprovar.
- **Mestre de obras / encarregado**: no canteiro, pelo celular, com a mão suja e pouco tempo. Não abre sistema:
  manda áudio e foto no WhatsApp.
- **Dono da obra** que toca a obra sem empreiteiro (hipótese em validação): precisa de alguém que coordene.

O primeiro contato é uma demo de validação com um gerente de obra: ele precisa entender cada tela em segundos,
sem explicação.

## Product Purpose

Um agente que **age** sobre a obra: prevê o que vai faltar antes de faltar, traz a ação pronta (cotação,
pedido, remarcação, segurar pagamento) e só grava com o OK de alguém. Sucesso = nenhuma equipe parada por falta de
material e nenhum real pago a mais (material perdido, empreiteiro adiantado, compra em dobro).

## Positioning

"IA + WhatsApp para obra" já é commodity no Brasil. O Canteiro se
diferencia por **fechar o ciclo de suprimentos com um agente que propõe**: falta prevista → cotação → pedido →
entrega → NF-e conferida item a item → estoque por frente de serviço → sobra reaproveitada em outra obra.
Somam-se três diferenciais locais: medição de empreiteiro "pago × executado", NR-18 e SINAPI/CUB.

## Operating Context

Protótipo clicável, sem build (HTML + CSS + JS vanilla), com dados fictícios coerentes entre as telas. Arquivos:
`css/app.css`, `js/data.js` (dados), `js/core.js` (telas base), `js/features/*.js` (proativo, campo, gestao).
Publicado em https://obras-agentic.vercel.app a cada push na `main`. Testes: `tests/smoke.html` e
`tests/larguras.html` no Chromium headless.

## Capabilities and Constraints

- Telas: Início (briefing do dia + chat), Aprovações e registro, Campo · WhatsApp, Todas as obras, Estoque entre
  obras e, por obra: Chat, Orçamento, Insumos e compras, Pedidos, Almoxarifado, Equipe, Prazos, Diário, Medições.
- Não mudar dados, números nem comportamento durante um redesign. Toda ação continua com registro e desfazer.
- Abaixo de 1100 px só a rota `#campo` funciona; as outras mostram o aviso "abra num computador".
- Sem emoji: ícones de traço em SVG inline (`js/icons.js`). Sem dependência de CDN além das fontes.
- Português do Brasil, com o vocabulário da obra: Insumos, Almoxarifado, Orçamento/verba, Pedidos, RDO, medição, empreiteiro.
- Não inventar clientes, depoimentos, preços nem números de mercado.

## Brand Commitments

Canteiro: concreto, verde-grafite e ocre de obra. Firme, direto e prático, como um bom mestre de obras: fala pouco,
diz o que fazer e por quê. Nada de cara de "IA genérica" (gradientes, brilho, cards com ícone em cima de tudo) e nada
de imitar o claude.ai. A confiança vem de mostrar de onde vem cada número (fonte, data, quem aprovou).

## Evidence on Hand

- Revisão de 4 especialistas (gerente de obra, UX, produto/IA, QA) e entrevista 01 com um engenheiro civil
  (galpões): as dores fortes são coordenar terceiros e a sequência de serviços, perda de material (roubo,
  armazenamento), estouro do orçamento por escolha do dono, e obra sem responsável.
- Mapa de concorrentes (out/2026), mantido fora deste repositório.
- Ainda não há usuário real usando o produto.

## Product Principles

1. A tela responde "o que eu faço agora?" antes de "o que aconteceu?".
2. Toda sugestão mostra a conta e a fonte (precisa − saldo − a caminho = falta).
3. O agente propõe, a pessoa aprova, e dá para desfazer.
4. Densidade de ferramenta de trabalho: tabelas e listas legíveis, sem decoração ocupando lugar de dado.
5. O canteiro não preenche formulário: entra pelo WhatsApp e pela foto da nota.

## Accessibility & Inclusion

Contraste WCAG AA (4,5:1 no corpo, inclusive na sidebar escura). Texto de corpo ≥ 13 px no desktop e ≥ 15 px no
celular. Foco visível pelo teclado. Ações do Kanban acessíveis sem arrastar. Respeitar `prefers-reduced-motion`.
Uso ao ar livre no celular (sol forte): alto contraste na rota `#campo`.
