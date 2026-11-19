# Canteiro: esboço do MVP (agente de gestão de obras)

No ar em https://obras-agentic.vercel.app. Também abre localmente pelo `index.html` (sem build).
Dados fictícios, mas coerentes entre as telas. Hoje no protótipo é quarta, 28/10/2026.

As **notas de validação** (a pergunta para o gerente em cada tela) começam desligadas: mostre a tela limpa e ligue
pelo menu do perfil depois da primeira reação dele.

## A tese em uma frase

O Canteiro mostra, etapa por etapa, quanto a obra já gastou e quanto falta gastar, propõe a ação pronta (o
cronograma, a etapa do gasto) e só grava com o seu OK. E ele é alimentado pelo que a obra já tem (a planilha de
orçamento e a foto do comprovante), não por formulário. Compras, pedidos e estoque saíram do produto em 11/2026.

## Navegação: a obra em ordem, o agente a um clique

- **O Resumo é a home da obra.**
  Toda obra abre nele, e ele é feito para ler de relance, não para ler inteiro.
  Enquanto a obra está sendo montada, "Montando a obra" mostra os passos que faltam (Projeto, Orçamento, Cronograma), com o botão do próximo; com os três feitos, a linha some.
  Ninguém avança passo na mão: eles saem do status da obra, e só voltam quando a aprovação do orçamento é desfeita.
  Embaixo, três quadros: Pede você (aprovações e pendências, cada uma com o verbo que resolve), Dinheiro e Prazo (veredito, número e medidor).
  Depois vêm os blocos de detalhe: etapas em andamento, o que vem (a semana e o cronograma), últimos gastos e o dinheiro mês a mês.
  Cada dado aparece uma vez só na página; por isso o Placar do topo fica escondido no Resumo.
- **As abas seguem a ordem da obra:** Resumo · Projeto · Orçamento · Cronograma · Gastos.
  Tributos, Histórico e Dados da obra ficam no "⋯".
- **O Plumo não é uma aba: está sempre à mão.**
  No computador, o campo "Pergunte ao Plumo" fica no topo (⌘K ou Ctrl+K); Enter manda a pergunta e abre a conversa num painel ao lado da tela, que continua à vista.
  A partir de 1280 px o painel divide a largura com a tela; mais estreito, flutua por cima dela.
  A lista de conversas mora dentro do painel, e a conversa vazia abre com perguntas prontas para o momento da obra.
  O "Perguntar ao Plumo" das telas também abre o painel.
- No celular, a barra de baixo traz Resumo, o Plumo no meio (abre a conversa numa folha que cobre a tela) e as duas telas do dia a dia da fase (antes de aprovar: Projeto e Orçamento; depois: Cronograma e Gastos); o resto, com Início, Nova obra e Conta, fica no Mais.
- No menu do perfil (rodapé da lateral): notas de validação (desligadas por padrão), Nova obra, Celular do mestre, Mapa de fluxos.
- Roteiro da demo (aparece como sugestão acima do campo): "como está a obra?" · "quanto já gastei e quanto falta?" ·
  "alguma etapa passou do orçado?" · "estamos no prazo?". Pedido de compra recebe "eu não faço compras nem controlo
  estoque" e o que o Plumo faz no lugar; pergunta fora do roteiro recebe "não sei com segurança".

## Fluxos

| # | Fluxo | Onde |
|---|-------|------|
| 1 | **Resumo da obra**: o que pede você (aprovações e gastos sem etapa), dinheiro (gasto até hoje × orçado, etapa que passou do orçado) e prazo (mês do cronograma, atraso pela medição) | Resumo |
| 2 | **Aprovações e Histórico**: as propostas do Plumo (o cronograma) com Aprovar e Recusar; o Histórico diz quem fez o quê, de onde veio, e tem Desfazer | Resumo · "⋯" › Histórico |
| 3 | **Criar obra e orçar**: a planilha da construtora como ela vem (o Canteiro acha o cabeçalho e sugere as colunas), ou os materiais das pranchas como uma etapa; aditivos somam sem tocar no contrato | + Nova obra · Projeto · Orçamento |
| 4 | **Orçado × gasto**: por etapa e por tópico, com o que falta gastar e o estouro em vermelho; curva ABC e maior desvio | Orçamento |
| 5 | **Cronograma**: o Plumo propõe pelo orçamento, a pessoa aprova; medição mensal, curva S e desembolso (quanto ainda vai sair e quando) | Cronograma |
| 6 | **Gastos pelo comprovante**: a foto do Pix, da nota ou do recibo; o Plumo lê e sugere valor, data, favorecido e etapa; a pessoa confere e confirma. Fornecedores cadastrados casam pelo CNPJ | Gastos |
| 7 | **Tributos da obra**: INSS da aferição (SERO/VAU) e IBS/CBS estimados, com o que reduz cada um | "⋯" › Tributos |

## Roteiro da conversa com o gerente de obra (~45 min)

1. **Antes de mostrar nada** (10 min): como orça, como acompanha o que gastou, como controla o empreiteiro, o que
   mais atrasa obra, onde mais perde dinheiro.
2. **Resumo da obra** (5 min): ele entende o dinheiro e o prazo de relance? O que falta?
3. **Gasto pelo comprovante no celular dele** (10 min): mandar a foto do Pix e confirmar é aceitável?
4. **Orçamento e medição** (10 min): o orçado × gasto por etapa bate com o que ele faz na planilha? A medição
   mensal é a dor que ele imagina?
5. **Cronograma** (5 min): ele confia num cronograma proposto pelo orçamento?
6. **Fechamento** (5 min): se fossem só 3 telas, quais? Quanto pagaria por mês, por obra ou por empresa?

## Hipóteses a confirmar ou derrubar

- **A mais arriscada:** alguém manda o comprovante de cada pagamento. Sem isso, gasto, desembolso e alertas ficam
  sem dado.
- A medição mensal e o orçado × gasto por etapa são dor suficiente para pagar pelo produto.
- Um orçamento com fonte e confiança é bom o bastante para decidir (não substitui o executivo).
- O gerente quer que o agente proponha e ele aprove, e não só consultar.

## Testes do protótipo

Com um servidor estático na pasta (`python3 -m http.server 4321`), abra num Chromium headless com `--dump-dom`:
- `tests/smoke.html`: percorre as rotas e os modais procurando erro de JavaScript.
- `tests/conversa.html`: digita no campo como o usuário (relatório da fase, blocos, @obra, pedir aço, pergunta fora do roteiro, perguntar sobre uma visão) e confere o cartão que volta.
- `tests/ponta-a-ponta.html`: clica nos botões de verdade (aprovar o cronograma, confirmar o comprovante, aprovar no Início, lançar a medição, aprovar em lote) e confere o efeito nos dados.
- `tests/larguras.html`: 27 telas em 1100, 1366 e 1920 px; acusa tela que empurra a página, termo antigo, emoji, `NaN` ou `undefined`.
