/**
 * Cliente HTTP tipado do contrato (docs/contrato.md). Fala sempre com o próprio Next (/srv/api e /srv/agente), que
 * repassa para a API e o agente de verdade ou responde no modo de demonstração; o navegador nunca precisa saber qual.
 */
import type {
  CorpoConversa,
  EntradaRegistro,
  EventoConversa,
  ItemInsumo,
  Movimento,
  Obra,
  Pedido,
  Proposta,
  RespostaAprovar,
  StatusPedido,
  StatusProposta,
} from "./contrato";
import type { MensagemSessao, SessaoApi } from "./historico";
import { comAcesso } from "./sessao";
import { interpretarEvento, lerSSE } from "./sse";

export class ErroApi extends Error {
  constructor(
    public status: number,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroApi";
  }
}

const MENSAGEM_PADRAO: Record<number, string> = {
  401: "Sua sessão acabou. Entre de novo.",
  403: "Seu papel não permite esta ação.",
  404: "Não encontrado.",
  402: "Sem créditos de IA para esta conversa.",
};

async function erroDe(r: Response): Promise<ErroApi> {
  let msg = "";
  try {
    const j = (await r.json()) as { detail?: unknown; mensagem?: unknown };
    // FastAPI devolve {detail: "..."} ou {detail: [{msg}]} na validação; o agente usa {mensagem}.
    if (typeof j.mensagem === "string") msg = j.mensagem;
    else if (typeof j.detail === "string") msg = j.detail;
    else if (Array.isArray(j.detail)) msg = j.detail.map((d: { msg?: string }) => d?.msg).filter(Boolean).join("; ");
  } catch {
    /* sem corpo */
  }
  return new ErroApi(r.status, msg || MENSAGEM_PADRAO[r.status] || "Algo deu errado. Tente de novo.");
}

async function chamar<T>(metodo: "GET" | "POST", caminho: string, corpo?: unknown): Promise<T> {
  const r = await comAcesso(`/srv/api${caminho}`, {
    method: metodo,
    headers: corpo === undefined ? undefined : { "content-type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  if (!r.ok) throw await erroDe(r);
  return (r.status === 204 ? null : await r.json()) as T;
}

const q = (p: Record<string, string | number | undefined | null>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  const t = s.toString();
  return t ? `?${t}` : "";
};
const seg = encodeURIComponent;

export const api = {
  listarObras: () => chamar<Obra[]>("GET", "/obras"),
  listarInsumos: (obraId: string) => chamar<ItemInsumo[]>("GET", `/obras/${seg(obraId)}/insumos`),
  listarMovimentos: (obraId: string, insumoId: string, limite = 50) =>
    chamar<Movimento[]>("GET", `/obras/${seg(obraId)}/insumos/${seg(insumoId)}/movimentos${q({ limite })}`),
  listarPedidos: (obraId: string, status?: StatusPedido) =>
    chamar<Pedido[]>("GET", `/obras/${seg(obraId)}/pedidos${q({ status })}`),
  avancarPedido: (pedidoId: string, para: StatusPedido) =>
    chamar<Pedido>("POST", `/pedidos/${seg(pedidoId)}/avancar`, { para }),
  listarPropostas: (filtro: { status?: StatusProposta; obra_id?: string } = {}) =>
    chamar<Proposta[]>("GET", `/propostas${q({ ...filtro })}`),
  recusarProposta: (id: string, motivo: string) => chamar<Proposta>("POST", `/propostas/${seg(id)}/recusar`, { motivo }),
  listarRegistro: (obraId: string, limite = 50) =>
    chamar<EntradaRegistro[]>("GET", `/registro${q({ obra_id: obraId, limite })}`),
  desfazerRegistro: (id: string) => chamar<EntradaRegistro>("POST", `/registro/${seg(id)}/desfazer`),
  listarSessoes: (filtro: { obra_id?: string; limite?: number } = {}) =>
    chamar<SessaoApi[]>("GET", `/sessoes${q({ limite: 30, ...filtro })}`),

  /** Todas as mensagens da sessão, em páginas de 200 (o contrato pagina por seq com `depois_de`). */
  async mensagensSessao(id: string): Promise<MensagemSessao[]> {
    const todas: MensagemSessao[] = [];
    for (let depois = -1; ; ) {
      const pag = await chamar<MensagemSessao[]>("GET", `/sessoes/${seg(id)}/mensagens${q({ depois_de: depois, limite: 200 })}`);
      todas.push(...pag);
      if (pag.length < 200) return todas;
      depois = pag[pag.length - 1]!.seq;
    }
  },

  /** `{proposta, registro}`: o `registro.id` é o que o Desfazer usa. */
  aprovarProposta: (id: string) => chamar<RespostaAprovar>("POST", `/propostas/${seg(id)}/aprovar`),
};

/** POST /conversa em SSE. Erros de HTTP antes do fluxo viram um evento `erro`, para a tela tratar num lugar só. */
export async function* conversar(corpo: CorpoConversa, sinal?: AbortSignal): AsyncGenerator<EventoConversa> {
  const r = await comAcesso("/srv/agente/conversa", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify(corpo),
    signal: sinal,
  });
  if (!r.ok || !r.body) {
    yield { tipo: "erro", mensagem: (await erroDe(r)).message };
    return;
  }
  for await (const bruto of lerSSE(r.body)) {
    const e = interpretarEvento(bruto);
    if (e) yield e;
  }
}
