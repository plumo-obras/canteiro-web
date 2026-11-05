/**
 * Cliente HTTP tipado do contrato (docs/contrato.md). Fala sempre com o próprio Next (/srv/api e /srv/agente), que
 * repassa para a API e o agente de verdade ou responde no modo de demonstração; o navegador nunca precisa saber qual.
 */
import type {
  AjustesProposta,
  ChavePropria,
  ComRegistro,
  CorpoAvancar,
  CorpoInsumo,
  CorpoObra,
  CorpoVersao,
  Orcamento,
  PreviaVersao,
  DadosObra,
  LeituraPlanilha,
  Mapeamento,
  PreviaOrcamento,
  CorpoMovimento,
  CorpoPedido,
  Cronograma,
  CorpoCronograma,
  CorpoMedicao,
  RespostaMedicao,
  CorpoEditarPedido,
  CorpoFornecedor,
  CorpoRecebimento,
  EtapaObra,
  Fornecedor,
  Recebimento,
  RespostaRecebimento,
  CorpoConversa,
  ComprovanteDetalhe,
  Comprovante,
  Confirmacao,
  CorpoConfirmar,
  EtapaExtra,
  EtapaNaArvore,
  GastoObra,
  RespostaLeitura,
  ResumoGastos,
  StatusComprovante,
  Topico,
  MinhaConta,
  RelatorioUso,
  ResumoObra,
  EntradaRegistro,
  EventoConversa,
  Insumo,
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
    else if (Array.isArray(j.detail))
      msg = j.detail
        .map((d: { msg?: string }) => d?.msg)
        .filter(Boolean)
        .join("; ");
  } catch {
    /* sem corpo */
  }
  return new ErroApi(r.status, msg || MENSAGEM_PADRAO[r.status] || "Algo deu errado. Tente de novo.");
}

async function chamar<T>(metodo: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", caminho: string, corpo?: unknown): Promise<T> {
  // FormData vai como multipart: o navegador põe o content-type com o boundary sozinho.
  const form = corpo instanceof FormData;
  const r = await comAcesso(`/srv/api${caminho}`, {
    method: metodo,
    headers: corpo === undefined || form ? undefined : { "content-type": "application/json" },
    body: corpo === undefined ? undefined : form ? corpo : JSON.stringify(corpo),
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
  resumoObras: () => chamar<ResumoObra[]>("GET", "/obras/resumo"),
  conta: () => chamar<MinhaConta>("GET", "/conta"),
  chaveAnthropic: () => chamar<ChavePropria>("GET", "/conta/chave-anthropic"),
  /** Só master. A resposta não importa para a tela: ela relê `GET /conta`, que é a fonte da verdade. */
  salvarChaveAnthropic: (chave: string) => chamar<unknown>("PUT", "/conta/chave-anthropic", { chave }),
  removerChaveAnthropic: () => chamar<unknown>("DELETE", "/conta/chave-anthropic"),
  /** `de` e `ate` em AAAA-MM-DD, inclusivos. */
  uso: (de: string, ate: string) => chamar<RelatorioUso>("GET", `/uso${q({ de, ate })}`),
  criarObra: (corpo: CorpoObra) => chamar<ComRegistro<Obra>>("POST", "/obras", corpo),
  editarObra: (obraId: string, dados: DadosObra) => chamar<ComRegistro<Obra>>("PATCH", `/obras/${seg(obraId)}`, dados),
  /** Lê a planilha (aba, cabeçalho, colunas e uma amostra) e sugere qual coluna é qual. Não grava nada. */
  lerPlanilha: (obraId: string, arquivo: File, planilha?: string) => {
    const f = new FormData();
    f.set("arquivo", arquivo);
    if (planilha) f.set("planilha", planilha);
    return chamar<LeituraPlanilha>("POST", `/obras/${seg(obraId)}/orcamento/ler`, f);
  },
  /** `aplicar: false` é a prévia; com qualquer erro a API não grava nem com `aplicar: true`. */
  importarOrcamento: (obraId: string, arquivo: File, mapeamento: Mapeamento, aplicar: boolean) => {
    const f = new FormData();
    f.set("arquivo", arquivo);
    f.set("mapeamento", JSON.stringify(mapeamento));
    f.set("aplicar", String(aplicar));
    return chamar<PreviaOrcamento>("POST", `/obras/${seg(obraId)}/orcamento/importar`, f);
  },
  /** O orçamento da obra (EAP): versões, itens vigentes com curva, totais por etapa. */
  orcamento: (obraId: string) => chamar<Orcamento>("GET", `/obras/${seg(obraId)}/orcamento`),
  /** Contrato ou aditivo. `aplicar: false` é a prévia; com `aplicar: true` a chave de idempotência é obrigatória. */
  versaoOrcamento: (obraId: string, arquivo: File, corpo: CorpoVersao) => {
    const f = new FormData();
    f.set("arquivo", arquivo);
    f.set("mapeamento", JSON.stringify(corpo.mapeamento));
    f.set("tipo", corpo.tipo);
    if (corpo.descricao) f.set("descricao", corpo.descricao);
    if (corpo.data) f.set("data", corpo.data);
    f.set("aplicar", String(corpo.aplicar));
    if (corpo.chave_idempotencia) f.set("chave_idempotencia", corpo.chave_idempotencia);
    if (corpo.etapas_itens && Object.keys(corpo.etapas_itens).length) f.set("etapas_itens", JSON.stringify(corpo.etapas_itens));
    return chamar<PreviaVersao>("POST", `/obras/${seg(obraId)}/orcamento/versoes`, f);
  },
  cronograma: (obraId: string) => chamar<Cronograma>("GET", `/obras/${seg(obraId)}/cronograma`),
  /** Substitui o cronograma inteiro (o Desfazer volta o anterior). */
  salvarCronograma: (obraId: string, corpo: CorpoCronograma) => chamar<ComRegistro<Cronograma>>("PUT", `/obras/${seg(obraId)}/cronograma`, corpo),
  criarMedicao: (obraId: string, corpo: CorpoMedicao) => chamar<RespostaMedicao>("POST", `/obras/${seg(obraId)}/medicoes`, corpo),
  aprovarOrcamento: (obraId: string) => chamar<ComRegistro<Obra>>("POST", `/obras/${seg(obraId)}/orcamento/aprovar`),
  listarInsumos: (obraId: string) => chamar<ItemInsumo[]>("GET", `/obras/${seg(obraId)}/insumos`),
  listarMovimentos: (obraId: string, insumoId: string, limite = 50, antes_de?: string) =>
    chamar<Movimento[]>("GET", `/obras/${seg(obraId)}/insumos/${seg(insumoId)}/movimentos${q({ limite, antes_de })}`),
  /** Vários status viram `?status=a&status=b` (a API filtra com "in"). Sem status: os mais recentes, até `limite`. */
  listarPedidos: (obraId: string, filtro: { status?: StatusPedido | StatusPedido[]; limite?: number; antes_de?: string } = {}) => {
    const p = new URLSearchParams();
    for (const st of [filtro.status ?? []].flat()) p.append("status", st);
    if (filtro.limite) p.set("limite", String(filtro.limite));
    if (filtro.antes_de) p.set("antes_de", filtro.antes_de);
    const t = p.toString();
    return chamar<Pedido[]>("GET", `/obras/${seg(obraId)}/pedidos${t ? `?${t}` : ""}`);
  },
  avancarPedido: (pedidoId: string, para: StatusPedido, extra: Omit<CorpoAvancar, "para"> = {}) =>
    chamar<ComRegistro<Pedido>>("POST", `/pedidos/${seg(pedidoId)}/avancar`, { para, ...extra }),
  criarPedido: (obraId: string, corpo: CorpoPedido) => chamar<ComRegistro<Pedido>>("POST", `/obras/${seg(obraId)}/pedidos`, corpo),
  editarPedido: (pedidoId: string, dados: CorpoEditarPedido) => chamar<ComRegistro<Pedido>>("PATCH", `/pedidos/${seg(pedidoId)}`, dados),
  registrarRecebimento: (pedidoId: string, corpo: CorpoRecebimento) =>
    chamar<RespostaRecebimento>("POST", `/pedidos/${seg(pedidoId)}/recebimentos`, corpo),
  listarRecebimentos: (pedidoId: string) => chamar<Recebimento[]>("GET", `/pedidos/${seg(pedidoId)}/recebimentos`),
  /** Etapas do orçamento vigente, para apropriar pedido e saída. Vazia = obra sem orçamento importado. */
  etapas: (obraId: string) => chamar<EtapaObra[]>("GET", `/obras/${seg(obraId)}/etapas`),
  listarFornecedores: () => chamar<Fornecedor[]>("GET", "/fornecedores"),
  criarFornecedor: (corpo: CorpoFornecedor) => chamar<ComRegistro<Fornecedor>>("POST", "/fornecedores", corpo),
  editarFornecedor: (id: string, dados: Partial<CorpoFornecedor>) => chamar<ComRegistro<Fornecedor>>("PATCH", `/fornecedores/${seg(id)}`, dados),
  criarInsumo: (obraId: string, corpo: CorpoInsumo) => chamar<ComRegistro<Insumo>>("POST", `/obras/${seg(obraId)}/insumos`, corpo),
  lancarMovimento: (obraId: string, corpo: CorpoMovimento) => chamar<ComRegistro<Movimento>>("POST", `/obras/${seg(obraId)}/movimentos`, corpo),
  listarPropostas: (filtro: { status?: StatusProposta; obra_id?: string; limite?: number; antes_de?: string } = {}) =>
    chamar<Proposta[]>("GET", `/propostas${q({ ...filtro })}`),
  recusarProposta: (id: string, motivo: string) => chamar<Proposta>("POST", `/propostas/${seg(id)}/recusar`, { motivo }),
  listarRegistro: (obraId: string, limite = 50, antes_de?: string) => chamar<EntradaRegistro[]>("GET", `/registro${q({ obra_id: obraId, limite, antes_de })}`),
  desfazerRegistro: (id: string) => chamar<EntradaRegistro>("POST", `/registro/${seg(id)}/desfazer`),
  listarSessoes: (filtro: { obra_id?: string; limite?: number; antes_de?: string } = {}) =>
    chamar<SessaoApi[]>("GET", `/sessoes${q({ limite: 30, ...filtro })}`),

  /** Todas as mensagens da sessão, em páginas de 200 (o contrato pagina por seq com `depois_de`). */
  async mensagensSessao(id: string): Promise<MensagemSessao[]> {
    const todas: MensagemSessao[] = [];
    for (let depois = -1; ;) {
      const pag = await chamar<MensagemSessao[]>("GET", `/sessoes/${seg(id)}/mensagens${q({ depois_de: depois, limite: 200 })}`);
      todas.push(...pag);
      if (pag.length < 200) return todas;
      depois = pag[pag.length - 1]!.seq;
    }
  },

  /** Etapas fixas + extras da obra, com os tópicos: onde um gasto pode entrar. */
  arvore: (obraId: string) => chamar<EtapaNaArvore[]>("GET", `/obras/${seg(obraId)}/arvore`),
  criarEtapaExtra: (obraId: string, nome: string) => chamar<ComRegistro<EtapaExtra>>("POST", `/obras/${seg(obraId)}/etapas-extras`, { nome }),
  editarEtapaExtra: (id: string, dados: { nome?: string; arquivado?: boolean }) =>
    chamar<ComRegistro<EtapaExtra>>("PATCH", `/etapas-extras/${seg(id)}`, dados),
  criarTopico: (obraId: string, etapa: string, nome: string) => chamar<ComRegistro<Topico>>("POST", `/obras/${seg(obraId)}/topicos`, { etapa, nome }),
  editarTopico: (id: string, dados: { nome?: string; arquivado?: boolean }) => chamar<ComRegistro<Topico>>("PATCH", `/topicos/${seg(id)}`, dados),
  /** Qualquer papel envia. O mesmo arquivo de novo devolve o comprovante que já existe (`ja_existia`). */
  enviarComprovante: (obraId: string, arquivo: Blob, nome: string, legenda: string) => {
    const f = new FormData();
    f.set("arquivo", arquivo, nome);
    if (legenda.trim()) f.set("legenda", legenda.trim());
    return chamar<Comprovante>("POST", `/obras/${seg(obraId)}/comprovantes`, f);
  },
  listarComprovantes: (obraId: string, status?: StatusComprovante, limite = 100) =>
    chamar<Comprovante[]>("GET", `/obras/${seg(obraId)}/comprovantes${q({ status, limite })}`),
  comprovante: (id: string) => chamar<ComprovanteDetalhe>("GET", `/comprovantes/${seg(id)}`),
  confirmarComprovante: (id: string, corpo: CorpoConfirmar) => chamar<Confirmacao>("POST", `/comprovantes/${seg(id)}/confirmar`, corpo),
  descartarComprovante: (id: string, motivo: string) => chamar<Comprovante>("POST", `/comprovantes/${seg(id)}/descartar`, { motivo }),
  listarGastos: (obraId: string, filtro: { etapa?: string; limite?: number; antes_de?: string } = {}) =>
    chamar<GastoObra[]>("GET", `/obras/${seg(obraId)}/gastos${q({ ...filtro })}`),
  resumoGastos: (obraId: string) => chamar<ResumoGastos>("GET", `/obras/${seg(obraId)}/gastos/resumo`),

  /** `{proposta, registro}`: o `registro.id` é o que o Desfazer usa. */
  aprovarProposta: (id: string, ajustes?: AjustesProposta) =>
    chamar<RespostaAprovar>("POST", `/propostas/${seg(id)}/aprovar`, ajustes && Object.keys(ajustes).length ? { ajustes } : undefined),
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
    // 500 sem corpo do Next = o repasse não alcançou o agente: é o mesmo caso do serviço desligado.
    if (r.status >= 500) {
      const e = await erroDe(r);
      yield { tipo: "erro", mensagem: e.message === "Algo deu errado. Tente de novo." ? "O agente ainda não está ligado nesta instalação." : e.message };
      return;
    }
    yield { tipo: "erro", mensagem: (await erroDe(r)).message };
    return;
  }
  for await (const bruto of lerSSE(r.body)) {
    const e = interpretarEvento(bruto);
    if (e) yield e;
  }
}

/** O arquivo do comprovante. Vai pelo repasse com o token (dado pessoal: nunca numa URL pública nem em cache). */
export async function arquivoComprovante(id: string): Promise<Blob> {
  const r = await comAcesso(`/srv/api/comprovantes/${encodeURIComponent(id)}/arquivo`);
  if (!r.ok) throw await erroDe(r);
  return await r.blob();
}

/**
 * Pede ao agente a leitura com IA (dezenas de segundos). A leitura, ou o erro dela, fica gravada no comprovante: a
 * revisão abre com o que tiver, mesmo que esta chamada falhe.
 */
export async function lerComprovante(id: string): Promise<RespostaLeitura> {
  const r = await comAcesso("/srv/agente/leitura", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ comprovante_id: id }),
  });
  if (!r.ok) throw await erroDe(r);
  return (await r.json()) as RespostaLeitura;
}
