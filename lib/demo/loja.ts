/**
 * Modo de demonstração: o próprio Next se passa pela API central, com a Casa Vila Nova do contrato em memória.
 * Serve para trabalhar na web antes de a API e o agente existirem. Segue o contrato ao pé da letra (rotas, códigos,
 * formatos), inclusive "o agente só propõe": a escrita da conversa vira Proposta e só o aprovar executa, com registro
 * e desfazer. Os dados somem quando o servidor reinicia.
 */
import type {
  Conta,
  DadosAjusteEstoque,
  DadosObra,
  Mapeamento,
  DadosAvancarPedido,
  DadosCriarPedido,
  EntradaRegistro,
  ItemInsumo,
  MinhaConta,
  Movimento,
  Obra,
  Pedido,
  Proposta,
  RespostaEntrar,
  StatusPedido,
  StatusProposta,
  TipoMovimento,
  Usuario,
} from "../contrato";
import { fmtQtdUn, fmtReais } from "../formato";
import type { MensagemSessao, SessaoApi } from "../historico";
import { uuid7 } from "../ids";
import { PlanilhaInvalida, lerPlanilhaDemo, nomeChave, previaDemo } from "./orcamento";

export { uuid7 };
import { A_CAMINHO, EM_COTACAO, RegraViolada, contaDeFalta, efeitoNoSaldo, validarTransicao } from "./regras-espelho";

export const TENANT = "tenant-demo";
const VIDA_ACESSO_S = 15 * 60;

const agoraISO = () => new Date().toISOString();
const diasAtras = (d: number, h = 9) => {
  const t = new Date();
  t.setDate(t.getDate() - d);
  t.setHours(h, 0, 0, 0);
  return t.toISOString();
};

interface EstadoDemo {
  usuarios: Usuario[];
  acessos: Map<string, { usuario: Usuario; vence: number }>;
  renovacoes: Map<string, Usuario>;
  obras: Obra[];
  insumos: Map<string, ItemDemo>;
  movimentos: Movimento[];
  pedidos: Pedido[];
  propostas: Proposta[];
  registro: EntradaRegistro[];
  contadorPedido: number;
  /** chave_idempotencia → movimento lançado pela tela (o ID na API é derivado da chave; aqui, um mapa). */
  idempotencia: Map<string, Movimento>;
  /** chave_idempotencia → obra criada pela tela (POST /obras repetido devolve a mesma). */
  obrasPorChave: Map<string, Obra>;
  /** Histórico das conversas no formato que o agente grava (um item por mensagem, como na coleção `mensagens`). */
  sessoes: Map<string, { sessao: SessaoApi; mensagens: MensagemSessao[] }>;
  /** E-mail com que cada pessoa entrou (o Usuario do contrato não traz e-mail; GET /conta traz). */
  emails: Map<string, string>;
  /** Da chave própria a demonstração guarda só o final, como a tela enxerga: a chave em si é descartada. */
  chave: { final: string; cadastrada_em: string } | null;
  creditos: { saldo: number; franquia: number };
  /** Linhas de UsoIA (custo em microdólares), somadas na hora como a API faz. */
  uso: { dia: string; obra_id: string | null; rota: string; custo: number; tokens: number }[];
}

type ItemDemo = ItemInsumo["insumo"];

/** Preço e fornecedor de referência da demonstração, para a proposta de compra ter valor. */
export const REFERENCIA: Record<string, { fornecedor: string; centavosPorUn: number }> = {
  bloco: { fornecedor: "Cerâmica Santa Rita", centavosPorUn: 320 },
  aco: { fornecedor: "Gerdau · distribuidor Campinas", centavosPorUn: 660 },
  cimento: { fornecedor: "Depósito Ouro Verde", centavosPorUn: 3900 },
  areia: { fornecedor: "Areial Jaguari", centavosPorUn: 14000 },
};

/** Os campos da obra que o cadastro deixa em branco (como os defaults do modelo na API). */
const OBRA_VAZIA = {
  cidade: "",
  cep: "",
  uf: "",
  endereco: "",
  verba: 0,
  tipologia: null,
  area_construida: 0,
  pavimentos: 0,
  padrao: null,
  regime: null,
  cliente: "",
  inicio: null,
  prazo_meses: 0,
} satisfies Omit<Obra, "id" | "tenant_id" | "criado_em" | "nome" | "status">;

const CAMPOS_OBRA = Object.keys(OBRA_VAZIA).concat("nome") as (keyof DadosObra)[];
const ROTULO_CAMPO: Record<string, string> = {
  nome: "nome",
  cidade: "cidade",
  cep: "CEP",
  uf: "UF",
  endereco: "endereço",
  verba: "verba",
  tipologia: "tipo",
  area_construida: "área",
  pavimentos: "pavimentos",
  padrao: "padrão",
  regime: "regime",
  cliente: "cliente",
  inicio: "início",
  prazo_meses: "prazo",
};

/** Só os campos conhecidos; o resto do corpo é ignorado (a API recusaria campo desconhecido com 422). */
function dadosObra(c: Record<string, unknown>): DadosObra {
  const d: Record<string, unknown> = {};
  for (const k of CAMPOS_OBRA) if (k in c) d[k] = c[k];
  if (typeof d.nome === "string") d.nome = d.nome.replace(/\s+/g, " ").trim();
  if ("nome" in d && (!d.nome || String(d.nome).length > 120)) throw new RegraViolada("Dê um nome para a obra (até 120 letras).");
  return d as DadosObra;
}

function semear(): EstadoDemo {
  const doc = <T extends object>(x: T, criado = agoraISO()) => ({ id: uuid7(), tenant_id: TENANT, criado_em: criado, ...x });
  const obra: Obra = doc({
    ...OBRA_VAZIA,
    nome: "Casa Vila Nova",
    cidade: "Campinas",
    uf: "SP",
    cep: "13000-000",
    verba: 48000000,
    status: "em_andamento" as const,
    tipologia: "sobrado" as const,
    area_construida: 186_000,
    pavimentos: 2,
    padrao: "normal" as const,
    regime: "empreitada" as const,
    prazo_meses: 12,
  });
  const ins = (chave: string, nome: string, unidade: string, precisa: number, curva: "A" | "B" | "C") =>
    [chave, doc({ obra_id: obra.id, nome, unidade, precisa_ate_o_fim: precisa, curva, valor_unitario: REFERENCIA[chave]!.centavosPorUn })] as const;
  const insumos = new Map<string, ItemDemo>([
    ins("bloco", "Bloco cerâmico 14×19×29", "un", 3_400_000, "A"),
    ins("aco", "Aço CA-50 10 mm", "kg", 3_940_000, "A"),
    ins("cimento", "Cimento CP-II 50 kg", "sc", 200_000, "A"),
    ins("areia", "Areia média lavada", "m³", 60_000, "C"),
  ]);
  const id = (k: string) => insumos.get(k)!.id;
  const mov = (k: string, tipo: TipoMovimento, q: number, dias: number, extra: Partial<Movimento> = {}): Movimento =>
    doc(
      {
        obra_id: obra.id,
        insumo_id: id(k),
        tipo,
        quantidade: q,
        destino: null,
        origem_doc: null,
        quem: "Joana (mestre)",
        origem: "tela",
        desfaz: null,
        ...extra,
      },
      diasAtras(dias),
    );
  const movimentos: Movimento[] = [
    mov("bloco", "entrada", 4_000_000, 20, { origem_doc: "PED-0149" }),
    mov("bloco", "saida", 1_050_000, 9, { destino: "Alvenaria do térreo" }),
    mov("bloco", "saida", 190_000, 4, { destino: "Quebra no descarregamento", origem: "whatsapp" }),
    mov("aco", "entrada", 600_000, 30, { origem_doc: "PED-0141" }),
    mov("aco", "saida", 460_000, 12, { destino: "Fundação · sapatas" }),
    mov("cimento", "entrada", 100_000, 15, { origem_doc: "PED-0152" }),
    mov("cimento", "saida", 54_000, 6, { destino: "Contrapiso do térreo" }),
    mov("areia", "entrada", 30_000, 18, { origem_doc: "PED-0150" }),
    mov("areia", "saida", 18_000, 5, { destino: "Reboco interno" }),
  ];
  const ped = (numero: string, k: string, q: number, valor: number, status: StatusPedido, previsao: string | null, dias: number): Pedido =>
    doc(
      { numero, obra_id: obra.id, insumo_id: id(k), quantidade: q, fornecedor: REFERENCIA[k]!.fornecedor, valor, status, previsao, rastreio: null },
      diasAtras(dias),
    );
  const pedidos: Pedido[] = [
    ped("PED-0157", "areia", 40_000, 560000, "recebido", "chegou ontem · NF 4471", 6),
    ped("PED-0158", "aco", 3_200_000, 2112000, "em_transito", "chega quinta", 5),
    ped("PED-0160", "cimento", 120_000, 468000, "enviado", "chega segunda", 3),
    ped("PED-0167", "aco", 600_000, 402000, "em_cotacao", null, 1),
  ];
  const usuarios: Usuario[] = [
    { id: uuid7(), nome: "Rizzi", tenant_id: TENANT, papel: "admin" },
    { id: uuid7(), nome: "Paula (leitura)", tenant_id: TENANT, papel: "viewer" },
    { id: uuid7(), nome: "Marina Duarte", tenant_id: TENANT, papel: "master" },
  ];
  // Duas obras sem almoxarifado ainda, para a página inicial mostrar mais de um cartão e os estados de obra.
  const outras: Obra[] = [
    doc({ ...OBRA_VAZIA, nome: "Sobrado Jardim Europa", cidade: "Valinhos", uf: "SP", cep: "13270-000", verba: 91000000, status: "em_orcamento" as const }),
    doc({ ...OBRA_VAZIA, nome: "Reforma Loja Centro", cidade: "Campinas", uf: "SP", cep: "13010-000", verba: 12500000, status: "concluida" as const }),
  ];
  const e: EstadoDemo = {
    usuarios,
    acessos: new Map(),
    renovacoes: new Map(),
    obras: [obra, ...outras],
    insumos,
    movimentos,
    pedidos,
    propostas: [],
    registro: [],
    contadorPedido: 167,
    idempotencia: new Map(),
    obrasPorChave: new Map(),
    sessoes: new Map(),
    emails: new Map(),
    chave: null,
    creditos: { saldo: 0, franquia: 20_000_000 },
    uso: semearUso(obra.id, outras[0]!.id),
  };
  // Saldo coerente com o consumo do mês: franquia menos o que já foi gasto desde o dia 1.
  const mes = hojeSP().slice(0, 8);
  e.creditos.saldo = Math.max(0, e.creditos.franquia - e.uso.filter((x) => x.dia >= `${mes}01`).reduce((t, x) => t + x.custo, 0));
  const ped157 = pedidos[0]!;
  e.propostas.push(
    novaProposta(e, {
      obra_id: obra.id,
      tipo: "avancar_pedido",
      titulo: "Conferir a NF 4471 e dar entrada de 40 m³ de areia (PED-0157)",
      conta: "NF 4471: 40 m³ · pedido PED-0157: 40 m³ · diferença 0",
      justificativa: "A areia chegou ontem com a NF 4471 e ainda não deu entrada: o saldo está 40 m³ abaixo do real.",
      fonte: "NF-e · PED-0157",
      dados: { pedido_id: ped157.id, para: "conferido" },
    }),
  );
  const c = contaDoInsumo(e, insumos.get("cimento")!);
  e.propostas.push(propostaDeCompra(e, insumos.get("cimento")!, c, "almoxarifado · PED-0160"));
  // O histórico nasce com o que já aconteceu na obra (sem desfazer: é passado). A API guarda isto a cada escrita.
  const reg = (texto: string, quem: string, origem: string, dias: number, h = 9) =>
    e.registro.push({
      id: uuid7(),
      tenant_id: TENANT,
      criado_em: diasAtras(dias, h),
      quem,
      quem_nome: quem,
      obra_id: obra.id,
      origem,
      texto,
      proposta_id: null,
      desfazer: null,
      desfeito: false,
    });
  reg("PED-0149: recebido → conferido · 4.000 un de Bloco cerâmico 14×19×29", "Joana (mestre)", "tela", 20);
  reg("PED-0150: recebido → conferido · 30 m³ de Areia média lavada", "Joana (mestre)", "tela", 18);
  reg("Saída de 1.050 un de Bloco cerâmico 14×19×29 · Alvenaria do térreo", "Joana (mestre)", "tela", 9);
  reg("Saída de 54 sc de Cimento CP-II 50 kg · Contrapiso do térreo", "Joana (mestre)", "tela", 6);
  reg("Saída de 18 m³ de Areia média lavada · Reboco interno", "Joana (mestre)", "tela", 5);
  reg("PED-0158: aprovado → em_transito", "Rizzi", "tela", 5, 14);
  reg("Saída de 190 un de Bloco cerâmico 14×19×29 · Quebra no descarregamento", "Joana (mestre)", "whatsapp", 4);
  reg("PED-0160: aprovado → enviado", "Rizzi", "tela", 3, 11);
  reg("PED-0167 criado: 600 kg de Aço CA-50 10 mm com Gerdau · distribuidor Campinas (R$ 4.020,00)", "Rizzi", "tela", 1, 16);
  return e;
}

/** AAAA-MM-DD no fuso do canteiro, como a API grava `UsoIA.dia`. */
const hojeSP = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

/** 45 dias de consumo fictício, determinístico (sem Math.random) para a tela não mudar a cada reinício. */
function semearUso(obraA: string, obraB: string): EstadoDemo["uso"] {
  const linhas: EstadoDemo["uso"] = [];
  for (let d = 44; d >= 0; d--) {
    const t = new Date();
    t.setDate(t.getDate() - d);
    const dia = hojeSP(t);
    const fds = [0, 6].includes(t.getDay());
    const onda = (d * 7919) % 13; // pseudo-aleatório estável
    if (fds && onda % 3) continue;
    const custo = (fds ? 40_000 : 120_000) + onda * 31_000;
    linhas.push({ dia, obra_id: obraA, rota: "conversa", custo, tokens: Math.round(custo / 9) });
    if (onda % 4 === 0) linhas.push({ dia, obra_id: obraA, rota: "nf", custo: 60_000 + onda * 5_000, tokens: 9_000 });
    if (!fds && d % 7 === 1) linhas.push({ dia, obra_id: null, rota: "briefing", custo: 45_000, tokens: 5_200 });
    if (onda > 9) linhas.push({ dia, obra_id: obraB, rota: "conversa", custo: 70_000, tokens: 7_800 });
  }
  return linhas;
}

/* ---------- consultas ---------- */

const g = globalThis as unknown as { __canteiroDemo?: EstadoDemo };
/** Um estado por processo; sobrevive ao recarregamento de módulo do `next dev`. */
export const estado = () => (g.__canteiroDemo ??= semear());
export const reiniciarDemo = () => {
  g.__canteiroDemo = semear();
  return g.__canteiroDemo;
};

export function saldoDe(e: EstadoDemo, insumoId: string) {
  return e.movimentos.filter((m) => m.insumo_id === insumoId).reduce((s, m) => s + efeitoNoSaldo(m), 0);
}

export function contaDoInsumo(e: EstadoDemo, i: ItemDemo): Conta {
  const ps = e.pedidos.filter((p) => p.insumo_id === i.id);
  const soma = (sts: StatusPedido[]) => ps.filter((p) => sts.includes(p.status)).reduce((s, p) => s + p.quantidade, 0);
  return contaDeFalta({ precisa: i.precisa_ate_o_fim, saldo: saldoDe(e, i.id), a_caminho: soma(A_CAMINHO), cotando: soma(EM_COTACAO) });
}

export function linhaDeConta(c: Conta, un: string) {
  const n = (v: number) => fmtQtdUn(v, un);
  return `precisa ${n(c.precisa)} − saldo ${n(c.saldo)} − a caminho ${n(c.a_caminho)} − em cotação ${n(c.cotando)} = falta ${n(c.falta)} → comprar ${n(c.comprar)}`;
}

function chaveDe(e: EstadoDemo, insumoId: string) {
  for (const [k, v] of e.insumos) if (v.id === insumoId) return k;
  return "";
}

function novaProposta(e: EstadoDemo, p: Pick<Proposta, "obra_id" | "tipo" | "titulo" | "conta" | "fonte" | "dados"> & { justificativa?: string }): Proposta {
  return {
    id: uuid7(),
    tenant_id: TENANT,
    criado_em: agoraISO(),
    sugerido_por: "agente",
    status: "pendente",
    decidido_por: null,
    decidido_em: null,
    motivo_recusa: null,
    decidido_por_nome: null,
    justificativa: "",
    ajustada: false,
    dados_originais: null,
    ...p,
  };
}

export function propostaDeCompra(e: EstadoDemo, i: ItemDemo, c: Conta, fonte: string): Proposta {
  const ref = REFERENCIA[chaveDe(e, i.id)] ?? { fornecedor: "Fornecedor a definir", centavosPorUn: 0 };
  const valor = Math.round((c.comprar * ref.centavosPorUn) / 1000);
  return novaProposta(e, {
    obra_id: i.obra_id,
    tipo: "criar_pedido",
    titulo: `Comprar ${fmtQtdUn(c.comprar, i.unidade)} de ${i.nome} · ${ref.fornecedor}`,
    conta: linhaDeConta(c, i.unidade),
    justificativa: `Pela conta, faltam ${fmtQtdUn(c.falta, i.unidade)} até o fim da obra; ${ref.fornecedor} é o fornecedor de referência.`,
    fonte,
    dados: { insumo_id: i.id, quantidade: c.comprar, fornecedor: ref.fornecedor, valor },
  });
}

/* ---------- login ---------- */

function emitir(e: EstadoDemo, u: Usuario): RespostaEntrar {
  const acesso = `demo.${uuid7()}`;
  const renovacao = `demo.${uuid7()}`;
  e.acessos.set(acesso, { usuario: u, vence: Date.now() + VIDA_ACESSO_S * 1000 });
  e.renovacoes.set(renovacao, u);
  return { acesso, renovacao, usuario: u };
}

/**
 * Na demonstração qualquer senha entra (os dados são fictícios); e-mail começando por "leitura" entra como viewer e
 * por "master" entra como master (o único papel que troca a chave própria).
 */
export function entrarDemo(email: string, senha: string): RespostaEntrar | null {
  const e = estado();
  const em = email.trim().toLowerCase();
  if (!em || !senha) return null;
  const u = em.startsWith("leitura") ? e.usuarios[1]! : em.startsWith("master") ? e.usuarios[2]! : e.usuarios[0]!;
  e.emails.set(u.id, em);
  return emitir(e, u);
}

/** A renovação troca a cada uso, como no contrato: a antiga deixa de valer. */
export function renovarDemo(renovacao: string): RespostaEntrar | null {
  const e = estado();
  const u = e.renovacoes.get(renovacao);
  if (!u) return null;
  e.renovacoes.delete(renovacao);
  return emitir(e, u);
}

export function sairDemo(renovacao: string | undefined) {
  if (renovacao) estado().renovacoes.delete(renovacao);
}

export function usuarioDoAcesso(authorization: string | null): Usuario | null {
  const t = authorization?.match(/^Bearer (.+)$/)?.[1];
  const a = t ? estado().acessos.get(t) : undefined;
  return a && a.vence > Date.now() ? a.usuario : null;
}

export const VIDA_ACESSO_DEMO_S = VIDA_ACESSO_S;

/** Acrescenta mensagens à sessão (cria se não existir), como POST /sessoes + POST /sessoes/{id}/mensagens. */
export function gravarNaSessao(id: string, u: Usuario, obraId: string | null, titulo: string, novas: Pick<MensagemSessao, "papel" | "conteudo">[]) {
  const e = estado();
  const agora = agoraISO();
  let x = e.sessoes.get(id);
  if (!x) {
    x = {
      sessao: {
        id,
        tenant_id: TENANT,
        dono: u.id,
        obra_id: obraId,
        titulo: titulo.slice(0, 80),
        abas: [],
        total_mensagens: 0,
        criado_em: agora,
        atualizado_em: agora,
      },
      mensagens: [],
    };
    e.sessoes.set(id, x);
  }
  for (const m of novas) {
    const seq = x.sessao.total_mensagens++;
    x.mensagens.push({ id: `${id}-${String(seq).padStart(6, "0")}`, sessao_id: id, seq, criado_em: agora, ...m });
  }
  x.sessao.atualizado_em = agora;
}

/* ---------- escrita (o que a API faria) ---------- */

function registrar(e: EstadoDemo, u: Usuario, r: Pick<EntradaRegistro, "obra_id" | "texto" | "proposta_id" | "desfazer" | "origem">) {
  const ent: EntradaRegistro = {
    id: uuid7(),
    tenant_id: TENANT,
    criado_em: agoraISO(),
    quem: u.nome,
    quem_nome: u.nome,
    usuario_id: u.id,
    desfeito: false,
    ...r,
  };
  e.registro.push(ent);
  return ent;
}

function movimentar(e: EstadoDemo, u: Usuario, m: Pick<Movimento, "obra_id" | "insumo_id" | "tipo" | "quantidade"> & Partial<Movimento>) {
  const mov: Movimento = {
    id: uuid7(),
    tenant_id: TENANT,
    criado_em: agoraISO(),
    destino: null,
    origem_doc: null,
    quem: u.nome,
    origem: "tela",
    desfaz: null,
    ...m,
  };
  efeitoNoSaldo(mov);
  e.movimentos.push(mov);
  return mov;
}

function obraPorId(e: EstadoDemo, id: string) {
  const o = e.obras.find((x) => x.id === id);
  if (!o) throw new NaoEncontrado("Obra não encontrada.");
  return o;
}

function pedidoPorIdOuNulo(e: EstadoDemo, id: string) {
  return e.pedidos.find((x) => x.id === id) ?? null;
}

function pedidoPorId(e: EstadoDemo, id: string) {
  const p = e.pedidos.find((x) => x.id === id);
  if (!p) throw new NaoEncontrado("Pedido não encontrado.");
  return p;
}

interface Recebimento {
  quantidade_recebida?: number | null;
  nf?: string | null;
}

/**
 * Avança o pedido como servicos/pedidos.preparar_avancar: conferir dá entrada do que CHEGOU (padrão: o pedido inteiro)
 * e guarda a NF. Devolve o texto do registro e a receita de desfazer.
 */
function avancar(e: EstadoDemo, u: Usuario, p: Pedido, para: StatusPedido, origem: string, rec: Recebimento = {}) {
  const temRec = rec.quantidade_recebida != null || !!rec.nf;
  if (temRec && para !== "conferido") throw new RegraViolada("Quantidade recebida e NF só valem para conferir.");
  if (rec.quantidade_recebida != null && !(Number.isInteger(rec.quantidade_recebida) && rec.quantidade_recebida > 0))
    throw new RegraViolada("A quantidade recebida tem de ser maior que zero.");
  if (rec.nf && rec.nf.length > 60) throw new RegraViolada("Número da NF muito longo.");
  validarTransicao(p.status, para);
  const de = p.status;
  let movimento_id: string | null = null;
  let texto = `${p.numero}: ${de} → ${para}`;
  if (para === "conferido") {
    const q = rec.quantidade_recebida ?? p.quantidade;
    const nf = rec.nf?.trim() || null;
    const un = unidadeDe(e, p.insumo_id);
    movimento_id = movimentar(e, u, {
      obra_id: p.obra_id,
      insumo_id: p.insumo_id,
      tipo: "entrada",
      quantidade: q,
      origem_doc: nf ? `${p.numero} · NF ${nf}` : p.numero,
      origem,
    }).id;
    p.quantidade_recebida = q;
    p.nf = nf;
    if (q !== p.quantidade) texto += ` · chegaram ${fmtQtdUn(q, "")} de ${fmtQtdUn(p.quantidade, un)}`;
    if (nf) texto += ` (NF ${nf})`;
  }
  p.status = para;
  return { texto, desfazer: { op: "voltar_pedido", pedido_id: p.id, de, para, movimento_id } };
}

function unidadeDe(e: EstadoDemo, insumoId: string) {
  for (const i of e.insumos.values()) if (i.id === insumoId) return i.unidade;
  return "";
}

function criarPedido(e: EstadoDemo, obraId: string, d: DadosCriarPedido, aprovado: boolean) {
  if (!e.obras.some((o) => o.id === obraId)) throw new NaoEncontrado("Obra não encontrada.");
  const ins = [...e.insumos.values()].find((i) => i.id === d.insumo_id && i.obra_id === obraId);
  if (!ins) throw new NaoEncontrado("Insumo não encontrado nesta obra.");
  if (!(Number.isInteger(d.quantidade) && d.quantidade > 0)) throw new RegraViolada("A quantidade tem de ser maior que zero.");
  if (!(Number.isInteger(d.valor) && d.valor >= 0)) throw new RegraViolada("Valor inválido.");
  if (!String(d.fornecedor ?? "").trim()) throw new RegraViolada("Diga o fornecedor.");
  const status: StatusPedido = aprovado ? "aprovado" : "em_cotacao";
  const p: Pedido = {
    id: uuid7(),
    tenant_id: TENANT,
    criado_em: agoraISO(),
    numero: `PED-${String(++e.contadorPedido).padStart(4, "0")}`,
    obra_id: obraId,
    insumo_id: d.insumo_id,
    quantidade: d.quantidade,
    fornecedor: d.fornecedor.trim(),
    valor: d.valor,
    status,
    previsao: d.previsao ?? null,
    rastreio: null,
    quantidade_recebida: null,
    nf: null,
  };
  e.pedidos.push(p);
  return {
    pedido: p,
    texto: `${p.numero} criado: ${fmtQtdUn(p.quantidade, ins.unidade)} de ${ins.nome} com ${p.fornecedor} (${fmtReais(p.valor)})${aprovado ? " · aprovado" : ""}`,
    desfazer: { op: "cancelar_pedido", pedido_id: p.id, status_criado: status },
  };
}

/** Os campos que dá para mudar antes de aprovar, por tipo (o mesmo que a API aceita em `ajustes`). */
const AJUSTAVEIS: Record<Proposta["tipo"], string[]> = {
  criar_pedido: ["quantidade", "fornecedor", "valor", "previsao"],
  avancar_pedido: ["quantidade_recebida", "nf"],
  ajuste_estoque: ["quantidade", "motivo"],
};

function descreverAjuste(antes: Record<string, unknown>, depois: Record<string, unknown>, un: string) {
  const fmt = (k: string, v: unknown) => (typeof v === "number" ? (k === "valor" ? fmtReais(v) : fmtQtdUn(v, un)) : v == null || v === "" ? "—" : String(v));
  return Object.keys(depois)
    .filter((k) => antes[k] !== depois[k])
    .map((k) => `${k.replace("_", " ")} ${fmt(k, antes[k])} → ${fmt(k, depois[k])}`)
    .join("; ");
}

export class NaoEncontrado extends Error {}
/** 409 do contrato: já decidido, já desfeito, fora de ordem. */
export class Conflito extends Error {}
export class Proibido extends Error {}

function exigirAdmin(u: Usuario) {
  if (u.papel === "viewer") throw new Proibido("Seu papel (leitura) não aprova nem opera. Peça a um admin.");
}

export function aprovar(id: string, u: Usuario, ajustes: Record<string, unknown> | null = null) {
  const e = estado();
  exigirAdmin(u);
  const pr = e.propostas.find((p) => p.id === id);
  if (!pr) throw new NaoEncontrado("Proposta não encontrada.");
  if (pr.status !== "pendente") throw new Conflito("Esta proposta já foi decidida.");
  const originais = pr.dados;
  let dados = pr.dados;
  if (ajustes && Object.keys(ajustes).length) {
    const fora = Object.keys(ajustes).filter((k) => !AJUSTAVEIS[pr.tipo].includes(k));
    if (fora.length) throw new RegraViolada(`Não dá para ajustar: ${fora.join(", ")}.`);
    if (pr.tipo === "avancar_pedido" && pr.dados.para !== "conferido") throw new RegraViolada("Só a conferência tem o que ajustar.");
    if (pr.tipo === "ajuste_estoque" && ajustes.quantidade === 0) throw new RegraViolada("Ajuste de zero não muda nada.");
    dados = { ...pr.dados, ...ajustes };
  }
  let desfazer: Record<string, unknown>;
  let texto: string;
  const insumoId = String(dados.insumo_id ?? "");
  if (pr.tipo === "criar_pedido") {
    // Aprovar a compra do agente já é a aprovação do pedido: ele nasce aprovado, sem um segundo "Aprovar" no quadro.
    const r = criarPedido(e, pr.obra_id, dados as unknown as DadosCriarPedido, true);
    ({ texto, desfazer } = r);
  } else if (pr.tipo === "avancar_pedido") {
    const d = dados as unknown as DadosAvancarPedido;
    ({ texto, desfazer } = avancar(e, u, pedidoPorId(e, d.pedido_id), d.para, "agente", d));
  } else {
    const d = dados as unknown as DadosAjusteEstoque;
    const m = movimentar(e, u, { obra_id: pr.obra_id, insumo_id: d.insumo_id, tipo: "ajuste", quantidade: d.quantidade, destino: d.motivo, origem: "agente" });
    desfazer = { op: "estornar_movimento", movimento_id: m.id };
    texto = `Ajuste de ${d.quantidade > 0 ? "+" : ""}${fmtQtdUn(d.quantidade, unidadeDe(e, d.insumo_id))}: ${d.motivo}`;
  }
  if (dados !== originais) {
    const un = unidadeDe(e, insumoId || String((pedidoPorIdOuNulo(e, String(dados.pedido_id ?? "")) ?? { insumo_id: "" }).insumo_id));
    texto += ` · ajustado: ${descreverAjuste(originais, ajustes!, un)}`;
    pr.dados = dados;
    pr.dados_originais = originais;
    pr.ajustada = true;
  }
  pr.status = "aprovada";
  pr.decidido_por = u.id;
  pr.decidido_por_nome = u.nome;
  pr.decidido_em = agoraISO();
  const registro = registrar(e, u, { obra_id: pr.obra_id, texto, proposta_id: pr.id, desfazer, origem: "agente" });
  pr.registro_id = registro.id;
  return { proposta: pr, registro };
}

export function recusar(id: string, motivo: string, u: Usuario) {
  const e = estado();
  exigirAdmin(u);
  const pr = e.propostas.find((p) => p.id === id);
  if (!pr) throw new NaoEncontrado("Proposta não encontrada.");
  if (pr.status !== "pendente") throw new Conflito("Esta proposta já foi decidida.");
  if (!motivo.trim()) throw new RegraViolada("Diga o motivo da recusa: o agente aprende com ele.");
  Object.assign(pr, { status: "recusada", motivo_recusa: motivo.trim(), decidido_por: u.id, decidido_por_nome: u.nome, decidido_em: agoraISO() });
  registrar(e, u, { obra_id: pr.obra_id, texto: `Recusou: ${pr.titulo} (${motivo.trim()})`, proposta_id: pr.id, desfazer: null, origem: "tela" });
  return pr;
}

/** Estorno como servicos/estoque.preparar_estorno: o tipo inverso (ajuste troca o sinal), uma vez só. */
function estornar(e: EstadoDemo, u: Usuario, movId: string) {
  const m = e.movimentos.find((x) => x.id === movId);
  if (!m) throw new NaoEncontrado("Movimento não encontrado.");
  if (e.movimentos.some((x) => x.desfaz === m.id)) throw new Conflito("Este movimento já foi estornado.");
  const inverso: Record<TipoMovimento, TipoMovimento> = {
    entrada: "saida",
    saida: "entrada",
    ajuste: "ajuste",
    transferencia_entrada: "transferencia_saida",
    transferencia_saida: "transferencia_entrada",
  };
  return movimentar(e, u, {
    obra_id: m.obra_id,
    insumo_id: m.insumo_id,
    tipo: inverso[m.tipo],
    quantidade: m.tipo === "ajuste" ? -m.quantidade : m.quantidade,
    desfaz: m.id,
    origem_doc: m.origem_doc,
    destino: "Estorno (desfazer)",
  });
}

export function desfazer(registroId: string, u: Usuario) {
  const e = estado();
  exigirAdmin(u);
  const ent = e.registro.find((r) => r.id === registroId);
  if (!ent) throw new NaoEncontrado("Entrada do registro não encontrada.");
  if (ent.desfeito) throw new Conflito("Isto já foi desfeito.");
  if (!ent.desfazer) throw new RegraViolada("Esta entrada não tem como ser desfeita.");
  const d = ent.desfazer as { op: string; pedido_id: string; de: StatusPedido; para: StatusPedido; status_criado?: StatusPedido; movimento_id: string | null };
  let texto: string;
  if (d.op === "cancelar_pedido") {
    const p = pedidoPorId(e, d.pedido_id);
    if (p.status !== (d.status_criado ?? "em_cotacao")) throw new Conflito(`${p.numero} já andou (${p.status}); cancele pelo fluxo do pedido.`);
    p.status = "cancelado";
    texto = `Desfeito: ${p.numero} cancelado`;
  } else if (d.op === "voltar_pedido") {
    const p = pedidoPorId(e, d.pedido_id);
    if (p.status !== d.para) throw new Conflito(`${p.numero} já mudou de status desde então; não dá para desfazer.`);
    if (d.movimento_id) estornar(e, u, d.movimento_id);
    p.status = d.de;
    p.quantidade_recebida = null;
    p.nf = null;
    texto = `Desfeito: ${p.numero} voltou para ${d.de}`;
  } else if (d.op === "restaurar_obra") {
    const r = ent.desfazer as unknown as { obra_id: string; antes: Record<string, unknown>; depois: Record<string, unknown> };
    const o = obraPorId(e, r.obra_id) as unknown as Record<string, unknown>;
    if (Object.entries(r.depois).some(([k, v]) => o[k] !== v)) throw new Conflito("A obra mudou de novo desde então; não dá para desfazer.");
    Object.assign(o, r.antes);
    texto = `Desfeito: dados de ${o.nome} voltaram ao que eram`;
  } else if (d.op === "reabrir_orcamento") {
    const o = obraPorId(e, (ent.desfazer as { obra_id: string }).obra_id);
    if (o.status !== "em_andamento") throw new Conflito("A obra já mudou de status; não dá para reabrir o orçamento.");
    o.status = "em_orcamento";
    texto = `Desfeito: orçamento de ${o.nome} reaberto`;
  } else if (d.op === "estornar_movimento" && d.movimento_id) {
    const m = estornar(e, u, d.movimento_id);
    texto = `Desfeito: estorno de ${fmtQtdUn(Math.abs(m.quantidade), unidadeDe(e, m.insumo_id))}`;
  } else throw new RegraViolada("Esta entrada não tem como ser desfeita.");
  ent.desfeito = true;
  const pr = ent.proposta_id ? e.propostas.find((p) => p.id === ent.proposta_id) : undefined;
  if (pr && pr.status === "aprovada") pr.status = "desfeita";
  return registrar(e, u, { obra_id: ent.obra_id, texto, proposta_id: null, desfazer: null, origem: "tela" });
}

/** POST /obras/{id}/movimentos: o lançamento da tela, com a mesma checagem da API (curva A, idempotência). */
function lancar(e: EstadoDemo, u: Usuario, obraId: string, c: Record<string, unknown>) {
  exigirAdmin(u);
  const tipo = c.tipo as TipoMovimento;
  if (!["entrada", "saida", "ajuste"].includes(tipo)) throw new RegraViolada("tipo inválido");
  const q = Number(c.quantidade);
  if (!Number.isInteger(q) || (tipo !== "ajuste" && q <= 0) || (tipo === "ajuste" && q === 0)) throw new RegraViolada("Quantidade inválida.");
  const chave = String(c.chave_idempotencia ?? "");
  if (chave.length < 8) throw new RegraViolada("chave_idempotencia obrigatória.");
  const ins = [...e.insumos.values()].find((i) => i.id === c.insumo_id && i.obra_id === obraId);
  if (!ins) throw new NaoEncontrado("Insumo não encontrado nesta obra.");
  const destino = typeof c.destino === "string" && c.destino.trim() ? c.destino.trim() : null;
  const origem_doc = typeof c.origem_doc === "string" && c.origem_doc.trim() ? c.origem_doc.trim() : null;
  const repetido = e.idempotencia.get(chave);
  if (repetido) {
    if (repetido.insumo_id !== ins.id || repetido.tipo !== tipo || repetido.quantidade !== q)
      throw new Conflito("Esta chave já foi usada com outro lançamento.");
    return { mov: repetido, registro: e.registro.find((r) => (r.desfazer as { movimento_id?: string } | null)?.movimento_id === repetido.id) ?? null };
  }
  if (tipo === "saida" && ins.curva === "A" && !destino) throw new RegraViolada("Saída de item curva A precisa da frente de serviço (para onde foi).");
  const mov = movimentar(e, u, { obra_id: obraId, insumo_id: ins.id, tipo, quantidade: q, destino, origem_doc });
  e.idempotencia.set(chave, mov);
  const n = fmtQtdUn(Math.abs(q), ins.unidade);
  const texto =
    tipo === "saida"
      ? `Saída de ${n} de ${ins.nome}${destino ? ` · ${destino}` : ""}`
      : tipo === "entrada"
        ? `Entrada de ${n} de ${ins.nome}${origem_doc ? ` · ${origem_doc}` : ""}`
        : `Ajuste de ${q > 0 ? "+" : "−"}${n} em ${ins.nome}${destino ? ` · ${destino}` : ""}`;
  const registro = registrar(e, u, { obra_id: obraId, texto, proposta_id: null, desfazer: { op: "estornar_movimento", movimento_id: mov.id }, origem: "tela" });
  return { mov, registro };
}

/* ---------- página inicial e conta ---------- */

/** GET /obras/resumo: mesmas regras da API (servicos/resumo.py), somadas aqui. */
export function resumoObras(e: EstadoDemo) {
  const abertos = new Set<StatusPedido>([...A_CAMINHO, ...EM_COTACAO]);
  return [...e.obras]
    .sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR"))
    .map((obra) => {
      const ped = e.pedidos.filter((p) => p.obra_id === obra.id && abertos.has(p.status));
      const insumos = [...e.insumos.values()].filter((i) => i.obra_id === obra.id);
      // A API usa só o registro; a demonstração nasce com o registro vazio, então cai no último movimento da obra.
      const datas = [...e.registro.filter((r) => r.obra_id === obra.id), ...e.movimentos.filter((m) => m.obra_id === obra.id)].map((x) => x.criado_em);
      return {
        obra,
        pendencias: e.propostas.filter((p) => p.obra_id === obra.id && p.status === "pendente").length,
        falta_comprar: insumos.filter((i) => contaDoInsumo(e, i).comprar > 0).length,
        pedidos_abertos: ped.length,
        valor_pedidos_abertos: ped.reduce((t, p) => t + p.valor, 0),
        nf_para_conferir: ped.filter((p) => p.status === "recebido").length,
        ultima_atividade: datas.sort().at(-1) ?? null,
      };
    });
}

function chaveDemo(e: EstadoDemo) {
  return e.chave ? { ativa: true, final: e.chave.final, cadastrada_em: e.chave.cadastrada_em } : { ativa: false, final: null, cadastrada_em: null };
}

function creditosDemo(e: EstadoDemo, u: Usuario) {
  return { saldo_microdolares: e.creditos.saldo, franquia: e.creditos.franquia, chave_propria: !!e.chave, usuario_id: u.id, tenant_id: TENANT };
}

export function minhaConta(e: EstadoDemo, u: Usuario): MinhaConta {
  return {
    usuario: { id: u.id, nome: u.nome, email: e.emails.get(u.id) ?? "demo@canteiro.app", papel: u.papel },
    tenant: { id: TENANT, nome: "Construtora Exemplo" },
    chave_propria: e.chave ? chaveDemo(e) : null,
    creditos: creditosDemo(e, u),
  };
}

function exigirMaster(u: Usuario) {
  if (u.papel !== "master") throw new Proibido("Só quem tem o papel master troca a chave da Anthropic.");
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** GET /uso: soma por dia, obra e rota a partir das linhas, como servicos/uso.py. */
export function relatorioUso(e: EstadoDemo, de: string, ate: string) {
  const total = { custo: 0, tokens: 0 };
  const por = { dia: new Map<string, typeof total>(), obra_id: new Map<string | null, typeof total>(), rota: new Map<string, typeof total>() };
  for (const l of e.uso.filter((x) => x.dia >= de && x.dia <= ate)) {
    total.custo += l.custo;
    total.tokens += l.tokens;
    for (const k of ["dia", "obra_id", "rota"] as const) {
      const m = por[k] as Map<string | null, typeof total>;
      const s = m.get(l[k]) ?? { custo: 0, tokens: 0 };
      s.custo += l.custo;
      s.tokens += l.tokens;
      m.set(l[k], s);
    }
  }
  const desc = <K>(m: Map<K, typeof total>) => [...m].sort((x, y) => y[1].custo - x[1].custo);
  return {
    total,
    por_dia: [...por.dia].sort((x, y) => x[0].localeCompare(y[0])).map(([dia, s]) => ({ dia, ...s })),
    por_obra: desc(por.obra_id).map(([obra_id, s]) => ({ obra_id, ...s })),
    por_rota: desc(por.rota).map(([rota, s]) => ({ rota, ...s })),
  };
}

/* ---------- roteamento das rotas do contrato ---------- */

/** Mais novos primeiro e o cursor `antes_de` exclusivo, como a API (aqui sem completar empate de instante: na demonstração
 * duas escritas no mesmo milissegundo não acontecem na prática). */
function paginar<T extends { criado_em: string }>(xs: T[], params: URLSearchParams, limite: number): T[] {
  const antes = params.get("antes_de");
  return xs
    .filter((x) => !antes || x.criado_em < antes)
    .sort((x, y) => y.criado_em.localeCompare(x.criado_em))
    .slice(0, limite);
}

export interface RespostaDemo {
  status: number;
  corpo: unknown;
}

const ok = (corpo: unknown, status = 200): RespostaDemo => ({ status, corpo });
const erro = (status: number, detail: string): RespostaDemo => ({ status, corpo: { detail } });

const STATUS_PROPOSTA: StatusProposta[] = ["pendente", "aprovada", "recusada", "desfeita"];

/** Responde uma rota do contrato. `caminho` sem a barra inicial, já separado: ["obras", "<id>", "insumos"]. */
export function responder(metodo: string, caminho: string[], params: URLSearchParams, corpo: unknown, u: Usuario): RespostaDemo {
  const e = estado();
  const c = (corpo ?? {}) as Record<string, unknown>;
  const [a, id, b, id2, c2] = caminho;
  try {
    if (metodo === "GET" && a === "obras" && !id) return ok(e.obras);
    // Antes do ramo obras/{id}: "resumo" não é ID de obra.
    if (metodo === "GET" && a === "obras" && id === "resumo" && !b) return ok(resumoObras(e));
    if (a === "conta" && !id && metodo === "GET") return ok(minhaConta(e, u));
    if (a === "conta" && id === "chave-anthropic" && !b) {
      if (metodo === "GET") return ok(chaveDemo(e));
      if (metodo === "PUT") {
        exigirMaster(u);
        const chave = String(c.chave ?? "").trim();
        if (!/^sk-ant-/.test(chave) || chave.length < 20 || chave.length > 300)
          return erro(422, "Isto não parece uma chave da API da Anthropic (começa com sk-ant-).");
        e.chave = { final: chave.slice(-4), cadastrada_em: agoraISO() };
        return ok({ chave_propria: true, final: e.chave.final });
      }
      if (metodo === "DELETE") {
        exigirMaster(u);
        e.chave = null;
        return ok({ chave_propria: false, final: null });
      }
    }
    if (metodo === "GET" && a === "uso" && !id) {
      const de = params.get("de") ?? "";
      const ate = params.get("ate") ?? "";
      if (!DIA.test(de) || !DIA.test(ate)) return erro(422, "de e ate no formato AAAA-MM-DD.");
      return ok(relatorioUso(e, de, ate));
    }
    if (metodo === "POST" && a === "obras" && !id) {
      exigirAdmin(u);
      const chave = String(c.chave_idempotencia ?? "");
      if (chave.length < 8 || chave.length > 64) return erro(422, "chave_idempotencia inválida.");
      const d = dadosObra(c);
      if (!d.nome) return erro(422, "Dê um nome para a obra.");
      const ja = e.obrasPorChave.get(chave);
      if (ja) return ja.nome === d.nome ? ok({ ...ja, registro_id: null }) : erro(409, "Esta chave de idempotência já foi usada para outra obra.");
      const o: Obra = { id: uuid7(), tenant_id: TENANT, criado_em: agoraISO(), ...OBRA_VAZIA, ...d, nome: d.nome, status: "em_orcamento" };
      e.obras.push(o);
      e.obrasPorChave.set(chave, o);
      const reg = registrar(e, u, { obra_id: o.id, texto: `Criou a obra ${o.nome}`, proposta_id: null, desfazer: null, origem: "tela" });
      return ok({ ...o, registro_id: reg.id }, 201);
    }
    if (a === "obras" && id) {
      if (!e.obras.some((o) => o.id === id)) return erro(404, "Obra não encontrada.");
      if (metodo === "PATCH" && !b) {
        exigirAdmin(u);
        const o = obraPorId(e, id) as unknown as Record<string, unknown>;
        const d = dadosObra(c) as Record<string, unknown>;
        const mudou = Object.keys(d).filter((k) => o[k] !== d[k]);
        if (!mudou.length) return ok({ ...o, registro_id: null });
        const antes = Object.fromEntries(mudou.map((k) => [k, o[k]]));
        const depois = Object.fromEntries(mudou.map((k) => [k, d[k]]));
        Object.assign(o, depois);
        const reg = registrar(e, u, {
          obra_id: id,
          texto: `Atualizou a obra ${o.nome}: ${mudou.map((k) => ROTULO_CAMPO[k] ?? k).join(", ")}`,
          proposta_id: null,
          desfazer: { op: "restaurar_obra", obra_id: id, antes, depois },
          origem: "tela",
        });
        return ok({ ...o, registro_id: reg.id });
      }
      if (metodo === "POST" && b === "orcamento") {
        exigirAdmin(u);
        const existentes = () =>
          [...e.insumos.values()]
            .filter((i) => i.obra_id === id)
            .map((i) => ({ nome: i.nome, unidade: i.unidade, precisa: i.precisa_ate_o_fim, valor: i.valor_unitario }));
        const arq = c.arquivo as { nome: string; texto: string } | undefined;
        if ((id2 === "ler" || id2 === "importar") && !arq) return erro(422, "Envie o arquivo da planilha.");
        if (id2 === "ler") return ok(lerPlanilhaDemo(arq!.texto, arq!.nome));
        if (id2 === "importar") {
          if (/\.xlsx?$/i.test(arq!.nome)) return erro(422, "Na demonstração só dá para importar CSV.");
          const mapa = JSON.parse(String(c.mapeamento ?? "{}")) as Mapeamento;
          const previa = previaDemo(arq!.texto, mapa, existentes());
          if (c.aplicar !== "true" || previa.erros.length) return ok(previa);
          if (!previa.linhas.length) return erro(422, "Nenhuma linha para importar.");
          for (const l of previa.linhas) {
            const ex = [...e.insumos.values()].find((i) => i.obra_id === id && nomeChave(i.nome) === nomeChave(l.nome));
            if (ex) Object.assign(ex, { precisa_ate_o_fim: l.quantidade, valor_unitario: l.valor_unitario, curva: l.curva });
            else {
              const ins: ItemDemo = {
                id: uuid7(),
                tenant_id: TENANT,
                criado_em: agoraISO(),
                obra_id: id,
                nome: l.nome,
                unidade: l.unidade,
                precisa_ate_o_fim: l.quantidade,
                curva: l.curva,
                valor_unitario: l.valor_unitario,
              };
              e.insumos.set(`orc-${ins.id}`, ins);
            }
          }
          registrar(e, u, {
            obra_id: id,
            texto: `Importou o orçamento: ${previa.novos} novos, ${previa.atualizados} atualizados (${fmtReais(previa.total)})`,
            proposta_id: null,
            desfazer: null,
            origem: "tela",
          });
          return ok({ ...previa, aplicado: true });
        }
        if (id2 === "aprovar") {
          const o = obraPorId(e, id);
          if (o.status !== "em_orcamento") return erro(409, "O orçamento já foi aprovado.");
          const its = [...e.insumos.values()].filter((i) => i.obra_id === id && i.precisa_ate_o_fim > 0);
          if (!its.length) return erro(422, "Importe ou cadastre o orçamento antes de aprovar.");
          const total = its.reduce((t, i) => t + Math.round((i.precisa_ate_o_fim * i.valor_unitario) / 1000), 0);
          o.status = "em_andamento";
          const reg = registrar(e, u, {
            obra_id: id,
            texto: `Aprovou o orçamento de ${o.nome} (${its.length} ${its.length === 1 ? "insumo" : "insumos"}, ${fmtReais(total)})`,
            proposta_id: null,
            desfazer: { op: "reabrir_orcamento", obra_id: id },
            origem: "tela",
          });
          return ok({ ...o, registro_id: reg.id });
        }
      }
      if (metodo === "GET" && b === "insumos" && !id2) {
        const itens = [...e.insumos.values()].filter((i) => i.obra_id === id).map((insumo) => ({ insumo, conta: contaDoInsumo(e, insumo) }));
        return ok(itens);
      }
      if (metodo === "GET" && b === "insumos" && id2 && c2 === "movimentos") {
        const lim = Math.min(200, Number(params.get("limite") ?? 50) || 50);
        return ok(
          paginar(
            e.movimentos.filter((m) => m.insumo_id === id2),
            params,
            lim,
          ),
        );
      }
      if (metodo === "GET" && b === "pedidos") {
        // ?status= pode repetir (a API filtra com "in")
        const sts = params.getAll("status");
        const lim = Math.min(500, Number(params.get("limite") ?? 100) || 100);
        return ok(
          paginar(
            e.pedidos.filter((p) => p.obra_id === id && (!sts.length || sts.includes(p.status))),
            params,
            lim,
          ),
        );
      }
      if (metodo === "POST" && b === "pedidos" && !id2) {
        exigirAdmin(u);
        const r = criarPedido(e, id, c as unknown as DadosCriarPedido, c.aprovado === true);
        const reg = registrar(e, u, { obra_id: id, texto: r.texto, proposta_id: null, desfazer: r.desfazer, origem: "tela" });
        return ok({ ...r.pedido, registro_id: reg.id }, 201);
      }
      if (metodo === "POST" && b === "insumos" && !id2) {
        exigirAdmin(u);
        const nome = String(c.nome ?? "")
          .replace(/\s+/g, " ")
          .trim();
        const unidade = String(c.unidade ?? "").trim();
        const curva = (c.curva ?? "C") as "A" | "B" | "C";
        if (!nome || nome.length > 120 || !unidade || unidade.length > 12 || !["A", "B", "C"].includes(curva)) return erro(422, "Dados do insumo inválidos.");
        const chave = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();
        if ([...e.insumos.values()].some((i) => i.obra_id === id && chave(i.nome) === chave(nome)))
          return erro(409, `'${nome}' já está cadastrado nesta obra.`);
        const ins: ItemDemo = {
          id: uuid7(),
          tenant_id: TENANT,
          criado_em: agoraISO(),
          obra_id: id,
          nome,
          unidade,
          curva,
          precisa_ate_o_fim: Number(c.precisa_ate_o_fim ?? 0),
          valor_unitario: Number(c.valor_unitario ?? 0),
        };
        e.insumos.set(`novo-${ins.id}`, ins);
        const reg = registrar(e, u, {
          obra_id: id,
          texto: `Cadastrou o insumo ${nome} (${unidade}, curva ${curva})`,
          proposta_id: null,
          desfazer: null,
          origem: "tela",
        });
        return ok({ ...ins, registro_id: reg.id }, 201);
      }
      if (metodo === "POST" && b === "movimentos" && !id2) {
        const r = lancar(e, u, id, c);
        return ok({ ...r.mov, registro_id: r.registro?.id ?? null }, 201);
      }
    }
    if (metodo === "POST" && a === "pedidos" && id && b === "avancar") {
      exigirAdmin(u);
      const p = pedidoPorId(e, id);
      const para = c.para as StatusPedido;
      const r = avancar(e, u, p, para, "tela", { quantidade_recebida: c.quantidade_recebida as number | undefined, nf: c.nf as string | undefined });
      const reg = registrar(e, u, { obra_id: p.obra_id, texto: r.texto, proposta_id: null, desfazer: r.desfazer, origem: "tela" });
      return ok({ ...p, registro_id: reg.id });
    }
    if (a === "propostas") {
      if (metodo === "GET" && !id) {
        const st = params.get("status");
        const ob = params.get("obra_id");
        if (st && !STATUS_PROPOSTA.includes(st as StatusProposta)) return erro(422, "status inválido");
        const lim = Math.min(500, Number(params.get("limite") ?? 100) || 100);
        return ok(
          paginar(
            e.propostas.filter((p) => (!st || p.status === st) && (!ob || p.obra_id === ob)),
            params,
            lim,
          ),
        );
      }
      if (metodo === "POST" && id && b === "aprovar") return ok(aprovar(id, u, (c.ajustes as Record<string, unknown> | undefined) ?? null));
      if (metodo === "POST" && id && b === "recusar") return ok(recusar(id, String(c.motivo ?? ""), u));
    }
    if (a === "registro") {
      if (metodo === "GET" && !id) {
        const ob = params.get("obra_id");
        const lim = Math.min(200, Number(params.get("limite") ?? 50) || 50);
        return ok(
          paginar(
            e.registro.filter((r) => !ob || r.obra_id === ob),
            params,
            lim,
          ),
        );
      }
      if (metodo === "POST" && id && b === "desfazer") return ok(desfazer(id, u));
    }
    if (metodo === "GET" && a === "sessoes" && !id) {
      const ob = params.get("obra_id");
      const lim = Math.min(100, Number(params.get("limite") ?? 30) || 30);
      return ok(
        [...e.sessoes.values()]
          .map((x) => x.sessao)
          .filter((s) => s.dono === u.id && (!ob || s.obra_id === ob) && (!params.get("antes_de") || s.atualizado_em < params.get("antes_de")!))
          .sort((x, y) => y.atualizado_em.localeCompare(x.atualizado_em))
          .slice(0, lim),
      );
    }
    if (metodo === "GET" && a === "sessoes" && id && b === "mensagens") {
      const s = e.sessoes.get(id);
      if (!s || s.sessao.dono !== u.id) return erro(404, "Conversa não encontrada.");
      const depois = Number(params.get("depois_de") ?? -1);
      const lim = Math.min(200, Number(params.get("limite") ?? 200) || 200);
      return ok(s.mensagens.filter((m) => m.seq > depois).slice(0, lim));
    }
    if (metodo === "GET" && a === "creditos") return ok(creditosDemo(e, u));
    return erro(404, "Rota não existe no contrato do MVP-0.");
  } catch (x) {
    if (x instanceof Proibido) return erro(403, x.message);
    if (x instanceof NaoEncontrado) return erro(404, x.message);
    if (x instanceof Conflito) return erro(409, x.message);
    if (x instanceof RegraViolada || x instanceof PlanilhaInvalida) return erro(422, x.message);
    throw x;
  }
}
