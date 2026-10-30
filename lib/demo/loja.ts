/**
 * Modo de demonstração: o próprio Next se passa pela API central, com a Casa Vila Nova do contrato em memória.
 * Serve para trabalhar na web antes de a API e o agente existirem. Segue o contrato ao pé da letra (rotas, códigos,
 * formatos), inclusive "o agente só propõe": a escrita da conversa vira Proposta e só o aprovar executa, com registro
 * e desfazer. Os dados somem quando o servidor reinicia.
 */
import type {
  Conta,
  DadosAjusteEstoque,
  DadosAvancarPedido,
  DadosCriarPedido,
  EntradaRegistro,
  ItemInsumo,
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
import { fmtQtdUn } from "../formato";
import type { MensagemSessao, SessaoApi } from "../historico";
import { uuid7 } from "../ids";

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
  /** Histórico das conversas no formato que o agente grava (um item por mensagem, como na coleção `mensagens`). */
  sessoes: Map<string, { sessao: SessaoApi; mensagens: MensagemSessao[] }>;
}

type ItemDemo = ItemInsumo["insumo"];

/** Preço e fornecedor de referência da demonstração, para a proposta de compra ter valor. */
export const REFERENCIA: Record<string, { fornecedor: string; centavosPorUn: number }> = {
  bloco: { fornecedor: "Cerâmica Santa Rita", centavosPorUn: 320 },
  aco: { fornecedor: "Gerdau · distribuidor Campinas", centavosPorUn: 660 },
  cimento: { fornecedor: "Depósito Ouro Verde", centavosPorUn: 3900 },
  areia: { fornecedor: "Areial Jaguari", centavosPorUn: 14000 },
};

function semear(): EstadoDemo {
  const doc = <T extends object>(x: T, criado = agoraISO()) => ({ id: uuid7(), tenant_id: TENANT, criado_em: criado, ...x });
  const obra: Obra = doc({ nome: "Casa Vila Nova", cidade: "Campinas", cep: "13000-000", verba: 48000000, status: "em_andamento" as const });
  const ins = (chave: string, nome: string, unidade: string, precisa: number, curva: "A" | "B" | "C") =>
    [chave, doc({ obra_id: obra.id, nome, unidade, precisa_ate_o_fim: precisa, curva })] as const;
  const insumos = new Map<string, ItemDemo>([
    ins("bloco", "Bloco cerâmico 14×19×29", "un", 3_400_000, "A"),
    ins("aco", "Aço CA-50 10 mm", "kg", 3_940_000, "A"),
    ins("cimento", "Cimento CP-II 50 kg", "sc", 200_000, "A"),
    ins("areia", "Areia média lavada", "m³", 60_000, "C"),
  ]);
  const id = (k: string) => insumos.get(k)!.id;
  const mov = (k: string, tipo: TipoMovimento, q: number, dias: number, extra: Partial<Movimento> = {}): Movimento =>
    doc(
      { obra_id: obra.id, insumo_id: id(k), tipo, quantidade: q, destino: null, origem_doc: null, quem: "Joana (mestre)", origem: "tela", desfaz: null, ...extra },
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
    doc({ numero, obra_id: obra.id, insumo_id: id(k), quantidade: q, fornecedor: REFERENCIA[k]!.fornecedor, valor, status, previsao, rastreio: null }, diasAtras(dias));
  const pedidos: Pedido[] = [
    ped("PED-0157", "areia", 40_000, 560000, "recebido", "chegou ontem · NF 4471", 6),
    ped("PED-0158", "aco", 3_200_000, 2112000, "em_transito", "chega quinta", 5),
    ped("PED-0160", "cimento", 120_000, 468000, "enviado", "chega segunda", 3),
    ped("PED-0167", "aco", 600_000, 402000, "em_cotacao", null, 1),
  ];
  const usuarios: Usuario[] = [
    { id: uuid7(), nome: "Rizzi", tenant_id: TENANT, papel: "admin" },
    { id: uuid7(), nome: "Paula (leitura)", tenant_id: TENANT, papel: "viewer" },
  ];
  const e: EstadoDemo = {
    usuarios,
    acessos: new Map(),
    renovacoes: new Map(),
    obras: [obra],
    insumos,
    movimentos,
    pedidos,
    propostas: [],
    registro: [],
    contadorPedido: 167,
    sessoes: new Map(),
  };
  const ped157 = pedidos[0]!;
  e.propostas.push(
    novaProposta(e, {
      obra_id: obra.id,
      tipo: "avancar_pedido",
      titulo: "Conferir a NF 4471 e dar entrada de 40 m³ de areia (PED-0157)",
      conta: "NF 4471: 40 m³ · pedido PED-0157: 40 m³ · diferença 0",
      fonte: "NF-e · PED-0157",
      dados: { pedido_id: ped157.id, para: "conferido" },
    }),
  );
  const c = contaDoInsumo(e, insumos.get("cimento")!);
  e.propostas.push(propostaDeCompra(e, insumos.get("cimento")!, c, "almoxarifado · PED-0160"));
  return e;
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

function novaProposta(e: EstadoDemo, p: Pick<Proposta, "obra_id" | "tipo" | "titulo" | "conta" | "fonte" | "dados">): Proposta {
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

/** Na demonstração qualquer senha entra (os dados são fictícios); e-mail começando por "leitura" entra como viewer. */
export function entrarDemo(email: string, senha: string): RespostaEntrar | null {
  const e = estado();
  if (!email.trim() || !senha) return null;
  const u = email.trim().toLowerCase().startsWith("leitura") ? e.usuarios[1]! : e.usuarios[0]!;
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
    x = { sessao: { id, tenant_id: TENANT, dono: u.id, obra_id: obraId, titulo: titulo.slice(0, 80), abas: [], total_mensagens: 0, criado_em: agora, atualizado_em: agora }, mensagens: [] };
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
  const ent: EntradaRegistro = { id: uuid7(), tenant_id: TENANT, criado_em: agoraISO(), quem: u.nome, quem_nome: u.nome, usuario_id: u.id, desfeito: false, ...r };
  e.registro.push(ent);
  return ent;
}

function movimentar(e: EstadoDemo, u: Usuario, m: Pick<Movimento, "obra_id" | "insumo_id" | "tipo" | "quantidade"> & Partial<Movimento>) {
  const mov: Movimento = { id: uuid7(), tenant_id: TENANT, criado_em: agoraISO(), destino: null, origem_doc: null, quem: u.nome, origem: "tela", desfaz: null, ...m };
  efeitoNoSaldo(mov);
  e.movimentos.push(mov);
  return mov;
}

function pedidoPorId(e: EstadoDemo, id: string) {
  const p = e.pedidos.find((x) => x.id === id);
  if (!p) throw new NaoEncontrado("Pedido não encontrado.");
  return p;
}

/** Avança o pedido e devolve o necessário para desfazer (status anterior e o movimento de entrada, se houve). */
function avancar(e: EstadoDemo, u: Usuario, p: Pedido, para: StatusPedido, origem: string) {
  validarTransicao(p.status, para);
  const de = p.status;
  let movimento_id: string | null = null;
  if (para === "conferido") {
    movimento_id = movimentar(e, u, { obra_id: p.obra_id, insumo_id: p.insumo_id, tipo: "entrada", quantidade: p.quantidade, origem_doc: p.numero, origem }).id;
  }
  p.status = para;
  return { op: "voltar_status", pedido_id: p.id, de, movimento_id };
}

export class NaoEncontrado extends Error {}
/** 409 do contrato: já decidido, já desfeito, fora de ordem. */
export class Conflito extends Error {}
export class Proibido extends Error {}

function exigirAdmin(u: Usuario) {
  if (u.papel === "viewer") throw new Proibido("Seu papel (leitura) não aprova nem opera. Peça a um admin.");
}

export function aprovar(id: string, u: Usuario) {
  const e = estado();
  exigirAdmin(u);
  const pr = e.propostas.find((p) => p.id === id);
  if (!pr) throw new NaoEncontrado("Proposta não encontrada.");
  if (pr.status !== "pendente") throw new Conflito("Esta proposta já foi decidida.");
  let desfazer: Record<string, unknown>;
  let texto: string;
  if (pr.tipo === "criar_pedido") {
    const d = pr.dados as unknown as DadosCriarPedido;
    const num = `PED-${String(++e.contadorPedido).padStart(4, "0")}`;
    const p: Pedido = {
      id: uuid7(), tenant_id: TENANT, criado_em: agoraISO(), numero: num, obra_id: pr.obra_id, insumo_id: d.insumo_id,
      quantidade: d.quantidade, fornecedor: d.fornecedor, valor: d.valor, status: "em_cotacao", previsao: d.previsao ?? null, rastreio: null,
    };
    e.pedidos.push(p);
    desfazer = { op: "cancelar_pedido", pedido_id: p.id };
    texto = `Criou ${num}: ${pr.titulo}`;
  } else if (pr.tipo === "avancar_pedido") {
    const d = pr.dados as unknown as DadosAvancarPedido;
    const p = pedidoPorId(e, d.pedido_id);
    desfazer = avancar(e, u, p, d.para, "agente");
    texto = `${p.numero} → ${d.para}`;
  } else {
    const d = pr.dados as unknown as DadosAjusteEstoque;
    const m = movimentar(e, u, { obra_id: pr.obra_id, insumo_id: d.insumo_id, tipo: "ajuste", quantidade: d.quantidade, destino: d.motivo, origem: "agente" });
    desfazer = { op: "estornar_movimento", movimento_id: m.id };
    texto = `Ajuste de estoque: ${pr.titulo}`;
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
  return pr;
}

export function desfazer(registroId: string, u: Usuario) {
  const e = estado();
  exigirAdmin(u);
  const ent = e.registro.find((r) => r.id === registroId);
  if (!ent) throw new NaoEncontrado("Registro não encontrado.");
  if (ent.desfeito || !ent.desfazer) throw new Conflito("Isto já foi desfeito.");
  const d = ent.desfazer as { op: string; pedido_id: string; de: StatusPedido; movimento_id: string | null };
  const estornar = (movId: string) => {
    const m = e.movimentos.find((x) => x.id === movId);
    if (m) movimentar(e, u, { obra_id: m.obra_id, insumo_id: m.insumo_id, tipo: "ajuste", quantidade: -efeitoNoSaldo(m), desfaz: m.id, origem_doc: m.origem_doc, destino: "Estorno (desfazer)" });
  };
  if (d.op === "cancelar_pedido") pedidoPorId(e, d.pedido_id).status = "cancelado";
  else if (d.op === "voltar_status") {
    pedidoPorId(e, d.pedido_id).status = d.de;
    if (d.movimento_id) estornar(d.movimento_id);
  } else if (d.op === "estornar_movimento" && d.movimento_id) estornar(d.movimento_id);
  ent.desfeito = true;
  const pr = ent.proposta_id ? e.propostas.find((p) => p.id === ent.proposta_id) : undefined;
  if (pr) pr.status = "desfeita";
  return registrar(e, u, { obra_id: ent.obra_id, texto: `Desfez: ${ent.texto}`, proposta_id: ent.proposta_id, desfazer: null, origem: "tela" });
}

/* ---------- roteamento das rotas do contrato ---------- */

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
    if (a === "obras" && id) {
      if (!e.obras.some((o) => o.id === id)) return erro(404, "Obra não encontrada.");
      if (metodo === "GET" && b === "insumos" && !id2) {
        const itens = [...e.insumos.values()].filter((i) => i.obra_id === id).map((insumo) => ({ insumo, conta: contaDoInsumo(e, insumo) }));
        return ok(itens);
      }
      if (metodo === "GET" && b === "insumos" && id2 && c2 === "movimentos") {
        const lim = Math.min(200, Number(params.get("limite") ?? 50) || 50);
        return ok(e.movimentos.filter((m) => m.insumo_id === id2).sort((x, y) => y.criado_em.localeCompare(x.criado_em)).slice(0, lim));
      }
      if (metodo === "GET" && b === "pedidos") {
        const st = params.get("status");
        return ok(e.pedidos.filter((p) => p.obra_id === id && (!st || p.status === st)));
      }
    }
    if (metodo === "POST" && a === "pedidos" && id && b === "avancar") {
      exigirAdmin(u);
      const p = pedidoPorId(e, id);
      const para = c.para as StatusPedido;
      const desf = avancar(e, u, p, para, "tela");
      registrar(e, u, { obra_id: p.obra_id, texto: `${p.numero} → ${para}`, proposta_id: null, desfazer: desf, origem: "tela" });
      return ok(p);
    }
    if (a === "propostas") {
      if (metodo === "GET" && !id) {
        const st = params.get("status");
        const ob = params.get("obra_id");
        if (st && !STATUS_PROPOSTA.includes(st as StatusProposta)) return erro(422, "status inválido");
        return ok(e.propostas.filter((p) => (!st || p.status === st) && (!ob || p.obra_id === ob)).sort((x, y) => y.criado_em.localeCompare(x.criado_em)));
      }
      if (metodo === "POST" && id && b === "aprovar") return ok(aprovar(id, u));
      if (metodo === "POST" && id && b === "recusar") return ok(recusar(id, String(c.motivo ?? ""), u));
    }
    if (a === "registro") {
      if (metodo === "GET" && !id) {
        const ob = params.get("obra_id");
        const lim = Math.min(200, Number(params.get("limite") ?? 50) || 50);
        return ok(e.registro.filter((r) => !ob || r.obra_id === ob).sort((x, y) => y.criado_em.localeCompare(x.criado_em)).slice(0, lim));
      }
      if (metodo === "POST" && id && b === "desfazer") return ok(desfazer(id, u));
    }
    if (metodo === "GET" && a === "sessoes" && !id) {
      const ob = params.get("obra_id");
      const lim = Math.min(100, Number(params.get("limite") ?? 30) || 30);
      return ok(
        [...e.sessoes.values()]
          .map((x) => x.sessao)
          .filter((s) => s.dono === u.id && (!ob || s.obra_id === ob))
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
    if (metodo === "GET" && a === "creditos") return ok({ saldo_microdolares: 5_000_000, franquia: 20_000_000, chave_propria: false });
    return erro(404, "Rota não existe no contrato do MVP-0.");
  } catch (x) {
    if (x instanceof Proibido) return erro(403, x.message);
    if (x instanceof NaoEncontrado) return erro(404, x.message);
    if (x instanceof Conflito) return erro(409, x.message);
    if (x instanceof RegraViolada) return erro(422, x.message);
    throw x;
  }
}

