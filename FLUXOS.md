# Canteiro: esboço do MVP (agente de gestão de obras)

Protótipo clicável: abra `index.html` no navegador. É um arquivo só e não precisa de servidor.
Tudo é dado fictício, mas coerente entre as telas: a obra "Casa Vila Nova" tem os mesmos
números no chat, no orçamento, no Kanban, no inventário e nos prazos.

Na barra lateral, o botão **🧪 Notas de validação** liga e desliga as perguntas para o gerente
em cada tela. Desligue antes de mostrar a tela "limpa".

## Fluxos

| # | Fluxo | Onde está no protótipo |
|---|-------|------------------------|
| 1 | **Criar obra e orçar**: anexar projeto → descrever → budget, prazos e fases → o agente levanta quantitativos e cota na região | ＋ Nova obra (assistente de 4 passos) |
| 2 | **Visão geral e orçamento**: budget × custo previsto, "o budget é realista?", economias encontradas, gasto × avanço físico | aba 📊 Visão geral |
| 3 | **Componentes e compra**: quantidade estimada, comparação de fornecedores, onde comprar, checkout no hub | aba 🧱 Componentes (clique numa linha) |
| 4 | **Kanban de lotes**: Cotado → Aprovado → Pedido feito → Em trânsito → Entregue (conferir) → Disponível no inventário | aba 📦 Pedidos (dá para arrastar os cartões) |
| 5 | **Inventário**: entrou, saiu, saldo, para onde foi (ex.: 100 de 1.000 parafusos = 10% na porta principal), cobertura em dias, consumo acima do projeto | aba 🗃️ Inventário (clique no parafuso) |
| 6 | **Equipe**: Kanban de pessoas (vaga → mobilização → em campo → desmobilizado), custo × previsto, impacto da vaga no prazo | aba 👷 Equipe |
| 7 | **Prazos**: Gantt planejado × real, previsão do agente, atraso por causa (fornecedor, equipe, clima), "o estoque aguenta até o fim?" | aba ⏱️ Prazos |
| 8 | **Estoque entre obras**: o agente cruza o que sobra numa obra com o que falta em outra. Pode sair só o saldo − o que a origem ainda vai usar − uma reserva (metade disso); o preço é o do lote original; a transferência precisa do OK do responsável da origem; entra no Kanban como transferência; o valor sai do budget de uma obra e volta ao da outra | ↔️ Estoque entre obras (barra lateral), selos ↔ no Inventário e em Prazos, e a resposta dos parafusos na Home |
| 9 | **Tudo pelo chat**: a home enxerga todas as obras; cada obra tem sessões com histórico separado; a resposta traz dados e um botão de ação | 💬 Início e aba 💬 Chat da obra |

## Roteiro da conversa com o gerente de obra (~40 min)

1. **Antes de mostrar nada** (10 min): como ele orça hoje? Planilha, software, orçamentista? Como
   controla material no canteiro? O que mais atrasa obra? Onde mais se perde dinheiro?
2. **Mostrar o fluxo 1 → 3** (10 min): ele confiaria na quantidade e no preço que o agente estimou?
   O que precisaria ver para acreditar?
3. **Kanban e inventário** (10 min): quem faria a baixa de material no dia a dia? Pelo celular?
   Registrar o destino ("porta principal") é viável ou vira burocracia?
4. **Prazos e chat** (5 min): a explicação do atraso por causa ajuda na conversa com o cliente?
5. **Fechamento** (5 min): se tivesse só 3 dessas telas, quais seriam? Quanto pagaria por mês, e
   por obra ou por empresa?

## Hipóteses que a conversa precisa confirmar ou derrubar

- O gerente quer **comprar** dentro da plataforma, e não só cotar.
- A baixa de material com destino é feita de verdade no canteiro (esta é a hipótese mais arriscada:
  sem ela, o inventário e a previsão de falta não funcionam).
- Uma estimativa de orçamento gerada a partir do projeto é confiável o bastante para decidir.
- Transferir material entre obras é comum e vale formalizar. Pontos a confirmar: quem autoriza; se preço de custo é justo ou entra frete; se pode transferir quando o material pertence ao cliente da obra (obra por administração ou por empreitada).
- O chat como tela principal é preferível a um painel de números.
