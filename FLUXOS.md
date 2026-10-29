# Canteiro: esboço do MVP (agente de gestão de obras)

No ar em https://obras-agentic.vercel.app. Também abre localmente pelo `index.html` (sem build).
Dados fictícios, mas coerentes entre as telas. Hoje no protótipo é quarta, 28/10/2026.

As **notas de validação** (a pergunta para o gerente em cada tela) começam desligadas: mostre a tela limpa e ligue
pelo menu do perfil depois da primeira reação dele.

## A tese em uma frase

O Canteiro **age**: avisa o que vai faltar antes de faltar, propõe a ação pronta e só grava com o
seu OK. E ele é alimentado pelo canal que o mestre já usa (WhatsApp e foto da nota), não por formulário.

## Navegação: o agente no centro, uma coisa por vez

- **A conversa é a home.** Ao abrir, você cai na conversa **Geral** (todas as obras), e a 1ª mensagem do agente é o
  briefing do dia em cartões de decisão: uma ação por linha, o resto no "⋯".
- **A lateral só tem conversas:** a Geral e as sessões agrupadas por obra. O escopo é da sessão e aparece no título
  ("Casa Vila Nova · Atraso do aço"). `@Vila Nova` no campo vale só para uma mensagem.
- **Cada sessão tem abas.** A aba **Conversa** é fixa. As telas (Pedidos, Almoxarifado, Orçamento, Cronograma,
  Equipe…) viram abas da sessão quando **você** clica em "Abrir" num cartão do agente, num link `PED-…`, no **"+"**
  (o único menu de telas) ou digita `/almox`. O agente nunca abre aba sozinho. A aba ativa ocupa a tela inteira:
  ou a conversa, ou a tela. As abas ficam guardadas na sessão.
- **Dentro de uma tela**, o campo fixo "Perguntar ao agente sobre isto" leva a pergunta para a Conversa, com o contexto.
- No menu do perfil (rodapé da lateral): notas de validação (desligadas por padrão), Nova obra, Celular do mestre, Mapa de fluxos.
- Roteiro da demo (aparece como sugestão acima do campo): "vamos começar pela Vila Nova, quero um relatório da fase da
  obra" · "por que só tem 2.760 blocos?" · "o que chega amanhã?" · "quem está na obra hoje?" · "estamos no prazo?" ·
  "@Loja Centro o que sobra?" · "pede 600 kg de aço". Pergunta fora do roteiro recebe "não sei com segurança".

## Fluxos

| # | Fluxo | Onde |
|---|-------|------|
| 1 | **Briefing do dia**: "6 coisas pedem você hoje" (concretagem × chuva, plano B do aço, areia a menos na NF, quebra de bloco, empreiteiro pago acima do executado, cimento vencendo em outra obra), cada uma com Aprovar / Ajustar / Desfazer | Conversa Geral (1ª mensagem) |
| 2 | **Aprovações e registro**: fila de propostas do agente de todas as obras; registro de quem aprovou o quê, de onde veio (agente, WhatsApp, tela) e desfazer | Aprovações |
| 3 | **WhatsApp do mestre**: o áudio "assentamos 180 blocos, 15 quebraram, choveu das 3 às 5…" vira baixa no almoxarifado, diário de obra, causa de atraso e avanço; o mestre confirma num toque. **Funciona no celular** | Campo · WhatsApp |
| 4 | **Recebimento por NF-e**: o agente lê a nota, compara pedido × NF × recebido (areia: 40 na NF, 36 na caçamba) e abate R$ 472 do boleto | Visão Pedidos → Conferir NF |
| 5 | **Criar obra e orçar**: três caminhos (planilha do orçamentista, estimativa por m² com CUB/SINAPI, extrair do PDF só o que dá para medir), com selo de confiança e a lista "não consegui medir" | + Nova obra |
| 6 | **Orçamento com fonte**: cada linha com origem (SINAPI, cotação, NF anterior) e confiança, BDI e encargos, economias que se escolhem e se desfazem | Visão Orçamento |
| 7 | **Insumos e pedido de compra**: quantidade = precisa − saldo − a caminho; fornecedor comparado; alçada e regime da obra; PDF e envio por WhatsApp; cotação assíncrona (leva horas) | Visão Falta comprar |
| 8 | **Pedidos**: faixa do ciclo no topo (Falta → Em cotação → A caminho → Conferir NF → Sobra); o que pede você primeiro; botões com o nome da consequência (Aprovar R$ X, Marcar como enviado, Conferir NF) | Visão Pedidos |
| 9 | **Almoxarifado**: saldo, a caminho, falta e curva ABC; destino só para itens A. Caso-vitrine: bloco com 15% de quebra contra 5% previstos | Visão Almoxarifado |
| 10 | **Equipe**: chamada do dia, pendências de ASO / EPI / NR-18, vaga de armador e o impacto dela no prazo | Visão Equipe |
| 11 | **Prazos**: cronograma planejado × real, atraso por causa (fornecedor +9, equipe +8, clima +4), "com o plano o atraso cai de 21 para 6 dias", "o estoque aguenta até o fim?" | Visão Cronograma |
| 12 | **Diário de obra (RDO)**: montado a partir do áudio, das fotos e da estação de clima, cada fato com a sua fonte; PDF para o cliente | Visão Diário |
| 13 | **Medição de empreiteiro**: contratado × executado × pago, retenção e vales; "Equipe Silva: pago 75%, executado 62% → segurar R$ 7.540" | Visão Medições |
| 14 | **Estoque entre obras**: transferir sobra a preço de custo sem prejudicar a obra de origem | Estoque entre obras · Visão Entre obras |

## Roteiro da conversa com o gerente de obra (~45 min)

1. **Antes de mostrar nada** (10 min): como orça, como compra, quem recebe material, como controla
   o empreiteiro, o que mais atrasa obra, onde mais perde dinheiro.
2. **Briefing do dia** (5 min): ele aprovaria essas 6 coisas? Quantas cabem antes de virar ruído?
3. **WhatsApp no celular dele** (10 min): mande o link `/#campo` para o celular do gerente.
   O mestre dele mandaria áudio assim? Confirmar com um toque é aceitável?
4. **NF, almoxarifado e medição** (10 min): a conferência pela nota é real? O "pago × executado"
   do empreiteiro é a dor que ele imagina?
5. **Orçamento e prazos** (5 min): ele confia num orçamento com fonte e selo de confiança?
6. **Fechamento** (5 min): se fossem só 3 telas, quais? Quanto pagaria por mês, por obra ou por empresa?

## Hipóteses a confirmar ou derrubar

- **A mais arriscada:** o mestre alimenta o sistema todo dia pelo WhatsApp. Sem isso, almoxarifado,
  diário, prazos e alertas ficam sem dado.
- A conferência pela NF-e acontece no canteiro, e a divergência vira abatimento de verdade.
- A medição de empreiteiro (pago × executado) é dor suficiente para pagar pelo produto.
- Um orçamento com fonte e confiança é bom o bastante para decidir (não substitui o executivo).
- O gerente quer que o agente proponha e ele aprove, e não só consultar.
- Transferir material entre obras é comum. A confirmar: quem autoriza, preço de custo ou com frete, e se vale quando o material é do cliente.

## Testes do protótipo

Com um servidor estático na pasta (`python3 -m http.server 4321`), abra num Chromium headless com `--dump-dom`:
- `tests/smoke.html`: percorre as rotas e os modais procurando erro de JavaScript.
- `tests/conversa.html`: digita no campo como o usuário (relatório da fase, blocos, @obra, pedir aço, pergunta fora do roteiro, perguntar sobre uma visão) e confere o cartão que volta.
- `tests/ponta-a-ponta.html`: clica nos botões de verdade (aprovar pedido, confirmar o áudio, conferir a NF, aprovar no Início, segurar a medição, aprovar em lote) e confere o efeito nos dados.
- `tests/larguras.html`: 27 telas em 1100, 1366 e 1920 px; acusa tela que empurra a página, termo antigo, emoji, `NaN` ou `undefined`.
