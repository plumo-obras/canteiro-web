/**
 * Modo de demonstração: o próprio Next se passa pela API central, com a Casa Vila Nova do contrato em memória.
 * Serve para trabalhar na web antes de a API e o agente existirem. Segue o contrato ao pé da letra (rotas, códigos,
 * formatos), inclusive "o agente só propõe": a escrita da conversa vira Proposta e só o aprovar executa, com registro
 * e desfazer. Os dados somem quando o servidor reinicia.
 */
import "server-only";
import type {
  Conta,
  DadosAjusteEstoque,
  DadosObra,
  Mapeamento,
  DadosAvancarPedido,
  CurvaABC,
  Cronograma,
  CorpoCronograma,
  PrazoCronograma,
  DadosCriarPedido,
  EntradaRegistro,
  ItemInsumo,
  MinhaConta,
  Movimento,
  Obra,
  HojeNaObra,
  PontoHoje,
  Orcamento,
  Pedido,
  PreviaVersao,
  MaterialDoProjeto,
  VersaoOrcamento,
  Proposta,
  RespostaEntrar,
  StatusPedido,
  StatusProposta,
  TipoMovimento,
  Usuario,
} from "../contrato";
import { fmtQtdUn, fmtReais } from "../formato";
import { CEM, gerarCronograma, listaMeses, previsaoMensal, redimensionar, somarMes } from "../cronograma";
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

/** Uma versão do orçamento na demonstração: a meta (como no contrato) e as etapas com seus itens, crus.
 * A curva ABC, a ordem e os totais por etapa são recalculados na leitura, como a API faz sobre o vigente. */
interface VersaoDemo {
  versao: VersaoOrcamento;
  etapas: { descricao: string; itens: { nome: string; unidade: string; quantidade: number; valor_unitario: number }[] }[];
  /** A chave de idempotência da gravação: repetir o POST com a mesma chave devolve esta versão, não cria outra. */
  chave: string | null;
  /** Só na versão gravada pela ordem das etapas: a ordem pedida, para recusar a mesma chave com outra ordem. */
  ordem?: string[];
}

/** O cronograma guardado na demo (o que o PUT grava): início, meses e o % de cada etapa por mês. */
interface CronogramaDemo {
  inicio: string;
  meses: number;
  etapas: { etapa: string; percentuais: number[] }[];
  registro_id: string | null;
}

interface EstadoDemo {
  usuarios: Usuario[];
  acessos: Map<string, { usuario: Usuario; vence: number }>;
  renovacoes: Map<string, Usuario>;
  obras: Obra[];
  insumos: Map<string, ItemDemo>;
  movimentos: Movimento[];
  pedidos: PedidoDemo[];
  propostas: Proposta[];
  registro: EntradaRegistro[];
  /** As versões do orçamento (contrato e aditivos), como a API as guarda. Uma versão desfeita fica com `ativa: false`. */
  versoes: VersaoDemo[];
  /** O cronograma de cada obra (grade etapa × mês), gravado pelo editor ou pela proposta da IA. */
  cronogramas: Map<string, CronogramaDemo>;
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
  numero_contrato: "",
  bdi: 0,
  data_base: null,
} satisfies Omit<Obra, "id" | "tenant_id" | "criado_em" | "nome" | "status">;

const CAMPOS_OBRA = Object.keys(OBRA_VAZIA).concat("nome") as (keyof DadosObra)[];
const ROTULO_CAMPO: Record<string, string> = {
  nome: "nome",
  cidade: "cidade",
  cep: "CEP",
  uf: "UF",
  endereco: "endereço",
  verba: "valor do contrato",
  tipologia: "tipo",
  area_construida: "área",
  pavimentos: "pavimentos",
  padrao: "padrão",
  regime: "regime",
  cliente: "cliente",
  inicio: "início",
  prazo_meses: "prazo",
  numero_contrato: "nº do contrato",
  bdi: "BDI",
  data_base: "data-base",
};

/** Só os campos conhecidos; o resto do corpo é ignorado (a API recusaria campo desconhecido com 422). */
function dadosObra(c: Record<string, unknown>): DadosObra {
  const d: Record<string, unknown> = {};
  for (const k of CAMPOS_OBRA) if (k in c) d[k] = c[k];
  if (typeof d.nome === "string") d.nome = d.nome.replace(/\s+/g, " ").trim();
  if ("nome" in d && (!d.nome || String(d.nome).length > 120)) throw new RegraViolada("Dê um nome para a obra (até 120 letras).");
  return d as DadosObra;
}

/**
 * O orçamento da obra: as versões que foram lançadas de verdade (contrato e aditivos; na demo, a etapa "Estrutura"
 * vinda dos materiais do projeto). A curva ABC, a ordem e os totais por etapa são recalculados aqui, sobre o vigente,
 * como a API faz — a tela não refaz conta. Sem versão ativa, o orçamento é vazio (não se inventa um dos insumos).
 */
function orcamentoDemo(e: EstadoDemo, o: Obra): Orcamento {
  const zero = { cotando: 0, comprometido: 0, realizado: 0 };
  const versoesDaObra = e.versoes.filter((v) => v.versao.obra_id === o.id);
  const ativas = versoesDaObra.filter((v) => v.versao.ativa);
  // como a API: fora de vigência, foi desfeita se o registro dela foi desfeito; senão, outra a substituiu
  const desfeita = (v: VersaoOrcamento) => !!e.registro.find((r) => r.id === v.registro_id)?.desfeito;
  const metas = versoesDaObra.map((v) => ({
    ...v.versao,
    ...textosDaVersao(v.versao, versoesDaObra.map((x) => x.versao)),
    situacao: v.versao.ativa ? ("vigente" as const) : desfeita(v.versao) ? ("desfeita" as const) : ("substituida" as const),
  }));
  if (!ativas.length)
    return { versoes: metas, itens: [], etapas: [], totais: { contratado: 0, aditivos: 0, atual: 0, saldo: 0, aditivos_pct: null, n_itens: 0, n_etapas: 0, ...zero, sem_etapa: zero } };

  // Uma etapa por etapa de cada versão ativa (o somar junta várias numa versão), numeradas na ordem em que aparecem.
  const blocos = ativas.flatMap((v) => v.etapas.map((et) => ({ v, et })));
  type Linha = { bloco: number; nome: string; unidade: string; quantidade: number; valor_unitario: number; total: number };
  const planas: Linha[] = [];
  blocos.forEach(({ et }, bi) => {
    for (const it of et.itens)
      planas.push({ bloco: bi, nome: it.nome, unidade: it.unidade, quantidade: it.quantidade, valor_unitario: it.valor_unitario, total: Math.round((it.quantidade * it.valor_unitario) / 1000) });
  });

  // Curva ABC sobre o vigente inteiro: ordena por total e corta em 80% / 95% do acumulado.
  const soma = planas.reduce((s, l) => s + l.total, 0);
  const curvaDe = new Map<Linha, CurvaABC>();
  let acc = 0;
  for (const l of [...planas].sort((a, b) => b.total - a.total)) {
    const antes = acc;
    acc += l.total;
    curvaDe.set(l, !soma ? "B" : antes < soma * 0.8 ? "A" : antes < soma * 0.95 ? "B" : "C");
  }

  const itens: Orcamento["itens"] = [];
  const etapas: Orcamento["etapas"] = [];
  let ordem = 0;
  let linha = 2;
  // o id do item é "<versão>-<posição na versão>", contando as etapas dela (é o que o editar item decifra)
  const posicao = new Map<string, number>();
  blocos.forEach(({ v, et }, bi) => {
    const num = String(bi + 1);
    const desc = et.descricao || "Estrutura";
    const desta = planas.filter((l) => l.bloco === bi);
    const totalEtapa = desta.reduce((s, l) => s + l.total, 0);
    const base = { obra_id: o.id, versao_id: v.versao.id, etapa: num, codigo: "", fonte: "" };
    itens.push({ ...base, id: `${v.versao.id}-e${bi}`, ordem: ordem++, tipo: "etapa", numero: num, nivel: 1, descricao: desc, unidade: "", quantidade: 0, valor_unitario: 0, total: 0, linha: linha++, curva: null });
    desta.forEach((l, k) => {
      const pos = (posicao.get(v.versao.id) ?? 0) + 1;
      posicao.set(v.versao.id, pos);
      itens.push({ ...base, id: `${v.versao.id}-${pos}`, ordem: ordem++, tipo: "item", numero: `${num}.${k + 1}`, nivel: 2, descricao: l.nome, unidade: l.unidade, quantidade: l.quantidade, valor_unitario: l.valor_unitario, total: l.total, linha: linha++, curva: curvaDe.get(l) ?? null });
    });
    const aditivo = v.versao.tipo === "aditivo";
    etapas.push({ etapa: num, descricao: desc, contratado: aditivo ? 0 : totalEtapa, aditivos: aditivo ? totalEtapa : 0, atual: totalEtapa, saldo: totalEtapa, estourou: false, ...zero });
  });

  const contratado = ativas.filter((v) => v.versao.tipo === "contrato").reduce((s, v) => s + v.versao.total, 0);
  const aditivos = ativas.filter((v) => v.versao.tipo === "aditivo").reduce((s, v) => s + v.versao.total, 0);
  const atual = contratado + aditivos;
  return {
    versoes: metas,
    itens,
    etapas,
    totais: { contratado, aditivos, atual, saldo: atual, aditivos_pct: contratado ? Math.round((aditivos / contratado) * 10000) : null, n_itens: planas.length, n_etapas: etapas.length, ...zero, sem_etapa: zero },
  };
}

/** Como a API compara nomes de etapa e de item: sem caixa, sem acento, sem espaço sobrando. */
const normal = (t: string) => nomeChave(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
/** "concreto": o termo principal de uma descrição, para achar o mesmo material com outro nome. */
const termoPrincipal = (d: string) => normal(d).split(" ").find((p) => p.length >= 3) ?? "";

/**

/** Monta o GET /cronograma como a API: etapas do orçamento + a grade guardada, com mensal e prazo calculados. */
function montarCronogramaDemo(e: EstadoDemo, o: Obra): Cronograma {
  const orc = orcamentoDemo(e, o);
  const g = e.cronogramas.get(o.id);
  const semPrazo: PrazoCronograma = { termino_contratual: null, termino_projetado: null, atraso_meses: null, atraso_decimos: null, pct_previsto_na_medicao: null, pct_medido: null, mes_referencia: null };
  if (!g || g.meses <= 0 || !/^\d{4}-\d{2}$/.test(g.inicio)) {
    return {
      inicio: null,
      meses: 0,
      etapas: orc.etapas.map((x) => ({ etapa: x.etapa, descricao: x.descricao, atual: x.atual, percentuais: [], medido_acumulado: 0 })),
      mensal: [],
      medicoes: [],
      prazo: semPrazo,
    };
  }
  const porEtapa = new Map(g.etapas.map((et) => [et.etapa, et.percentuais]));
  const etapas = orc.etapas.map((x) => ({
    etapa: x.etapa,
    descricao: x.descricao,
    atual: x.atual,
    percentuais: redimensionar(porEtapa.get(x.etapa) ?? [], g.meses),
    medido_acumulado: 0,
  }));
  const { previsto, acumulado } = previsaoMensal(etapas.map((et) => ({ atual: et.atual, percentuais: et.percentuais })), g.meses);
  const totalObra = etapas.reduce((s, et) => s + et.atual, 0) || 1;
  const mensal = listaMeses(g.inicio, g.meses).map((mes, i) => ({
    mes,
    previsto: previsto[i] ?? 0,
    previsto_acumulado: acumulado[i] ?? 0,
    pct_previsto_acumulado: Math.round(((acumulado[i] ?? 0) / totalObra) * CEM),
    medido: null,
    medido_acumulado: null,
    pct_medido_acumulado: null,
  }));
  const termino = somarMes(g.inicio, g.meses - 1);
  const prazo: PrazoCronograma = { termino_contratual: termino, termino_projetado: termino, atraso_meses: 0, atraso_decimos: 0, pct_previsto_na_medicao: null, pct_medido: null, mes_referencia: null };
  return { inicio: g.inicio, meses: g.meses, base: { inicio: g.inicio, meses: g.meses }, revisoes: 0, etapas, mensal, medicoes: [], prazo, registro_id: g.registro_id };
}

/** Grava a grade do cronograma (cada etapa fecha 100% ou zera). Devolve o snapshot anterior, para o desfazer. NÃO
 *  registra: quem chama cria o EntradaRegistro (o editor, no PUT; a aprovação, na proposta da IA). */
function gravarCronograma(e: EstadoDemo, o: Obra, corpo: Record<string, unknown>): { anterior: CronogramaDemo | null; meses: number } {
  const inicio = String(corpo.inicio ?? "").slice(0, 7);
  const meses = Number(corpo.meses) || 0;
  if (!/^\d{4}-\d{2}$/.test(inicio) || meses < 1 || meses > 60) throw new RegraViolada("Informe início (AAAA-MM) e um prazo de 1 a 60 meses.");
  const etapasCorpo = Array.isArray(corpo.etapas) ? (corpo.etapas as { etapa: string; percentuais: number[] }[]) : [];
  for (const et of etapasCorpo) {
    const soma = (et.percentuais ?? []).reduce((s, x) => s + (Number(x) || 0), 0);
    if (soma !== 0 && soma !== CEM) throw new RegraViolada(`A etapa ${et.etapa} não fecha em 100%.`);
  }
  const anterior = e.cronogramas.get(o.id) ?? null;
  e.cronogramas.set(o.id, {
    inicio,
    meses,
    etapas: etapasCorpo.map((et) => ({ etapa: String(et.etapa), percentuais: (et.percentuais ?? []).map((x) => Number(x) || 0) })),
    registro_id: null,
  });
  return { anterior, meses };
}

/** A IA propõe o cronograma a partir do orçamento: sequencia as etapas por fase de obra e cria uma Proposta pendente,
 *  que uma pessoa aprova (como qualquer escrita do agente). Na demo o sequenciamento é o gerador determinístico; o
 *  agente de verdade usa o LLM. */
function proporCronogramaDemo(e: EstadoDemo, o: Obra): Proposta {
  const orc = orcamentoDemo(e, o);
  if (!orc.etapas.length) throw new RegraViolada("Esta obra ainda não tem orçamento para a IA montar o cronograma.");
  if (e.cronogramas.get(o.id)) throw new Conflito("Esta obra já tem cronograma. Edite pelo próprio cronograma.");
  const meses = o.prazo_meses || 12;
  const inicio = o.inicio ? o.inicio.slice(0, 7) : new Date().toISOString().slice(0, 7);
  const etapas = gerarCronograma(orc.etapas.map((x) => ({ etapa: x.etapa, descricao: x.descricao, atual: x.atual })), meses);
  const proposta: Proposta = {
    id: uuid7(),
    tenant_id: TENANT,
    criado_em: agoraISO(),
    obra_id: o.id,
    tipo: "cronograma",
    titulo: `Cronograma de ${o.nome}`,
    conta: `${orc.etapas.length} ${orc.etapas.length === 1 ? "etapa" : "etapas"} · ${meses} ${meses === 1 ? "mês" : "meses"} · término ${somarMes(inicio, meses - 1)}`,
    justificativa: "Sequenciei as etapas por fase de obra, com a duração proporcional ao valor.",
    fonte: "agente",
    dados: { inicio, meses, etapas },
    sugerido_por: "Agente",
    status: "pendente",
    decidido_por: null,
    decidido_em: null,
    motivo_recusa: null,
    decidido_por_nome: null,
  };
  e.propostas.push(proposta);
  return proposta;
}

/**
 * Os materiais do projeto viram uma versão do orçamento (etapa "Estrutura"): contrato, se a obra ainda não tem um;
 * somados ao contrato (um contrato novo no lugar dele, não aditivo), se ele ainda não foi aprovado; aditivo depois de
 * aprovado. Espelha o POST /obras/{id}/orcamento/estrutura da API. `aplicar: false` é a prévia. O "parece repetir" é
 * mais simples que o da API (mesma unidade e o mesmo termo principal): basta para a demo mostrar o aviso.
 */
function lancarEstrutura(e: EstadoDemo, u: Usuario, o: Obra, corpo: Record<string, unknown>): PreviaVersao {
  const itens = (corpo.itens as MaterialDoProjeto[] | undefined) ?? [];
  const etapaNome = String(corpo.etapa ?? "Estrutura").trim() || "Estrutura";
  const chave = corpo.chave_idempotencia ? String(corpo.chave_idempotencia) : null;
  const aplicar = corpo.aplicar === true;
  const unidade = (x: string) => ({ m3: "m³", m2: "m²" })[x.trim().toLowerCase()] ?? x.trim();

  const ignorar = new Set(Array.isArray(corpo.ignorar_itens) ? (corpo.ignorar_itens as unknown[]).map(Number) : []);
  // a `ordem` de cada material é a posição dele no pedido (a etapa é a 0): é o que `ignorar_itens` aponta
  const lidos = itens.map((x, i) => ({
    ordem: i + 1,
    nome: String(x.nome ?? "").trim(),
    unidade: unidade(String(x.unidade ?? "")),
    quantidade: Number(x.quantidade) || 0,
    valor_unitario: Number(x.valor_unitario) || 0,
  }));
  const comOrdem = lidos.filter((x) => !ignorar.has(x.ordem));
  const limpos = comOrdem.map(({ ordem: _ordem, ...x }) => x);
  const vigente = e.versoes.find((v) => v.versao.obra_id === o.id && v.versao.ativa && v.versao.tipo === "contrato");
  const somar = !!vigente && o.status === "em_orcamento";
  const tipo: VersaoOrcamento["tipo"] = vigente && !somar ? "aditivo" : "contrato";
  const numero = tipo === "contrato" ? 0 : e.versoes.filter((v) => v.versao.obra_id === o.id && v.versao.ativa && v.versao.tipo === "aditivo").length + 1;

  const total = (q: number, val: number) => Math.round((q * val) / 1000);
  const somaTotal = limpos.reduce((s, x) => s + total(x.quantidade, x.valor_unitario), 0);
  const existentes = somar ? vigente!.etapas.flatMap((et) => et.itens) : [];
  const avisos: PreviaVersao["avisos"] = [];
  const previaItens: PreviaVersao["itens"] = [
    { ordem: 0, tipo: "etapa" as const, numero: "1", nivel: 1, etapa: "1", codigo: "", fonte: "", descricao: etapaNome, unidade: "", quantidade: 0, valor_unitario: 0, total: 0, linha: 1 },
    ...comOrdem.map((x, i) => {
      const igual = existentes.find((y) => y.unidade === x.unidade && termoPrincipal(y.nome) && termoPrincipal(y.nome) === termoPrincipal(x.nome));
      if (igual) avisos.push({ linha: x.ordem + 1, mensagem: `${x.nome} parece repetir ${igual.nome}, que já está no orçamento.` });
      return {
        ordem: x.ordem, tipo: "item" as const, numero: `1.${i + 1}`, nivel: 2, etapa: "1", codigo: "", fonte: "", descricao: x.nome, unidade: x.unidade,
        quantidade: x.quantidade, valor_unitario: x.valor_unitario, total: total(x.quantidade, x.valor_unitario), linha: x.ordem + 1,
        repetido_de: igual ? { item_id: "", descricao: igual.nome, quantidade: igual.quantidade, unidade: igual.unidade } : null,
      };
    }),
  ];
  const base: PreviaVersao = {
    aplicado: false, tipo, itens: previaItens, ignoradas: [], erros: [], avisos,
    total: somaTotal, n_itens: limpos.length, n_etapas: 1,
    etapas: [{ etapa: "1", descricao: etapaNome, total: somaTotal }],
    substitui: somar ? { versao_id: vigente!.versao.id, total: vigente!.versao.total, itens: vigente!.versao.itens } : null,
    ...(somar ? { total_apos: vigente!.versao.total + somaTotal } : {}),
    versao_id: null, registro_id: null,
  };
  if (!aplicar) return base;

  // Idempotência: o mesmo POST (mesma chave) devolve a versão já gravada, não cria outra.
  const ja = chave ? e.versoes.find((v) => v.versao.obra_id === o.id && v.chave === chave) : undefined;
  if (ja) return { ...base, aplicado: true, versao_id: ja.versao.id, registro_id: ja.versao.registro_id };

  const versaoId = uuid7();
  // No somar, a etapa casa pelo nome (nunca pelo número): "Estrutura" de novo entra na Estrutura que já está lá.
  const etapas: VersaoDemo["etapas"] = somar ? vigente!.etapas.map((et) => ({ descricao: et.descricao, itens: [...et.itens] })) : [];
  const mesma = etapas.find((et) => normal(et.descricao) === normal(etapaNome));
  if (mesma) mesma.itens.push(...limpos);
  else etapas.push({ descricao: etapaNome, itens: limpos });
  const todos = etapas.flatMap((et) => et.itens);
  const vd: VersaoDemo = {
    versao: {
      id: versaoId, obra_id: o.id, tipo, numero, descricao: etapaNome,
      data: hojeSP().slice(0, 10), arquivo: `${etapaNome} (projeto).csv`, itens: todos.length, etapas: etapas.length,
      total: todos.reduce((s, x) => s + total(x.quantidade, x.valor_unitario), 0), ativa: true, substitui: somar ? vigente!.versao.id : null,
      registro_id: null, criado_em: agoraISO(), ...(somar ? { origem: "somar" as const } : {}),
    },
    etapas,
    chave,
  };
  if (somar) vigente!.versao.ativa = false;
  e.versoes.push(vd);
  const n = `${limpos.length} ${limpos.length === 1 ? "item" : "itens"}`;
  const reg = registrar(e, u, {
    obra_id: o.id,
    texto: somar
      ? `Somou ${n} ao orçamento de ${o.nome} (+${fmtReais(somaTotal)})`
      : `Lançou a estrutura do projeto como ${tipo === "contrato" ? "contrato" : `aditivo ${numero}`} (${n}, ${fmtReais(somaTotal)})`,
    proposta_id: null,
    // o Desfazer do somar reativa o orçamento de antes, como a API
    desfazer: { op: "desfazer_versao", versao_id: versaoId, ...(somar ? { reativar: vigente!.versao.id } : {}) },
    origem: "tela",
  });
  vd.versao.registro_id = reg.id;
  return { ...base, aplicado: true, versao_id: versaoId, registro_id: reg.id };
}

/** O nome da versão e o que o Desfazer dela faz, como a API (`_textos_da_versao`): sem o nome interno das pranchas. */
function textosDaVersao(v: VersaoOrcamento, versoes: VersaoOrcamento[]): Pick<VersaoOrcamento, "rotulo" | "desfazer_texto"> {
  const dasPranchas = v.arquivo.endsWith(" (projeto).csv");
  const anterior = versoes.find((x) => x.id === v.substitui);
  const nItens = (n: number) => `${n} ${n === 1 ? "item" : "itens"}`;
  if (v.origem === "reordenar") return { rotulo: "Etapas reordenadas", desfazer_texto: "Volta as etapas do orçamento para a ordem de antes." };
  if (v.origem === "somar") {
    const oQue = dasPranchas ? "os materiais das pranchas" : "a planilha";
    return {
      rotulo: `Orçamento com ${oQue} somad${dasPranchas ? "os" : "a"}`,
      desfazer_texto: anterior ? `Volta o orçamento para antes de somar ${oQue} (${fmtReais(anterior.total)}, ${nItens(anterior.itens)}).` : null,
    };
  }
  return { rotulo: dasPranchas ? "Materiais das pranchas" : v.descricao || v.arquivo || "Orçamento", desfazer_texto: null };
}

/**
 * POST /obras/{id}/orcamento/etapas/ordem, como a API: antes de aprovar, um contrato novo no lugar do vigente com as
 * etapas na ordem pedida (a numeração sai da posição, então renumera sozinha). O Desfazer religa o anterior.
 */
function ordenarEtapas(e: EstadoDemo, u: Usuario, o: Obra, corpo: Record<string, unknown>) {
  const chave = typeof corpo.chave_idempotencia === "string" ? corpo.chave_idempotencia : "";
  if (chave.length < 8) throw new RegraViolada("chave_idempotencia é obrigatória.");
  const saida = (vd: VersaoDemo) => ({
    versao_id: vd.versao.id,
    registro_id: vd.versao.registro_id!,
    etapas: vd.etapas.map((et, i) => ({ etapa: String(i + 1), descricao: et.descricao })),
  });
  const ordem = Array.isArray(corpo.ordem) ? corpo.ordem.map(String) : [];
  const ja = e.versoes.find((v) => v.versao.obra_id === o.id && v.chave === chave);
  if (ja) {
    if (JSON.stringify(ja.ordem) !== JSON.stringify(ordem)) throw new Conflito("Esta chave de idempotência já foi usada para outra mudança do orçamento.");
    return saida(ja);
  }
  if (o.status !== "em_orcamento") throw new Conflito("O orçamento já foi aprovado: a ordem das etapas não muda mais.");
  const ativas = e.versoes.filter((v) => v.versao.obra_id === o.id && v.versao.ativa);
  const vigente = ativas.find((v) => v.versao.tipo === "contrato");
  if (!vigente) throw new RegraViolada("Ainda não há orçamento nesta obra para ordenar as etapas.");
  if (ativas.length > 1) throw new Conflito("Há aditivo valendo sobre este orçamento; desfaça o aditivo antes de mudar a ordem.");
  // a ordem foi montada sobre a numeração que a tela via: se o vigente é outro, ela moveria a etapa errada
  if (typeof corpo.versao_id === "string" && corpo.versao_id !== vigente.versao.id)
    throw new Conflito("O orçamento mudou desde que você abriu a tela; recarregue e confira a ordem.");
  const atual = vigente.etapas.map((_, i) => String(i + 1));
  if (ordem.length !== atual.length || new Set(ordem).size !== ordem.length || !ordem.every((k) => atual.includes(k)))
    throw new RegraViolada(`Mande todas as etapas do orçamento, cada uma uma vez: ${atual.join(", ")}.`);
  if (ordem.every((k, i) => k === atual[i])) throw new RegraViolada("Nada mudou: as etapas já estão nesta ordem.");
  // como a API: renumerar uma etapa que já tem lançamento levaria o lançamento, calado, para outra etapa
  // na demo só o insumo guarda a etapa (as linhas de pedido saem com etapa null)
  const usadas = new Set([...e.insumos.values()].filter((i) => i.obra_id === o.id && i.etapa).map((i) => i.etapa!));
  const presas = ordem.filter((k, i) => k !== String(i + 1) && usadas.has(k));
  if (presas.length) {
    const nome = (k: string) => `${k} ${vigente.etapas[Number(k) - 1]?.descricao ?? ""}`.trim();
    throw new Conflito(`Já há lançamento (gasto, pedido, tópico ou cronograma) na etapa ${presas.sort().map(nome).join(", ")}: renumerar levaria o lançamento para outra etapa.`);
  }

  const versaoId = uuid7();
  const vd: VersaoDemo = {
    versao: { ...vigente.versao, id: versaoId, substitui: vigente.versao.id, registro_id: null, criado_em: agoraISO(), origem: "reordenar" },
    etapas: ordem.map((k) => {
      const et = vigente.etapas[Number(k) - 1]!;
      return { descricao: et.descricao, itens: et.itens.map((x) => ({ ...x })) };
    }),
    chave,
    ordem,
  };
  vigente.versao.ativa = false;
  e.versoes.push(vd);
  const reg = registrar(e, u, {
    obra_id: o.id,
    texto: `Reordenou as etapas do orçamento de ${o.nome}`,
    proposta_id: null,
    desfazer: { op: "desfazer_versao", versao_id: versaoId, reativar: vigente.versao.id },
    origem: "tela",
  });
  vd.versao.registro_id = reg.id;
  return saida(vd);
}

/**
 * A demonstração guarda o pedido no formato antigo (a primeira linha nos campos do pedido) e as demais em `outras`;
 * entrega pela metade ela não tem. Na saída ele vira o pedido do contrato novo.
 */
export interface PedidoDemo {
  id: string;
  tenant_id: string;
  criado_em: string;
  numero: string;
  obra_id: string;
  insumo_id: string;
  quantidade: number;
  fornecedor: string;
  valor: number;
  status: StatusPedido;
  previsao: string | null;
  rastreio: string | null;
  quantidade_recebida?: number | null;
  nf?: string | null;
  /** Com que chave de idempotência foi criado. */
  chave?: string;
  /** As linhas depois da primeira. `valor` é o do pedido inteiro. */
  outras?: LinhaExtraDemo[];
}

export interface LinhaExtraDemo {
  insumo_id: string;
  quantidade: number;
  valor: number;
}

function pedidoApi(e: EstadoDemo, p: PedidoDemo): Pedido {
  const insDe = (id: string) => e.insumos.get([...e.insumos.keys()].find((k) => e.insumos.get(k)!.id === id) ?? "");
  const extras = p.outras ?? [];
  const linha = (insumo_id: string, quantidade: number, total: number, recebida: number) => {
    const ins = insDe(insumo_id);
    return {
      insumo_id,
      nome: ins?.nome ?? "insumo",
      unidade: ins?.unidade ?? "",
      tipo: "material" as const,
      etapa: null,
      quantidade,
      valor_unitario: quantidade ? Math.round((total * 1000) / quantidade) : 0,
      total,
      recebida,
      falta_entregar: p.status === "conferido" || p.status === "cancelado" ? 0 : Math.max(0, quantidade - recebida),
    };
  };
  const chegou = p.status === "conferido";
  return {
    id: p.id,
    numero: p.numero,
    obra_id: p.obra_id,
    fornecedor: p.fornecedor,
    fornecedor_id: null,
    previsao: p.previsao,
    observacao: p.nf ? `NF ${p.nf}` : "",
    status: p.status,
    valor: p.valor,
    recebimentos: p.status === "conferido" ? 1 : 0,
    criado_em: p.criado_em,
    linhas: [
      linha(p.insumo_id, p.quantidade, p.valor - extras.reduce((t, l) => t + l.valor, 0), chegou ? (p.quantidade_recebida ?? p.quantidade) : 0),
      ...extras.map((l) => linha(l.insumo_id, l.quantidade, l.valor, chegou ? l.quantidade : 0)),
    ],
  };
}

const INDISPONIVEL = "Indisponível na demonstração.";

/** GET /obras/{id}/hoje na demonstração: os mesmos tipos de ponto que a demo consegue saber, na ordem do contrato. */
function hojeDemo(e: EstadoDemo, o: Obra): HojeNaObra {
  const insumos = [...e.insumos.values()].filter((i) => i.obra_id === o.id);
  const temOrcamento = e.versoes.some((v) => v.versao.obra_id === o.id && v.versao.ativa) || insumos.some((i) => i.precisa_ate_o_fim > 0);
  const propostas = e.propostas.filter((p) => p.obra_id === o.id && p.status === "pendente").length;
  const falta = insumos.filter((i) => contaDoInsumo(e, i).comprar > 0);
  const semPreco = insumos.filter((i) => i.precisa_ate_o_fim > 0 && !i.valor_unitario).length;
  const aCaminho = e.pedidos.filter((p) => p.obra_id === o.id && A_CAMINHO.includes(p.status));
  const acao = (tela: string, rotulo: string) => ({ tela, rotulo, filtro: null });
  const itens = (n: number) => (n === 1 ? "1 item" : `${n} itens`);
  const nomeDe = (id: string) => insumos.find((i) => i.id === id)?.nome ?? "material";
  const pontos: PontoHoje[] = [];
  if (!temOrcamento) pontos.push({ tipo: "sem_orcamento", prioridade: "pede_voce", titulo: "A obra ainda não tem orçamento.", detalhe: "Envie as pranchas para levantar os materiais.", acao: acao("projeto", "Enviar as pranchas") });
  if (falta.length) {
    const etapa = etapaDoInsumo(e, o.id)(falta[0]!.nome);
    pontos.push({ tipo: "falta_comprar", prioridade: "atencao", titulo: `${itens(falta.length)} ainda sem pedido.`, detalhe: falta.slice(0, 3).map((i) => i.nome).join(", "), acao: { tela: "suprimentos", rotulo: "Ver o que falta", filtro: etapa ? { etapa } : null } });
  }
  if (semPreco) pontos.push({ tipo: "itens_sem_preco", prioridade: "atencao", titulo: `${itens(semPreco)} sem preço.`, detalhe: "Entram com R$ 0,00 no orçado.", acao: acao("orcamento", "Preencher os preços") });
  if (aCaminho.length) pontos.push({ tipo: "entregas_semana", prioridade: "a_caminho", titulo: aCaminho.length === 1 ? "1 entrega a caminho." : `${aCaminho.length} entregas a caminho.`, detalhe: `${nomeDe(aCaminho[0]!.insumo_id)} com ${aCaminho[0]!.fornecedor}.`, acao: acao("suprimentos", "Ver em Compras") });
  const esperando = propostas + pontos.filter((p) => p.prioridade === "pede_voce").length;
  const base = o.status === "em_orcamento" ? "A obra ainda está em orçamento" : "A obra ainda não tem medição";
  return {
    hoje: hojeSP().slice(0, 10),
    resumo: { situacao: "sem_medicao", frase: `${base}.`, esperando },
    pontos: pontos.slice(0, 6),
    mais: Math.max(0, pontos.length - 6),
    // a previsão da demo é texto livre ("chega segunda"): as datas aqui são só para a semana ter o que mostrar
    semana: aCaminho.slice(0, 4).map((p, i) => ({ data: diasAtras(-(i + 1)).slice(0, 10), tipo: "entrega" as const, titulo: `Entrega de ${nomeDe(p.insumo_id)}`, detalhe: p.fornecedor, acao: acao("suprimentos", "Ver") })),
  };
}

/** PATCH de um item do orçamento. O id do item na demo é "<versão>-<posição>", a posição contando as etapas da versão. */
function editarItemDemo(e: EstadoDemo, u: Usuario, o: Obra, itemId: string, c: Record<string, unknown>): RespostaDemo {
  const corte = itemId.lastIndexOf("-");
  const v = e.versoes.find((x) => x.versao.id === itemId.slice(0, corte) && x.versao.obra_id === o.id);
  const it = v?.etapas.flatMap((et) => et.itens)[Number(itemId.slice(corte + 1)) - 1];
  if (!v || !it) return erro(404, "Item não encontrado nesta obra.");
  if (c.quantidade === 0 || (typeof c.valor_unitario === "number" && c.valor_unitario < 0)) return erro(422, "Quantidade ou preço inválido.");
  // Mesma regra da API: aprovado, só o item a R$ 0,00 recebe preço; quantidade, nunca.
  if (o.status !== "em_orcamento" && (typeof c.quantidade === "number" || it.valor_unitario > 0)) return erro(409, "O orçamento já foi aprovado: só o item sem preço pode receber o preço.");
  if (typeof c.quantidade === "number") it.quantidade = c.quantidade;
  if (typeof c.valor_unitario === "number") it.valor_unitario = c.valor_unitario;
  v.versao.total = v.etapas.flatMap((et) => et.itens).reduce((s, x) => s + Math.round((x.quantidade * x.valor_unitario) / 1000), 0);
  registrar(e, u, { obra_id: o.id, texto: `Editou no orçamento: ${it.nome}`, proposta_id: null, desfazer: null, origem: "tela" });
  // sem registro_id: a demo não desfaz esta edição, e o aviso não pode oferecer um Desfazer que falharia
  return ok({ item: it, total_versao: v.versao.total, registro_id: null });
}

/** As etapas das versões vigentes da obra, na ordem em que aparecem (a chave é a posição, como no orçamento dela). */
function etapasDemo(e: EstadoDemo, obraId: string) {
  const v = e.versoes.find((x) => x.versao.obra_id === obraId && x.versao.ativa);
  return (v?.etapas ?? []).map((et, i) => ({ etapa: String(i + 1), descricao: et.descricao }));
}

/** De que etapa saiu cada insumo: o item do orçamento com o mesmo nome (como ao aprovar, a chave é o nome). */
function etapaDoInsumo(e: EstadoDemo, obraId: string) {
  const v = e.versoes.find((x) => x.versao.obra_id === obraId && x.versao.ativa);
  return (nome: string) => {
    const i = (v?.etapas ?? []).findIndex((et) => et.itens.some((it) => nomeChave(it.nome) === nomeChave(nome)));
    return i < 0 ? null : String(i + 1);
  };
}

/**
 * O orçamento de cada obra nasce com uma versão de verdade: a estrutura do projeto lançada como contrato (etapa
 * "Estrutura"), montada dos insumos da obra — não um contrato fingido. Idempotente: não duplica se já houver. Serve
 * tanto para semear o estado novo quanto para migrar um estado em memória anterior a este campo.
 */
function semearVersoes(e: EstadoDemo): void {
  const porObra = new Map<string, ItemDemo[]>();
  for (const i of e.insumos.values()) {
    if (i.precisa_ate_o_fim > 0) porObra.set(i.obra_id, [...(porObra.get(i.obra_id) ?? []), i]);
  }
  for (const [obraId, ins] of porObra) {
    if (e.versoes.some((v) => v.versao.obra_id === obraId)) continue;
    const itens = ins.map((i) => ({ nome: i.nome, unidade: i.unidade, quantidade: i.precisa_ate_o_fim, valor_unitario: i.valor_unitario }));
    const total = itens.reduce((s, i) => s + Math.round((i.quantidade * i.valor_unitario) / 1000), 0);
    e.versoes.push({
      versao: { id: `demo-estrutura-${obraId}`, obra_id: obraId, tipo: "contrato", numero: 0, descricao: "Estrutura", data: diasAtras(60).slice(0, 10), arquivo: "", itens: itens.length, etapas: 1, total, ativa: true, substitui: null, registro_id: null, criado_em: diasAtras(60) },
      etapas: [{ descricao: "Estrutura", itens }],
      chave: null,
    });
  }
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
  const ped = (numero: string, k: string, q: number, valor: number, status: StatusPedido, previsao: string | null, dias: number): PedidoDemo =>
    doc(
      { numero, obra_id: obra.id, insumo_id: id(k), quantidade: q, fornecedor: REFERENCIA[k]!.fornecedor, valor, status, previsao, rastreio: null },
      diasAtras(dias),
    );
  const pedidos: PedidoDemo[] = [
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
    cronogramas: new Map(),
    registro: [],
    versoes: [],
    contadorPedido: 167,
    idempotencia: new Map(),
    obrasPorChave: new Map(),
    sessoes: new Map(),
    emails: new Map(),
    chave: null,
    creditos: { saldo: 0, franquia: 20_000_000 },
    uso: semearUso(obra.id, outras[0]!.id),
  };
  semearVersoes(e);
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
export const estado = () => {
  const e = (g.__canteiroDemo ??= semear());
  // Estado em memória anterior ao campo `versoes` (hot reload): cria e semeia sem reiniciar (não perde o que a pessoa subiu).
  if (!e.versoes) {
    e.versoes = [];
    semearVersoes(e);
  }
  return e;
};
export const reiniciarDemo = () => {
  g.__canteiroDemo = semear();
  return g.__canteiroDemo;
};

export function saldoDe(e: EstadoDemo, insumoId: string) {
  return e.movimentos.filter((m) => m.insumo_id === insumoId).reduce((s, m) => s + efeitoNoSaldo(m), 0);
}

export function contaDoInsumo(e: EstadoDemo, i: ItemDemo): Conta {
  const linhas = e.pedidos.flatMap((p) => [p, ...(p.outras ?? []).map((l) => ({ ...l, status: p.status }))]).filter((l) => l.insumo_id === i.id);
  const soma = (sts: StatusPedido[]) => linhas.filter((l) => sts.includes(l.status)).reduce((s, l) => s + l.quantidade, 0);
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

/**
 * Troca de senha na demonstração: como o login aceita qualquer senha, não há senha atual para conferir nem o que
 * gravar. Confere só o acesso e as regras da senha nova (as mesmas da API, para a tela se comportar igual) e emite um
 * par novo, sem mudar nada no estado.
 */
export function trocarSenhaDemo(
  authorization: string | null,
  atual: string,
  nova: string,
): RespostaEntrar | { detail: string; status: number; sessao_expirada?: true } {
  const u = usuarioDoAcesso(authorization);
  if (!u) return { detail: "Sua sessão acabou. Entre de novo.", status: 401, sessao_expirada: true };
  const email = estado().emails.get(u.id) ?? "";
  if (!atual) return { detail: "Informe a senha atual.", status: 422 };
  if (nova.length < 8 || nova.length > 256) return { detail: "A nova senha precisa ter de 8 a 256 caracteres.", status: 422 };
  if (nova === atual) return { detail: "A nova senha precisa ser diferente da atual.", status: 422 };
  if (email && nova.trim().toLowerCase() === email) return { detail: "A nova senha não pode ser o seu e-mail.", status: 422 };
  return emitir(estado(), u);
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
  if (!p) throw new NaoEncontrado("PedidoDemo não encontrado.");
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
function avancar(e: EstadoDemo, u: Usuario, p: PedidoDemo, para: StatusPedido, origem: string, rec: Recebimento = {}) {
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

/** A entrega de tudo o que falta, a partir do status real: como a API, vale de aprovado em diante e o Desfazer volta a ele. */
function receber(e: EstadoDemo, u: Usuario, p: PedidoDemo, quantidade?: number) {
  if (!A_CAMINHO.includes(p.status)) throw new RegraViolada(`O pedido não pode receber entrega em '${p.status}'.`);
  const de = p.status;
  const q = quantidade ?? p.quantidade;
  const entrada = (insumo_id: string, qtd: number) => movimentar(e, u, { obra_id: p.obra_id, insumo_id, tipo: "entrada", quantidade: qtd, origem_doc: p.numero, origem: "tela" }).id;
  const [movimento_id, ...movimentos_extra] = [entrada(p.insumo_id, q), ...(p.outras ?? []).map((l) => entrada(l.insumo_id, l.quantidade))];
  p.quantidade_recebida = q;
  p.status = "conferido";
  return { texto: `${p.numero}: chegou`, desfazer: { op: "voltar_pedido", pedido_id: p.id, de, para: "conferido" as const, movimento_id, movimentos_extra } };
}

function unidadeDe(e: EstadoDemo, insumoId: string) {
  for (const i of e.insumos.values()) if (i.id === insumoId) return i.unidade;
  return "";
}

function criarPedido(e: EstadoDemo, obraId: string, d: DadosCriarPedido, aprovado: boolean, outras: LinhaExtraDemo[] = []) {
  if (!e.obras.some((o) => o.id === obraId)) throw new NaoEncontrado("Obra não encontrada.");
  const ins = [...e.insumos.values()].find((i) => i.id === d.insumo_id && i.obra_id === obraId);
  if (!ins) throw new NaoEncontrado("Insumo não encontrado nesta obra.");
  if (!(Number.isInteger(d.quantidade) && d.quantidade > 0)) throw new RegraViolada("A quantidade tem de ser maior que zero.");
  if (!(Number.isInteger(d.valor) && d.valor >= 0)) throw new RegraViolada("Valor inválido.");
  if (!String(d.fornecedor ?? "").trim()) throw new RegraViolada("Diga o fornecedor.");
  for (const l of outras) {
    if (![...e.insumos.values()].some((i) => i.id === l.insumo_id && i.obra_id === obraId)) throw new NaoEncontrado("Insumo não encontrado nesta obra.");
    if (!(Number.isInteger(l.quantidade) && l.quantidade > 0)) throw new RegraViolada("A quantidade tem de ser maior que zero.");
  }
  const status: StatusPedido = aprovado ? "aprovado" : "em_cotacao";
  const p: PedidoDemo = {
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
    ...(outras.length ? { outras } : {}),
  };
  e.pedidos.push(p);
  return {
    pedido: p,
    texto: `${p.numero} criado: ${fmtQtdUn(p.quantidade, ins.unidade)} de ${ins.nome}${outras.length ? ` e mais ${outras.length}` : ""} com ${p.fornecedor} (${fmtReais(p.valor)})${aprovado ? " · aprovado" : ""}`,
    desfazer: { op: "cancelar_pedido", pedido_id: p.id, status_criado: status },
  };
}

/** Os campos que dá para mudar antes de aprovar, por tipo (o mesmo que a API aceita em `ajustes`). */
const AJUSTAVEIS: Record<Proposta["tipo"], string[]> = {
  criar_pedido: ["quantidade", "fornecedor", "valor", "previsao"],
  avancar_pedido: ["quantidade_recebida", "nf"],
  ajuste_estoque: ["quantidade", "motivo"],
  registrar_entrega: ["linhas", "nf_numero", "nf_data", "nf_valor", "confirmar_excesso"],
  cronograma: [],
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
  } else if (pr.tipo === "cronograma") {
    const o = obraPorId(e, pr.obra_id);
    const { anterior, meses } = gravarCronograma(e, o, dados as Record<string, unknown>);
    desfazer = { op: "cronograma_restaurar", obra_id: o.id, anterior };
    texto = `Montou o cronograma de ${o.nome} (${meses} ${meses === 1 ? "mês" : "meses"}) pela proposta da IA`;
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
  if (pr.tipo === "cronograma") { const g = e.cronogramas.get(pr.obra_id); if (g) g.registro_id = registro.id; }
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
  const d = ent.desfazer as { op: string; pedido_id: string; de: StatusPedido; para: StatusPedido; status_criado?: StatusPedido; movimento_id: string | null; movimentos_extra?: string[] };
  let texto: string;
  if (d.op === "cancelar_pedido") {
    const p = pedidoPorId(e, d.pedido_id);
    if (p.status !== (d.status_criado ?? "em_cotacao")) throw new Conflito(`${p.numero} já andou (${p.status}); cancele pelo fluxo do pedido.`);
    p.status = "cancelado";
    texto = `Desfeito: ${p.numero} cancelado`;
  } else if (d.op === "voltar_pedido") {
    const p = pedidoPorId(e, d.pedido_id);
    if (p.status !== d.para) throw new Conflito(`${p.numero} já mudou de status desde então; não dá para desfazer.`);
    for (const m of [d.movimento_id, ...(d.movimentos_extra ?? [])]) if (m) estornar(e, u, m);
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
  } else if (d.op === "desfazer_versao") {
    const vid = (ent.desfazer as { versao_id: string }).versao_id;
    const vd = e.versoes.find((v) => v.versao.id === vid);
    if (!vd) throw new NaoEncontrado("Versão do orçamento não encontrada.");
    if (!vd.versao.ativa) throw new Conflito("Esta versão do orçamento já foi desfeita.");
    const reativar = (ent.desfazer as { reativar?: string }).reativar;
    const anterior = reativar ? e.versoes.find((v) => v.versao.id === reativar) : undefined;
    vd.versao.ativa = false;
    if (anterior) {
      anterior.versao.ativa = true;
      texto = vd.versao.origem === "somar"
        ? `Desfeito: os itens somados ao orçamento saíram (o anterior volta a valer)`
        : `Desfeito: as etapas do orçamento de ${e.obras.find((x) => x.id === vd.versao.obra_id)?.nome ?? "a obra"} voltaram à ordem de antes`;
    } else texto = `Desfeito: ${vd.versao.tipo === "contrato" ? "contrato" : `aditivo ${vd.versao.numero}`} «${vd.versao.descricao}» removido do orçamento`;
  } else if (d.op === "cronograma_restaurar") {
    const dd = ent.desfazer as unknown as { obra_id: string; anterior: CronogramaDemo | null };
    if (dd.anterior) e.cronogramas.set(dd.obra_id, dd.anterior);
    else e.cronogramas.delete(dd.obra_id);
    texto = `Desfeito: cronograma ${dd.anterior ? "reprogramado" : "montado"} em ${obraPorId(e, dd.obra_id).nome}`;
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
        tem_orcamento: e.versoes.some((v) => v.versao.obra_id === obra.id && v.versao.ativa) || insumos.some((i) => i.precisa_ate_o_fim > 0),
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
      if (metodo === "GET" && b === "etapas" && !id2) return ok(etapasDemo(e, id));
      // Fase 4 (cronograma e medição): a demo ganha no fim da fase. O GET vem vazio, com as etapas do orçamento dela.
      if (metodo === "GET" && b === "cronograma" && !id2) {
        return ok(montarCronogramaDemo(e, obraPorId(e, id)));
      }
      if (metodo === "POST" && b === "cronograma" && id2 === "propor") {
        return ok(proporCronogramaDemo(e, obraPorId(e, id)));
      }
      if (metodo === "PUT" && b === "cronograma") {
        const o = obraPorId(e, id);
        const { anterior, meses } = gravarCronograma(e, o, c as Record<string, unknown>);
        const reg = registrar(e, u, { obra_id: o.id, texto: `${anterior ? "Reprogramou" : "Montou"} o cronograma de ${o.nome} (${meses} ${meses === 1 ? "mês" : "meses"})`, proposta_id: null, desfazer: { op: "cronograma_restaurar", obra_id: o.id, anterior }, origem: "tela" });
        const g = e.cronogramas.get(o.id);
        if (g) g.registro_id = reg.id;
        return ok(montarCronogramaDemo(e, o));
      }
      if (metodo === "POST" && b === "medicoes") return erro(422, INDISPONIVEL);
      // a seção nem monta enquanto a demo não tem cronograma; quando ganhar, o desembolso vem vazio em vez de 404
      if (metodo === "GET" && b === "desembolso" && !id2) {
        const orc = orcamentoDemo(e, obraPorId(e, id));
        const realizado = orc.totais.realizado;
        return ok({
          mes_atual: new Date().toISOString().slice(0, 7),
          base: "sem_cronograma",
          mes_referencia: null,
          atraso_meses: 0,
          ritmo_pct: 10000,
          termino_projetado: null,
          termino_no_ritmo: null,
          meses: [],
          etapas: [],
          // a demo não lança pagamento: todo o realizado é entregue e ainda a pagar, como o resumo diz
          totais: { orcado: orc.totais.atual, realizado, pago: 0, falta: 0, custo_final: realizado, desvio: 0, entregue_sem_pagamento: realizado, sem_mes: 0 },
        });
      }
      if (metodo === "GET" && b === "resumo" && !id2) {
        const obra = obraPorId(e, id);
        const orc = orcamentoDemo(e, obra);
        const t = orc.totais;
        // Mesma regra da API (servicos/resumo.py): só o contrato vigente faz a obra "ter orçamento".
        const tem = orc.versoes.some((v) => v.ativa && v.tipo === "contrato");
        const pendentes = e.propostas.filter((p) => p.obra_id === obra.id && p.status === "pendente");
        return ok({
          obra,
          hoje: new Date().toISOString().slice(0, 10),
          // a demonstração não tem cronograma: o mesmo "sem cronograma" que a API devolve
          cronograma: { cadastrado: false, mes_corrente: new Date().toISOString().slice(0, 7), termino_contratual: null, termino_projetado: null, atraso_decimos: null },
          financeiro: {
            tem_orcamento: tem,
            contratado: t.contratado,
            aditivos: t.aditivos,
            aditivos_pct: t.aditivos_pct,
            orcado_atual: t.atual,
            cotando: t.cotando,
            comprometido: t.comprometido,
            realizado: t.realizado,
            // sem pagamento lançado na demo: o realizado inteiro é entrega ainda a pagar
            pago: 0,
            entregue_a_pagar: t.realizado,
            saldo: t.saldo,
            falta_gastar: Math.max(0, t.atual - t.realizado),
            realizado_pct: t.atual ? Math.round((t.realizado * 10000) / t.atual) : null,
            etapas_estouradas: [],
            gastos: { total: 0, nas_etapas: 0, fora_do_orcamento: 0, na_lista_padrao: 0, sem_etapa_do_orcamento: 0 },
          },
          entregas: { hoje: [], atrasadas: [], proximos_7_dias: [], sem_previsao: [], nf_para_conferir: [] },
          almoxarifado: { insumos: 0, falta_comprar: [], sem_previsao: [], consumo_projetado: false },
          pendencias: { propostas: pendentes.length, titulos: pendentes.slice(0, 5).map((p) => p.titulo) },
        });
      }
      if (metodo === "GET" && b === "orcamento" && !id2) return ok(orcamentoDemo(e, obraPorId(e, id)));
      if (metodo === "POST" && b === "orcamento") {
        exigirAdmin(u);
        if (id2 === "versoes") return erro(422, "Na demonstração a importação do orçamento por etapas não está disponível.");
        if (id2 === "estrutura") return ok(lancarEstrutura(e, u, obraPorId(e, id), c as Record<string, unknown>));
        if (id2 === "etapas" && c2 === "ordem") return ok(ordenarEtapas(e, u, obraPorId(e, id), c as Record<string, unknown>));
        const existentes = () =>
          [...e.insumos.values()]
            .filter((i) => i.obra_id === id)
            .map((i) => ({ nome: i.nome, unidade: i.unidade, precisa: i.precisa_ate_o_fim, valor: i.valor_unitario }));
        if (id2 === "materiais") {
          // os materiais das pranchas: a mesma prévia e gravação da lista de materiais, sem planilha
          const corpo = c as { origem?: string; itens?: { nome: string; unidade: string; quantidade: number; valor_unitario?: number }[]; aplicar?: boolean };
          const itens = corpo.itens ?? [];
          if (!itens.length || itens.some((x) => !x.nome?.trim() || !(x.quantidade > 0))) return erro(422, "Envie os materiais com nome e quantidade.");
          const unidade = (u2: string) => ({ m3: "m³", m2: "m²" })[u2.trim().toLowerCase()] ?? u2.trim();
          const ex = existentes();
          const total = (q: number, v: number) => Math.round((q * v) / 1000);
          const soma = itens.reduce((s, x) => s + total(x.quantidade, x.valor_unitario ?? 0), 0);
          let acumulado = 0;
          const linhas = [...itens]
            .map((x, i) => ({ x, i }))
            .sort((a, b) => total(b.x.quantidade, b.x.valor_unitario ?? 0) - total(a.x.quantidade, a.x.valor_unitario ?? 0))
            .map(({ x, i }) => {
              const t2 = total(x.quantidade, x.valor_unitario ?? 0);
              const antes = acumulado;
              acumulado += t2;
              const curva: "A" | "B" | "C" = !soma ? "B" : antes < soma * 0.8 ? "A" : antes < soma * 0.95 ? "B" : "C";
              const atual = ex.find((y) => nomeChave(y.nome) === nomeChave(x.nome));
              return {
                linhas: [i + 1], nome: x.nome.trim(), unidade: unidade(x.unidade), quantidade: x.quantidade, valor_unitario: x.valor_unitario ?? 0,
                total: t2, curva, saldo: 0, situacao: atual ? ("atualiza" as const) : ("novo" as const),
                precisa_antes: atual ? atual.precisa : null, valor_antes: atual ? atual.valor : null,
              };
            })
            .sort((a, b) => a.linhas[0]! - b.linhas[0]!);
          const erros = linhas
            .filter((l) => { const a = ex.find((y) => nomeChave(y.nome) === nomeChave(l.nome)); return a && a.unidade.toLowerCase() !== l.unidade.toLowerCase(); })
            .map((l) => ({ linha: l.linhas[0]!, campo: "unidade", mensagem: `'${l.nome}' já está cadastrado em outra unidade nesta obra.` }));
          const previa = { aplicado: false, linhas, ignoradas: [], erros, total: linhas.reduce((s, l) => s + l.total, 0), novos: linhas.filter((l) => l.situacao === "novo").length, atualizados: linhas.filter((l) => l.situacao === "atualiza").length, juntadas: 0 };
          if (!corpo.aplicar || erros.length) return ok(previa);
          for (const l of linhas) {
            const atual = [...e.insumos.values()].find((i) => i.obra_id === id && nomeChave(i.nome) === nomeChave(l.nome));
            if (atual) Object.assign(atual, { precisa_ate_o_fim: l.quantidade, valor_unitario: l.valor_unitario, curva: l.curva });
            else {
              const ins: ItemDemo = { id: uuid7(), tenant_id: TENANT, criado_em: agoraISO(), obra_id: id, nome: l.nome, unidade: l.unidade, precisa_ate_o_fim: l.quantidade, curva: l.curva, valor_unitario: l.valor_unitario };
              e.insumos.set(`orc-${ins.id}`, ins);
            }
          }
          const reg = registrar(e, u, {
            obra_id: id,
            texto: `Importou os materiais do ${String(corpo.origem ?? "projeto")}: ${previa.novos} novos, ${previa.atualizados} atualizados (${fmtReais(previa.total)})`,
            proposta_id: null,
            desfazer: null,
            origem: "tela",
          });
          return ok({ ...previa, aplicado: true, registro_ids: [reg.id] });
        }
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
          // Aprovar o orçamento é o que cria as compras: cada item das versões vigentes (ex.: a etapa "Estrutura"
          // vinda do projeto) vira um insumo da obra, com a quantidade do orçamento como o que precisa. Só aqui o
          // material entra em Compras — antes de aprovar, o projeto fica só no orçamento.
          for (const v of e.versoes.filter((x) => x.versao.obra_id === id && x.versao.ativa)) {
            for (const et of v.etapas) {
              for (const it of et.itens) {
                if (it.quantidade <= 0) continue;
                const ex = [...e.insumos.values()].find((i) => i.obra_id === id && nomeChave(i.nome) === nomeChave(it.nome));
                if (ex) {
                  ex.precisa_ate_o_fim = Math.max(ex.precisa_ate_o_fim, it.quantidade);
                  if (!ex.valor_unitario) ex.valor_unitario = it.valor_unitario;
                  continue;
                }
                const ins: ItemDemo = {
                  id: uuid7(), tenant_id: TENANT, criado_em: agoraISO(), obra_id: id,
                  nome: it.nome, unidade: it.unidade, precisa_ate_o_fim: it.quantidade, curva: "B", valor_unitario: it.valor_unitario,
                };
                e.insumos.set(`orc-${ins.id}`, ins);
              }
            }
          }
          const its = [...e.insumos.values()].filter((i) => i.obra_id === id && i.precisa_ate_o_fim > 0);
          if (!its.length) return erro(422, "Lance o projeto (ou importe o orçamento) antes de aprovar.");
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
      if (metodo === "PATCH" && b === "orcamento" && id2 === "itens" && c2) {
        exigirAdmin(u);
        return editarItemDemo(e, u, obraPorId(e, id), c2, c);
      }
      if (metodo === "GET" && b === "hoje" && !id2) return ok(hojeDemo(e, obraPorId(e, id)));
      if (metodo === "GET" && b === "insumos" && !id2) {
        const etapa = etapaDoInsumo(e, id);
        const itens = [...e.insumos.values()].filter((i) => i.obra_id === id).map((insumo) => ({ insumo: { ...insumo, etapa: etapa(insumo.nome) }, conta: contaDoInsumo(e, insumo) }));
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
          ).map((p) => pedidoApi(e, p)),
        );
      }
      if (metodo === "POST" && b === "pedidos" && !id2) {
        exigirAdmin(u);
        const chavePedido = typeof c.chave_idempotencia === "string" ? c.chave_idempotencia : undefined;
        const repetido = chavePedido ? e.pedidos.find((p) => p.obra_id === id && p.chave === chavePedido) : undefined;
        if (repetido) return ok({ ...pedidoApi(e, repetido), registro_id: null });
        // Corpo novo: um pedido só, com todas as linhas, e um registro só para o Desfazer cancelar tudo.
        const linhas = c.linhas as { insumo_id: string; quantidade: number; valor_unitario: number }[] | undefined;
        const totalDe = (l: { quantidade: number; valor_unitario: number }) => Math.round((l.quantidade * l.valor_unitario) / 1000);
        const d = linhas
          ? { insumo_id: linhas[0]!.insumo_id, quantidade: linhas[0]!.quantidade, fornecedor: c.fornecedor, previsao: c.previsao ?? null, valor: linhas.reduce((t, l) => t + totalDe(l), 0) }
          : c;
        const outras = (linhas ?? []).slice(1).map((l) => ({ insumo_id: l.insumo_id, quantidade: l.quantidade, valor: totalDe(l) }));
        const r = criarPedido(e, id, d as unknown as DadosCriarPedido, c.aprovado === true, outras);
        r.pedido.chave = chavePedido;
        const reg = registrar(e, u, { obra_id: id, texto: r.texto, proposta_id: null, desfazer: r.desfazer, origem: "tela" });
        return ok({ ...pedidoApi(e, r.pedido), registro_id: reg.id }, 201);
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
      return ok({ ...pedidoApi(e, p), registro_id: reg.id });
    }
    // Fase 2 (fornecedores, recebimentos, etapas, edição do pedido): a demo ganha no fim da fase.
    if (a === "fornecedores" && metodo === "GET" && !id) return ok([]);
    if (a === "fornecedores") return erro(422, INDISPONIVEL);
    if (a === "pedidos" && id && b === "recebimentos" && metodo === "GET") return ok([]);
    if (metodo === "POST" && a === "pedidos" && id && b === "recebimentos") {
      exigirAdmin(u);
      const p = pedidoPorId(e, id);
      // A demo não tem entrega parcial: o que chegou encerra o pedido.
      const r = receber(e, u, p, (c.linhas as { indice: number; quantidade: number }[] | undefined)?.find((l) => l.indice === 0)?.quantidade);
      const reg = registrar(e, u, { obra_id: p.obra_id, texto: r.texto, proposta_id: null, desfazer: r.desfazer, origem: "tela" });
      return ok({ recebimento: {}, pedido: pedidoApi(e, p), registro_id: reg.id }, 201);
    }
    if (a === "pedidos" && id && metodo === "PATCH" && !b) return erro(422, INDISPONIVEL);
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
