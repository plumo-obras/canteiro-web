/**
 * Agente de mentira do modo de demonstração: responde por roteiro, sem modelo de IA, emitindo os mesmos eventos SSE do
 * contrato (ferramenta → texto → proposta → fim). Como o agente de verdade, não faz conta: cita a Conta da "API"
 * (a loja de demonstração) e, quando falta material, só PROPÕE a compra.
 */
import type { Usuario } from "../contrato";
import { fmtQtdUn } from "../formato";
import { contaDoInsumo, estado, gravarNaSessao, linhaDeConta, propostaDeCompra, uuid7 } from "./loja";

export interface EventoBruto {
  evento: "texto" | "ferramenta" | "proposta" | "fim" | "erro";
  dados: unknown;
}

const PALAVRAS: [string, RegExp][] = [
  ["bloco", /bloco|tijolo/i],
  ["aco", /a[çc]o|ferro|vergalh/i],
  ["cimento", /cimento/i],
  ["areia", /areia/i],
];

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function* roteiroDemo(
  corpo: { texto?: string; sessao_id?: string | null; obra_id?: string | null },
  u: Usuario,
  pausa = 28,
): AsyncGenerator<EventoBruto> {
  const e = estado();
  const texto = String(corpo.texto ?? "").trim();
  const sessao_id = corpo.sessao_id || uuid7();
  const obra = e.obras.find((o) => o.id === corpo.obra_id) ?? e.obras[0]!;

  if (/^\/sem-?cr[eé]ditos/i.test(texto)) {
    yield { evento: "erro", dados: { mensagem: "Sem créditos de IA neste mês. Fale com quem administra a conta para liberar mais." } };
    return;
  }

  await espera(pausa * 6);
  yield { evento: "ferramenta", dados: { nome: "consultar_estoque", nivel: "consulta", resumo: `usou almoxarifado · ${obra.nome}` } };
  await espera(pausa * 8);

  const chave = PALAVRAS.find(([, re]) => re.test(texto))?.[0];
  const insumo = chave ? e.insumos.get(chave) : undefined;
  let resposta: string;
  let proposta = null;

  if (insumo) {
    const c = contaDoInsumo(e, insumo);
    const n = (v: number) => fmtQtdUn(v, insumo.unidade);
    const pendente = e.propostas.find((p) => p.status === "pendente" && p.tipo === "criar_pedido" && p.dados.insumo_id === insumo.id);
    // Mesmo formato pedido ao agente de verdade (instrucao.py): parágrafos curtos, a conta numa linha própria,
    // negrito só no número que importa e na ação.
    resposta = `Pelo almoxarifado da ${obra.nome}, ${insumo.nome} está assim:\n\n${linhaDeConta(c, insumo.unidade)}\n\n`;
    if (c.falta === 0) {
      resposta += "**Não precisa comprar**: o saldo, o que está a caminho e o que está em cotação cobrem até o fim da obra.";
    } else if (pendente) {
      resposta += `Faltam **${n(c.falta)}**, e já existe uma compra esperando aprovação em Aprovações.\n\nNão preparei outra para não comprar em dobro.`;
    } else {
      proposta = propostaDeCompra(e, insumo, c, `almoxarifado · ${obra.nome}`);
      resposta += `Faltam **${n(c.falta)}**. **Preparei a compra para você aprovar**; nada é pedido antes disso.`;
    }
  } else {
    const faltas = [...e.insumos.values()]
      .filter((i) => i.obra_id === obra.id)
      .map((i) => ({ i, c: contaDoInsumo(e, i) }))
      .filter((x) => x.c.falta > 0);
    // Lista com "-" só a partir de 3 itens; com menos, um parágrafo por item lê melhor.
    const itens = faltas.map((x) => `${x.i.nome}: **${fmtQtdUn(x.c.falta, x.i.unidade)}**`);
    resposta = faltas.length
      ? `Na ${obra.nome}, depois de descontar o que está a caminho e em cotação, ainda faltam:\n\n${
          itens.length >= 3 ? itens.map((t) => `- ${t}`).join("\n") : itens.join("\n\n")
        }\n\nPergunte por um item (ex.: "quanto falta de cimento?") e eu preparo a compra.`
      : `Na ${obra.nome} nada falta: o que está no almoxarifado, a caminho e em cotação cobre a obra até o fim.`;
  }

  // Em pedaços de poucas palavras, como o modelo faz, para a tela exercitar o streaming de verdade.
  const pedacos = resposta.match(/\S+\s*|\s+/g) ?? [];
  for (let i = 0; i < pedacos.length; i += 3) {
    yield { evento: "texto", dados: { delta: pedacos.slice(i, i + 3).join("") } };
    await espera(pausa);
  }

  if (proposta) {
    yield { evento: "ferramenta", dados: { nome: "propor_pedido", nivel: "propoe", resumo: "preparou uma compra para aprovação" } };
    await espera(pausa * 4);
    e.propostas.push(proposta);
    yield { evento: "proposta", dados: proposta };
  }

  // Grava a volta no mesmo formato do agente de verdade, para a lateral reabrir a conversa depois.
  const uso1 = uuid7();
  const uso2 = uuid7();
  gravarNaSessao(sessao_id, u, obra.id, texto, [
    { papel: "user", conteudo: [{ type: "text", text: `(Obra em foco na tela: obra_id=${obra.id})` }, { type: "text", text: texto }] },
    { papel: "assistant", conteudo: [{ type: "tool_use", id: uso1, name: "consultar_estoque", input: { obra_id: obra.id } }] },
    { papel: "user", conteudo: [{ type: "tool_result", tool_use_id: uso1, content: "[…estoque da obra…]" }] },
    {
      papel: "assistant",
      conteudo: [
        { type: "text", text: resposta },
        ...(proposta ? [{ type: "tool_use", id: uso2, name: "propor_pedido", input: {} }] : []),
      ],
    },
    ...(proposta
      ? [{ papel: "user" as const, conteudo: [{ type: "tool_result", tool_use_id: uso2, content: JSON.stringify({ proposta_id: proposta.id, status: "pendente" }) }] }]
      : []),
  ]);
  yield { evento: "fim", dados: { sessao_id, uso: { tokens: 0, custo: 0 } } };
}

export function emSSE(ev: EventoBruto) {
  return `event: ${ev.evento}\ndata: ${JSON.stringify(ev.dados)}\n\n`;
}
