/**
 * Modo de demonstração: o próprio Next se passa pela API central, com a Casa Vila Nova do contrato em memória.
 * Serve para trabalhar na web antes de a API e o agente existirem. Segue o contrato ao pé da letra (rotas, códigos,
 * formatos), inclusive "o agente só propõe": a escrita da conversa vira Proposta e só o aprovar executa, com registro
 * e desfazer. Os dados somem quando o servidor reinicia.
 */
import "server-only";
import type {
  DadosObra,
  CurvaABC,
  Cronograma,
  CorpoCronograma,
  PrazoCronograma,
  EntradaRegistro,
  Fornecedor,
  MinhaConta,
  Obra,
  HojeNaObra,
  PontoHoje,
  Orcamento,
  PreviaVersao,
  MaterialDoProjeto,
  VersaoOrcamento,
  Proposta,
  RespostaEntrar,
  StatusProposta,
  Usuario,
} from "../contrato";
import { cnpjValido, digitosCnpj } from "../cnpj";
import { fmtReais } from "../formato";
import { CEM, gerarCronograma, listaMeses, previsaoMensal, redimensionar, somarMes } from "../cronograma";
import type { MensagemSessao, SessaoApi } from "../historico";
import { uuid7 } from "../ids";
import { PlanilhaInvalida, lerPlanilhaDemo, nomeChave } from "./orcamento";

export { uuid7 };
import { ArquivoGrande, Conflito, NaoEncontrado, Proibido, RegraViolada } from "./erros";
import * as gastos from "./gastos";

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
  /** Os fornecedores da empresa (valem para todas as obras), como a API guarda. */
  fornecedores: Fornecedor[];
  propostas: Proposta[];
  registro: EntradaRegistro[];
  /** As versões do orçamento (contrato e aditivos), como a API as guarda. Uma versão desfeita fica com `ativa: false`. */
  versoes: VersaoDemo[];
  /** O cronograma de cada obra (grade etapa × mês), gravado pelo editor ou pela proposta da IA. */
  cronogramas: Map<string, CronogramaDemo>;
  /** chave_idempotencia → obra criada pela tela (POST /obras repetido devolve a mesma). */
  obrasPorChave: Map<string, Obra>;
  /** Histórico das conversas no formato que o agente grava (um item por mensagem, como na coleção `mensagens`). */
  sessoes: Map<string, { sessao: SessaoApi; mensagens: MensagemSessao[] }>;
  /** Quem já recebeu as conversas de exemplo (uma vez por pessoa, na primeira lista). */
  conversasDemo: Set<string>;
  /** E-mail com que cada pessoa entrou (o Usuario do contrato não traz e-mail; GET /conta traz). */
  emails: Map<string, string>;
  /** Da chave própria a demonstração guarda só o final, como a tela enxerga: a chave em si é descartada. */
  chave: { final: string; cadastrada_em: string; por: string } | null;
  creditos: { saldo: number; franquia: number };
  /** Linhas de UsoIA (custo em microdólares), somadas na hora como a API faz. */
  uso: { dia: string; obra_id: string | null; rota: string; custo: number; tokens: number }[];
  /** Comprovantes, gastos, etapas extras e tópicos (lib/demo/gastos.ts). */
  gastos: gastos.EstadoGastos;
}

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

  const somaGastos = gastos.somaPorEtapa(baseGastos(e), o.id);
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
    // O gasto confirmado soma no comprometido e no realizado da etapa (sem pedido, os dois são o mesmo número).
    const gasto = somaGastos.get(num)?.total ?? 0;
    const contas = { cotando: 0, comprometido: gasto, realizado: gasto };
    etapas.push({ etapa: num, descricao: desc, contratado: aditivo ? 0 : totalEtapa, aditivos: aditivo ? totalEtapa : 0, atual: totalEtapa, saldo: totalEtapa - gasto, estourou: gasto > totalEtapa, ...contas });
  });

  const contratado = ativas.filter((v) => v.versao.tipo === "contrato").reduce((s, v) => s + v.versao.total, 0);
  const aditivos = ativas.filter((v) => v.versao.tipo === "aditivo").reduce((s, v) => s + v.versao.total, 0);
  const atual = contratado + aditivos;
  // gasto sem etapa, em etapa extra ou em chave que saiu do orçamento: conta na obra e em nenhuma etapa
  const chaves = new Set(etapas.map((x) => x.etapa));
  const fora = [...somaGastos.entries()].filter(([k]) => k === null || !chaves.has(k)).reduce((t, [, v]) => t + v.total, 0);
  const realizado = [...somaGastos.values()].reduce((t, v) => t + v.total, 0);
  return {
    versoes: metas,
    itens,
    etapas,
    totais: {
      contratado,
      aditivos,
      atual,
      saldo: atual - realizado,
      aditivos_pct: contratado ? Math.round((aditivos / contratado) * 10000) : null,
      n_itens: planas.length,
      n_etapas: etapas.length,
      cotando: 0,
      comprometido: realizado,
      realizado,
      sem_etapa: { cotando: 0, comprometido: fora, realizado: fora },
    },
  };
}

/** Como a API compara nomes de etapa e de item: sem caixa, sem acento, sem espaço sobrando. */
const normal = (t: string) => nomeChave(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
/** "concreto": o termo principal de uma descrição, para achar o mesmo material com outro nome. */
const termoPrincipal = (d: string) => normal(d).split(" ").find((p) => p.length >= 3) ?? "";

/**

/** O bloco `cronograma` do resumo, a partir do GET /cronograma: o placar lê o prazo daqui. */
function cronogramaDoResumo(c: Cronograma) {
  return {
    cadastrado: !!c.inicio && c.meses > 0,
    mes_corrente: new Date().toISOString().slice(0, 7),
    termino_contratual: c.prazo.termino_contratual,
    termino_projetado: c.prazo.pct_medido === null ? null : c.prazo.termino_projetado,
    atraso_decimos: c.prazo.pct_medido === null ? null : c.prazo.atraso_decimos,
  };
}

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
    fonte: "orçamento da obra (etapas e valores)",
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
  const usadas = new Set(e.gastos.gastos.filter((g) => g.obra_id === o.id && !g.estornado && g.etapa).map((g) => g.etapa!));
  const presas = ordem.filter((k, i) => k !== String(i + 1) && usadas.has(k));
  if (presas.length) {
    const nome = (k: string) => `${k} ${vigente.etapas[Number(k) - 1]?.descricao ?? ""}`.trim();
    throw new Conflito(`Já há lançamento (gasto, tópico ou cronograma) na etapa ${presas.sort().map(nome).join(", ")}: renumerar levaria o lançamento para outra etapa.`);
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

const INDISPONIVEL = "Indisponível na demonstração.";

/** GET /obras/{id}/hoje na demonstração: os mesmos tipos de ponto que a demo consegue saber, na ordem do contrato. */
function hojeDemo(e: EstadoDemo, o: Obra): HojeNaObra {
  const temOrcamento = e.versoes.some((v) => v.versao.obra_id === o.id && v.versao.ativa);
  const propostas = e.propostas.filter((p) => p.obra_id === o.id && p.status === "pendente").length;
  const semPreco = temOrcamento ? orcamentoDemo(e, o).itens.filter((i) => i.tipo === "item" && !i.valor_unitario).length : 0;
  const acao = (tela: string, rotulo: string) => ({ tela, rotulo, filtro: null });
  const itens = (n: number) => (n === 1 ? "1 item" : `${n} itens`);
  const pontos: PontoHoje[] = [];
  if (!temOrcamento) pontos.push({ tipo: "sem_orcamento", prioridade: "pede_voce", titulo: "A obra ainda não tem orçamento.", detalhe: "Envie as pranchas ou importe a planilha do orçamento.", acao: acao("projeto", "Enviar as pranchas") });
  if (semPreco) pontos.push({ tipo: "itens_sem_preco", prioridade: "atencao", titulo: `${itens(semPreco)} sem preço.`, detalhe: "Entram com R$ 0,00 no orçado.", acao: acao("orcamento", "Preencher os preços") });
  pontos.push(...pontosDeGastos(e, o));
  // como a API: por prioridade (o que pede você, o que pede atenção) e, dentro dela, na ordem acima
  const peso: Record<string, number> = { pede_voce: 0, atencao: 1, a_caminho: 2 };
  pontos.sort((x, y) => (peso[x.prioridade] ?? 9) - (peso[y.prioridade] ?? 9));
  const esperando = propostas + pontos.filter((p) => p.prioridade === "pede_voce").length;
  const base = o.status === "em_orcamento" ? "A obra ainda está em orçamento" : "A obra ainda não tem medição";
  return {
    hoje: hojeSP().slice(0, 10),
    resumo: { situacao: "sem_medicao", frase: `${base}.`, esperando },
    pontos: pontos.slice(0, 6),
    mais: Math.max(0, pontos.length - 6),
    semana: [],
  };
}

/**
 * Os pontos do Hoje que saem dos gastos e do orçamento, como `servicos/hoje.py`: comprovante para conferir, etapa que
 * passou do orçado e gasto sem etapa. Na ordem da API dentro de cada prioridade.
 */
function pontosDeGastos(e: EstadoDemo, o: Obra): PontoHoje[] {
  const bg = baseGastos(e);
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  const lista = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} e ${xs.at(-1)}`);
  const pontos: PontoHoje[] = [];
  const fila = e.gastos.comprovantes.filter((c) => c.obra_id === o.id && c.status === "a_revisar");
  if (fila.length) {
    const lidos = fila.map((c) => gastos.detalheDoComprovante(bg, c.id).revisao.valor).filter((v) => v.opcoes.length).map((v) => Number(v.opcoes[0]!.valor));
    const faltam = fila.length - lidos.length;
    const detalhe = lidos.length
      ? `${fmtReais(lidos.reduce((t, v) => t + v, 0))} pelo que já foi lido${faltam ? `; ${faltam} ainda sem leitura.` : "."} Falta você confirmar.`
      : "Ainda sem leitura. Falta você conferir o valor e confirmar.";
    pontos.push({ tipo: "gastos_a_conferir", prioridade: "pede_voce", titulo: `${plural(fila.length, "comprovante", "comprovantes")} para conferir.`, detalhe, acao: { tela: "gastos", rotulo: "Conferir", filtro: { status: "a_revisar" } } });
  }
  const estouradas = orcamentoDemo(e, o).etapas.filter((x) => x.estourou);
  if (estouradas.length) {
    const excesso = estouradas.reduce((t, x) => t - x.saldo, 0);
    const um = estouradas[0]!;
    pontos.push({
      tipo: "etapas_estouradas",
      prioridade: "atencao",
      titulo: estouradas.length === 1 ? `${um.descricao} passou do orçado em ${fmtReais(excesso)}.` : `${estouradas.length} etapas passaram do orçado.`,
      detalhe: estouradas.length === 1 ? `Gasto ${fmtReais(um.comprometido)} de ${fmtReais(um.atual)} orçados.` : `${lista(estouradas.map((x) => x.descricao))}: ${fmtReais(excesso)} acima do orçado.`,
      acao: { tela: "orcamento", rotulo: "Ver o orçamento", filtro: null },
    });
  }
  const semEtapa = e.gastos.gastos.filter((g) => g.obra_id === o.id && !g.estornado && g.etapa === null);
  if (semEtapa.length)
    pontos.push({
      tipo: "gastos_sem_etapa",
      prioridade: "atencao",
      titulo: `${plural(semEtapa.length, "gasto", "gastos")} sem etapa.`,
      detalhe: `${fmtReais(semEtapa.reduce((t, g) => t + g.valor, 0))} contam na obra e em nenhuma etapa até você definir.`,
      acao: { tela: "gastos", rotulo: "Definir a etapa", filtro: { status: "a_definir" } },
    });
  return pontos;
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
  const usuarios: Usuario[] = [
    { id: uuid7(), nome: "Rizzi", tenant_id: TENANT, papel: "admin" },
    { id: uuid7(), nome: "Paula (leitura)", tenant_id: TENANT, papel: "viewer" },
    { id: uuid7(), nome: "Marina Duarte", tenant_id: TENANT, papel: "master" },
  ];
  // Mais obras, para a página inicial mostrar mais de um cartão e os estados de obra.
  // Obra-vitrine: orçamento multi-etapa, em orçamento e sem cronograma — pronta para "Gerar com IA" mostrar o
  // sequenciamento por fase (fundação → superestrutura → alvenaria → acabamento) no Gantt.
  const vitrine: Obra = doc({ ...OBRA_VAZIA, nome: "Residencial Alto Padrão", cidade: "Campinas", uf: "SP", cep: "13100-000", verba: 120_000_000, prazo_meses: 14, inicio: "2026-11-01", status: "em_orcamento" as const });
  const outras: Obra[] = [
    doc({ ...OBRA_VAZIA, nome: "Sobrado Jardim Europa", cidade: "Valinhos", uf: "SP", cep: "13270-000", verba: 91000000, status: "em_orcamento" as const }),
    doc({ ...OBRA_VAZIA, nome: "Reforma Loja Centro", cidade: "Campinas", uf: "SP", cep: "13010-000", verba: 12500000, status: "concluida" as const }),
    vitrine,
  ];
  const e: EstadoDemo = {
    usuarios,
    acessos: new Map(),
    renovacoes: new Map(),
    obras: [obra, ...outras],
    fornecedores: FORNECEDORES_DEMO.map((f) => ({ id: uuid7(), ...f })),
    propostas: [],
    cronogramas: new Map(),
    registro: [],
    versoes: [],
    obrasPorChave: new Map(),
    sessoes: new Map(),
    conversasDemo: new Set(),
    emails: new Map(),
    chave: null,
    creditos: { saldo: 0, franquia: 20_000_000 },
    uso: semearUso(obra.id, outras[0]!.id),
    gastos: gastos.gastosVazios(),
  };
  // A versão multi-etapa da obra-vitrine (quatro etapas na ordem de obra); orcamentoDemo as numera 1..4.
  {
    const etapas = [
      { descricao: "Fundação", itens: [{ nome: "Concreto fck25 (fundação)", unidade: "m³", quantidade: 40_000, valor_unitario: 49_600 }, { nome: "Aço CA-50", unidade: "kg", quantidade: 2_000_000, valor_unitario: 700 }] },
      { descricao: "Superestrutura", itens: [{ nome: "Concreto fck30", unidade: "m³", quantidade: 60_000, valor_unitario: 51_200 }, { nome: "Fôrma de madeira", unidade: "m²", quantidade: 400_000, valor_unitario: 6_900 }] },
      { descricao: "Alvenaria", itens: [{ nome: "Bloco cerâmico", unidade: "un", quantidade: 8_000_000, valor_unitario: 200 }] },
      { descricao: "Acabamento", itens: [{ nome: "Revestimento cerâmico", unidade: "m²", quantidade: 500_000, valor_unitario: 4_500 }, { nome: "Pintura látex", unidade: "m²", quantidade: 1_200_000, valor_unitario: 2_000 }] },
    ];
    const total = etapas.reduce((s, et) => s + et.itens.reduce((a, i) => a + Math.round((i.quantidade * i.valor_unitario) / 1000), 0), 0);
    e.versoes.push({
      versao: { id: `demo-vitrine-${vitrine.id}`, obra_id: vitrine.id, tipo: "contrato", numero: 0, descricao: "Orçamento", data: diasAtras(30).slice(0, 10), arquivo: "", itens: etapas.reduce((s, et) => s + et.itens.length, 0), etapas: etapas.length, total, ativa: true, substitui: null, registro_id: null, criado_em: diasAtras(30) },
      etapas,
      chave: null,
    });
  }
  // Saldo coerente com o consumo do mês: franquia menos o que já foi gasto desde o dia 1.
  const mes = hojeSP().slice(0, 8);
  e.creditos.saldo = Math.max(0, e.creditos.franquia - e.uso.filter((x) => x.dia >= `${mes}01`).reduce((t, x) => t + x.custo, 0));
  semearObraEmAndamento(e, obra);
  return e;
}

/** Fornecedores da empresa na demonstração: fictícios, com CNPJ válido de exemplo só para o cadastro ter o que mostrar. */
const FORNECEDORES_DEMO: Omit<Fornecedor, "id">[] = [
  { nome: "Concreteira Campinas (fictícia)", cnpj: "", contato: "Vendas", telefone: "", email: "" },
  { nome: "Aço Forte · distribuidor (fictício)", cnpj: "", contato: "", telefone: "", email: "" },
  { nome: "Elétrica Bom Jesus (fictícia)", cnpj: "", contato: "", telefone: "", email: "" },
];

/** Item do orçamento em unidades de gente (quantidade e R$); a demo guarda em milésimos e centavos. */
const itemOrc = (nome: string, unidade: string, quantidade: number, reais: number) => ({ nome, unidade, quantidade: Math.round(quantidade * 1000), valor_unitario: Math.round(reais * 100) });

/** O orçamento da Casa Vila Nova: a obra inteira, etapa por etapa, como a planilha de um sobrado. */
const ORCAMENTO_CASA: VersaoDemo["etapas"] = [
  { descricao: "Serviços preliminares", itens: [itemOrc("Tapume e barracão de obra", "vb", 1, 9_000), itemOrc("Ligações provisórias de água e energia", "vb", 1, 3_000), itemOrc("Limpeza e locação da obra", "m²", 300, 20)] },
  { descricao: "Fundação", itens: [itemOrc("Escavação manual", "m³", 60, 70), itemOrc("Concreto fck 25 MPa", "m³", 36, 480), itemOrc("Aço CA-50", "kg", 1_500, 6.6), itemOrc("Mão de obra da fundação", "vb", 1, 10_620)] },
  { descricao: "Estrutura", itens: [itemOrc("Concreto fck 30 MPa", "m³", 60, 510), itemOrc("Aço CA-50 e CA-60", "kg", 4_000, 6.6), itemOrc("Fôrmas e escoramento", "m²", 500, 30), itemOrc("Mão de obra da estrutura", "vb", 1, 24_000)] },
  { descricao: "Alvenaria", itens: [itemOrc("Bloco cerâmico 14×19×29", "un", 9_000, 3.2), itemOrc("Argamassa de assentamento", "m³", 30, 240), itemOrc("Mão de obra da alvenaria", "m²", 400, 30)] },
  { descricao: "Cobertura", itens: [itemOrc("Estrutura de madeira do telhado", "m²", 120, 140), itemOrc("Telha cerâmica", "m²", 120, 90), itemOrc("Calhas e rufos", "m", 60, 140)] },
  { descricao: "Instalações elétricas", itens: [itemOrc("Padrão de entrada de energia", "vb", 1, 2_500), itemOrc("Fiação e eletrodutos", "vb", 1, 14_500), itemOrc("Quadros, tomadas e luminárias", "vb", 1, 11_000)] },
  { descricao: "Instalações hidrossanitárias", itens: [itemOrc("Tubos e conexões", "vb", 1, 12_000), itemOrc("Louças e metais", "vb", 1, 14_000)] },
  { descricao: "Revestimentos", itens: [itemOrc("Chapisco e reboco", "m²", 900, 38), itemOrc("Azulejo das áreas molhadas", "m²", 180, 110)] },
  { descricao: "Pisos", itens: [itemOrc("Contrapiso", "m²", 186, 45), itemOrc("Porcelanato", "m²", 186, 155), itemOrc("Rodapé", "m", 120, 6.75)] },
  { descricao: "Esquadrias", itens: [itemOrc("Portas de madeira", "un", 12, 1_100), itemOrc("Janelas de alumínio", "m²", 24, 780)] },
  { descricao: "Pintura", itens: [itemOrc("Massa e tinta", "m²", 1_100, 20)] },
  { descricao: "Limpeza e entrega", itens: [itemOrc("Limpeza final da obra", "vb", 1, 6_000)] },
];

/** % de cada etapa por mês (centésimos de %), 12 meses: a obra começou há três meses e está na estrutura. */
const CRONOGRAMA_CASA: number[][] = [
  [10000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [4000, 6000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 2000, 4000, 4000, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 3000, 4000, 3000, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 5000, 5000, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 2000, 0, 3000, 0, 3000, 0, 2000, 0],
  [0, 0, 0, 0, 2000, 0, 3000, 0, 3000, 0, 2000, 0],
  [0, 0, 0, 0, 0, 0, 2500, 3500, 4000, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 3000, 4000, 3000, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 5000, 5000, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5000, 5000],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10000],
];

/**
 * A Casa Vila Nova: o orçamento da obra inteira por etapas, o cronograma delas e o dinheiro que já saiu, comprovante
 * por comprovante, coerente entre Orçamento, Cronograma, Gastos e o resumo. A Fundação passou do orçado (o Resumo e o
 * Hoje têm o que avisar) e dois comprovantes esperam conferência.
 */
function semearObraEmAndamento(e: EstadoDemo, obra: Obra) {
  const total = ORCAMENTO_CASA.reduce((t, et) => t + et.itens.reduce((a, i) => a + Math.round((i.quantidade * i.valor_unitario) / 1000), 0), 0);
  e.versoes.push({
    versao: { id: `demo-orcamento-${obra.id}`, obra_id: obra.id, tipo: "contrato", numero: 0, descricao: "Orçamento", data: diasAtras(100).slice(0, 10), arquivo: "", itens: ORCAMENTO_CASA.reduce((t, et) => t + et.itens.length, 0), etapas: ORCAMENTO_CASA.length, total, ativa: true, substitui: null, registro_id: null, criado_em: diasAtras(100) },
    etapas: ORCAMENTO_CASA,
    chave: null,
  });
  e.cronogramas.set(obra.id, {
    inicio: somarMes(hojeSP().slice(0, 7), -3),
    meses: 12,
    etapas: CRONOGRAMA_CASA.map((percentuais, i) => ({ etapa: String(i + 1), percentuais })),
    registro_id: null,
  });

  const admin = e.usuarios[0]!;
  const mestre: Usuario = { id: "mestre-demo", nome: "Joana (mestre)", tenant_id: TENANT, papel: "admin" };
  const bg = baseGastos(e);
  const dia = (n: number) => diasAtras(n).slice(0, 10);
  const historico: [string, number, string][] = [
    [`Aprovou o orçamento de ${obra.nome} (12 etapas, ${fmtReais(total)})`, 98, admin.nome],
    [`Montou o cronograma de ${obra.nome} (12 meses)`, 96, admin.nome],
  ];
  const lancarGasto = (valor: number, dias: number, favorecido: string, descricao: string, etapa: string | null, tipo: string) => {
    const gs = gastos.semearGasto(bg, mestre, admin, obra.id, { valor, data: dia(dias), favorecido, descricao, etapa, tipo });
    const onde = etapa === null ? "sem etapa (ver depois)" : `em ${etapa} ${ORCAMENTO_CASA[Number(etapa) - 1]!.descricao}`;
    historico.push([`Gasto de ${fmtReais(valor)} ${onde}: ${gs.descricao} (${gs.favorecido})`, dias, admin.nome]);
  };
  lancarGasto(780_000, 85, "Madeireira São Bento (fictícia)", "Tapume e barracão de obra", "1", "Nota fiscal");
  lancarGasto(235_000, 82, "Elétrica Bom Jesus (fictícia)", "Ligação provisória de energia", "1", "Comprovante de Pix");
  lancarGasto(490_000, 80, "Terraplenagem Rio Verde (fictícia)", "Limpeza e locação do terreno", "1", "Recibo");
  lancarGasto(390_000, 70, "Terraplenagem Rio Verde (fictícia)", "Escavação das sapatas", "2", "Recibo");
  lancarGasto(987_000, 66, "Aço Forte · distribuidor (fictício)", "Aço CA-50 da fundação", "2", "Nota fiscal");
  lancarGasto(1_840_000, 62, "Concreteira Campinas (fictícia)", "Concreto usinado fck 25 (fundação)", "2", "Nota fiscal");
  lancarGasto(1_250_000, 55, "Edson Ferreira Construções (fictício)", "Mão de obra da fundação (empreitada)", "2", "Comprovante de transferência");
  lancarGasto(2_130_000, 40, "Aço Forte · distribuidor (fictício)", "Aço CA-50 e CA-60 dos pilares e vigas", "3", "Nota fiscal");
  lancarGasto(840_000, 38, "Loca Obra Equipamentos (fictícia)", "Locação de fôrmas e escoras", "3", "Boleto pago");
  lancarGasto(189_000, 30, "Elétrica Bom Jesus (fictícia)", "Padrão de entrada de energia", "6", "Nota fiscal");
  lancarGasto(1_495_000, 20, "Concreteira Campinas (fictícia)", "Concreto usinado fck 30 (1ª laje)", "3", "Nota fiscal");
  lancarGasto(1_500_000, 12, "Edson Ferreira Construções (fictício)", "Mão de obra da estrutura (1ª parcela)", "3", "Comprovante de transferência");
  lancarGasto(38_000, 6, "Loca Obra Equipamentos (fictícia)", "Locação de betoneira", null, "Boleto pago");

  // A fila de conferência: o que o mestre mandou e o Plumo já leu, um com certeza e um com dúvida.
  const fio = gastos.semearComprovante(bg, mestre, obra.id, "fio e disjuntores da elétrica", ["Comprovante de Pix", "Recebedor: Elétrica Bom Jesus (fictícia)", "Valor: R$ 1.245,90", "Documento fictício da demonstração"], diasAtras(1, 10));
  gastos.lerSimulado(bg, fio.id, { duvida: false });
  const diaria = gastos.semearComprovante(bg, mestre, obra.id, "diária do pedreiro", ["Recibo", "Recebi de Casa Vila Nova", "Diárias de pedreiro (5 dias)", "Valor: R$ 1.250,00", "Documento fictício da demonstração"], diasAtras(0, 8));
  gastos.lerSimulado(bg, diaria.id, { duvida: true });

  const DIARIO = [
    "Diário de obra: concretagem das sapatas do eixo A",
    "Diário de obra: chuva forte, serviço parado à tarde",
    "Diário de obra: armação dos pilares do térreo",
    "Diário de obra: desforma da 1ª laje",
    "Diário de obra: equipe de 6 na obra",
  ];
  for (let i = 0; i < 40; i++) historico.push([DIARIO[i % DIARIO.length]!, 90 - i * 2, "Marina Duarte"]);
  for (const [texto, dias, quem] of historico)
    e.registro.push({ id: uuid7(), tenant_id: TENANT, criado_em: diasAtras(dias, 16), quem, quem_nome: quem, obra_id: obra.id, origem: "tela", texto, proposta_id: null, desfazer: null, desfeito: false });
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
  // Estado em memória de antes de tirar os pedidos (hot reload do `next dev`): semeia de novo, não há o que migrar.
  if (!e.fornecedores || "pedidos" in e) return (g.__canteiroDemo = semear());
  return e;
};
export const reiniciarDemo = () => {
  g.__canteiroDemo = semear();
  return g.__canteiroDemo;
};

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
 * por "master" entra como master.
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

/**
 * Conversas de exemplo para a lista do Plumo não abrir vazia na demonstração: algumas de hoje, da semana e do mês
 * passado, cada uma com a pergunta e a resposta. Só na primeira lista de cada pessoa; o que ela conversar depois soma.
 */
function semearConversas(e: EstadoDemo, u: Usuario) {
  // estado criado antes deste campo existir (servidor de dev recarregado a quente)
  e.conversasDemo ??= new Set();
  if (e.conversasDemo.has(u.id)) return;
  e.conversasDemo.add(u.id);
  const obraId = e.obras[0]!.id;
  const dia = 86_400_000;
  const exemplos: [string, number, string][] = [
    ["Hidráulica: o que muda", 0.1, "Quando a planta da hidráulica chegar, refaço o orçamento e o cronograma e te mostro antes de mudar."],
    ["Comprovante do fio", 2, "Li o comprovante da elétrica e deixei para você conferir antes de lançar."],
    ["Quanto já foi na fundação?", 3, "A Fundação já passou do orçado: o gasto confirmado está acima do previsto para ela."],
    ["O que falta gastar?", 4, "Pelo orçamento, ainda faltam as etapas de cobertura em diante. O detalhe está em Orçamento."],
    ["Orçamento da obra", 24, "O orçamento está aprovado: 12 etapas, da preliminar à entrega."],
    ["Cronograma inicial", 26, "Montei o cronograma inicial em 12 meses. Ajuste o que não bater com a obra."],
  ];
  exemplos.forEach(([titulo, diasAtras, resposta], i) => {
    const quando = new Date(Date.now() - diasAtras * dia).toISOString();
    const id = `demo-conversa-${u.id}-${i}`;
    gravarNaSessao(id, u, obraId, titulo, [
      { papel: "user", conteudo: titulo },
      { papel: "assistant", conteudo: [{ type: "text", text: resposta }] },
    ]);
    const x = e.sessoes.get(id)!;
    x.sessao.criado_em = x.sessao.atualizado_em = quando;
  });
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

function obraPorId(e: EstadoDemo, id: string) {
  const o = e.obras.find((x) => x.id === id);
  if (!o) throw new NaoEncontrado("Obra não encontrada.");
  return o;
}

export { NaoEncontrado, Conflito, Proibido };

function exigirAdmin(u: Usuario) {
  if (u.papel === "viewer") throw new Proibido("Seu papel (leitura) não aprova nem opera. Peça a um admin.");
}

/** Aprovar executa o que o agente propôs; hoje ele só propõe o cronograma da obra, que não tem o que ajustar. */
export function aprovar(id: string, u: Usuario, ajustes: Record<string, unknown> | null = null) {
  const e = estado();
  exigirAdmin(u);
  const pr = e.propostas.find((p) => p.id === id);
  if (!pr) throw new NaoEncontrado("Proposta não encontrada.");
  if (pr.status !== "pendente") throw new Conflito("Esta proposta já foi decidida.");
  if (ajustes && Object.keys(ajustes).length) throw new RegraViolada(`Não dá para ajustar: ${Object.keys(ajustes).join(", ")}.`);
  if (pr.tipo !== "cronograma") throw new RegraViolada("Esta proposta não tem como ser aprovada.");
  const o = obraPorId(e, pr.obra_id);
  const { anterior, meses } = gravarCronograma(e, o, pr.dados as Record<string, unknown>);
  const desfazer = { op: "cronograma_restaurar", obra_id: o.id, anterior };
  const texto = `Montou o cronograma de ${o.nome} (${meses} ${meses === 1 ? "mês" : "meses"}) pela proposta da IA`;
  pr.status = "aprovada";
  pr.decidido_por = u.id;
  pr.decidido_por_nome = u.nome;
  pr.decidido_em = agoraISO();
  const registro = registrar(e, u, { obra_id: pr.obra_id, texto, proposta_id: pr.id, desfazer, origem: "agente" });
  pr.registro_id = registro.id;
  const cr = e.cronogramas.get(pr.obra_id);
  if (cr) cr.registro_id = registro.id;
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

export function desfazer(registroId: string, u: Usuario) {
  const e = estado();
  exigirAdmin(u);
  const ent = e.registro.find((r) => r.id === registroId);
  if (!ent) throw new NaoEncontrado("Entrada do registro não encontrada.");
  if (ent.desfeito) throw new Conflito("Isto já foi desfeito.");
  if (!ent.desfazer) throw new RegraViolada("Esta entrada não tem como ser desfeita.");
  const d = ent.desfazer as { op: string };
  let texto: string;
  const deGastos = gastos.desfazerGasto(baseGastos(e), ent.desfazer as Record<string, unknown>);
  if (deGastos !== null) {
    texto = deGastos;
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
  } else throw new RegraViolada("Esta entrada não tem como ser desfeita.");
  ent.desfeito = true;
  const pr = ent.proposta_id ? e.propostas.find((p) => p.id === ent.proposta_id) : undefined;
  if (pr && pr.status === "aprovada") pr.status = "desfeita";
  return registrar(e, u, { obra_id: ent.obra_id, texto, proposta_id: null, desfazer: null, origem: "tela" });
}

/* ---------- página inicial e conta ---------- */

/** GET /obras/resumo: mesmas regras da API (servicos/resumo.py), somadas aqui. */
export function resumoObras(e: EstadoDemo) {
  return [...e.obras]
    .sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR"))
    .map((obra) => ({
      obra,
      pendencias: e.propostas.filter((p) => p.obra_id === obra.id && p.status === "pendente").length,
      ultima_atividade: e.registro.filter((r) => r.obra_id === obra.id).map((r) => r.criado_em).sort().at(-1) ?? null,
      // como a API: o prazo só sai para a obra com cronograma montado, e "tem orçamento" é ter contrato vigente
      prazo: e.cronogramas.get(obra.id)?.meses ? montarCronogramaDemo(e, obra).prazo : null,
      tem_orcamento: e.versoes.some((v) => v.versao.obra_id === obra.id && v.versao.ativa && v.versao.tipo === "contrato"),
    }));
}

function chaveDemo(e: EstadoDemo) {
  return e.chave
    ? { ativa: true, final: e.chave.final, cadastrada_em: e.chave.cadastrada_em, conectada_por: e.chave.por }
    : { ativa: false, final: null, cadastrada_em: null, conectada_por: null };
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

/**
 * As etapas do orçamento vigente, numeradas como `orcamentoDemo` numera (uma por etapa de cada versão ativa, na ordem):
 * é a chave que a árvore de gastos usa. Sem versão ativa, a obra não tem orçamento (a árvore cai na lista padrão).
 */
function etapasDoOrcamento(e: EstadoDemo, obraId: string) {
  const ativas = e.versoes.filter((v) => v.versao.obra_id === obraId && v.versao.ativa);
  if (!ativas.length) return null;
  return ativas.flatMap((v) => v.etapas).map((et, i) => ({ etapa: String(i + 1), descricao: et.descricao || "Estrutura" }));
}

/** O que lib/demo/gastos.ts precisa saber da loja. */
function baseGastos(e: EstadoDemo): gastos.Base {
  return {
    g: e.gastos,
    obra: (id) => obraPorId(e, id),
    etapasDoOrcamento: (obraId) => etapasDoOrcamento(e, obraId),
    registrar: (u, r) => registrar(e, u, { ...r, proposta_id: null, origem: "tela" }),
    hoje: () => hojeSP(),
  };
}

/** POST /srv/agente/leitura na demonstração: a leitura simulada (o roteiro não chama modelo nenhum). */
export function lerComprovanteDemo(id: string) {
  return gastos.lerSimulado(baseGastos(estado()), id);
}

/**
 * O retrato da obra que o roteiro do agente cita: as mesmas respostas das rotas (orçamento,
 * resumo dos gastos, cronograma, a fila de comprovantes), para o agente não fazer conta nenhuma, como o de verdade.
 */
export function retratoDemo(obraId: string) {
  const e = estado();
  const o = obraPorId(e, obraId);
  const bg = baseGastos(e);
  return {
    orcamento: orcamentoDemo(e, o),
    gastos: gastos.resumoGastos(bg, o.id),
    cronograma: montarCronogramaDemo(e, o),
    aConferir: e.gastos.comprovantes.filter((c) => c.obra_id === o.id && c.status === "a_revisar").length,
  };
}

/** GET /comprovantes/{id}/arquivo na demonstração: os bytes, não JSON (por isso fica fora do `responder`). */
export function arquivoComprovanteDemo(id: string) {
  return gastos.arquivoDoComprovante(baseGastos(estado()), id);
}

/**
 * POST e PATCH /fornecedores: o cadastro da empresa, com as regras da API (nome obrigatório; CNPJ só dígitos, válido e
 * sem repetir). Sem Desfazer na demonstração: o registro fica, mas o aviso não oferece o que falharia.
 */
function gravarFornecedor(e: EstadoDemo, u: Usuario, id: string | null, c: Record<string, unknown>) {
  exigirAdmin(u);
  const atual = id ? e.fornecedores.find((f) => f.id === id) : null;
  if (id && !atual) throw new NaoEncontrado("Fornecedor não encontrado.");
  const texto = (k: keyof Fornecedor, max: number) => (typeof c[k] === "string" ? String(c[k]).replace(/\s+/g, " ").trim().slice(0, max) : undefined);
  const nome = texto("nome", 120) ?? atual?.nome ?? "";
  if (!nome) throw new RegraViolada("Diga o nome do fornecedor.");
  const cnpj = typeof c.cnpj === "string" ? digitosCnpj(c.cnpj) : (atual?.cnpj ?? "");
  if (cnpj && !cnpjValido(cnpj)) throw new RegraViolada("CNPJ inválido.");
  if (cnpj && e.fornecedores.some((f) => f.cnpj === cnpj && f.id !== id)) throw new Conflito("Já há um fornecedor com este CNPJ.");
  const f: Fornecedor = {
    id: atual?.id ?? uuid7(),
    nome,
    cnpj,
    contato: texto("contato", 120) ?? atual?.contato ?? "",
    telefone: texto("telefone", 40) ?? atual?.telefone ?? "",
    email: texto("email", 120) ?? atual?.email ?? "",
  };
  if (atual) Object.assign(atual, f);
  else e.fornecedores.push(f);
  registrar(e, u, { obra_id: null, texto: `${atual ? "Editou" : "Cadastrou"} o fornecedor ${f.nome}`, proposta_id: null, desfazer: null, origem: "tela" });
  return { ...f, registro_id: null };
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
        exigirAdmin(u);
        const chave = String(c.chave ?? "").trim();
        if (!/^sk-ant-/.test(chave) || chave.length < 20 || chave.length > 300)
          return erro(422, "Isto não parece uma chave da API da Anthropic (começa com sk-ant-).");
        e.chave = { final: chave.slice(-4), cadastrada_em: agoraISO(), por: u.nome };
        return ok({ chave_propria: true, final: e.chave.final });
      }
      if (metodo === "DELETE") {
        exigirAdmin(u);
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
      const bg = baseGastos(e);
      if (metodo === "GET" && b === "arvore" && !id2) return ok(gastos.arvore(bg, id));
      if (metodo === "POST" && b === "etapas-extras" && !id2) return ok(gastos.criarEtapaExtra(bg, u, id, c), 201);
      if (metodo === "POST" && b === "topicos" && !id2) return ok(gastos.criarTopico(bg, u, id, c), 201);
      if (metodo === "POST" && b === "comprovantes" && !id2) return gastos.enviarComprovante(bg, u, id, c);
      if (metodo === "GET" && b === "comprovantes" && !id2) return ok(gastos.listarComprovantes(bg, id, params));
      if (metodo === "GET" && b === "gastos" && id2 === "resumo") return ok(gastos.resumoGastos(bg, id));
      if (metodo === "GET" && b === "gastos" && !id2) return ok(gastos.listarGastos(bg, id, params));
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
      // Com cronograma, o desembolso segue o previsto dele a partir de hoje, descontado o que os gastos já pagaram; a demo
      // não mede. Sem cronograma, vem vazio em vez de 404.
      if (metodo === "GET" && b === "desembolso" && !id2) {
        const ob = obraPorId(e, id);
        const orc = orcamentoDemo(e, ob);
        const realizado = orc.totais.realizado;
        const c = montarCronogramaDemo(e, ob);
        const mesAtual = new Date().toISOString().slice(0, 7);
        // o gasto confirmado sai do caixa no mês do pagamento
        const pagoNoMes = gastos.pagoPorMes(baseGastos(e), ob.id);
        const pago = [...pagoNoMes.values()].reduce((t, v) => t + v, 0);
        const realizadoDe = (etapa: string) => orc.etapas.find((x) => x.etapa === etapa)?.realizado ?? 0;
        if (c.inicio && c.meses > 0) {
          const meses = c.mensal.map((m) => {
            const p = m.mes >= mesAtual ? m.previsto : 0;
            return { mes: m.mes, pago: pagoNoMes.get(m.mes) ?? 0, previsto: m.previsto, projetado: p, projetado_no_ritmo: p };
          });
          // o que o cronograma previa para antes de hoje e não saiu (previsto − pago) entra no mês corrente
          const atrasado = Math.max(0, c.mensal.filter((m) => m.mes < mesAtual).reduce((t, m) => t + m.previsto - (pagoNoMes.get(m.mes) ?? 0), 0));
          const falta = Math.max(0, orc.totais.atual - realizado);
          return ok({
            mes_atual: mesAtual,
            base: "gastos",
            mes_referencia: null,
            atraso_meses: 0,
            ritmo_pct: 10000,
            termino_projetado: c.prazo.termino_contratual,
            termino_no_ritmo: c.prazo.termino_contratual,
            // o que o cronograma previa para antes de hoje e não saiu entra no mês corrente
            meses: meses.map((m) => (m.mes === mesAtual ? { ...m, projetado: m.projetado + atrasado, projetado_no_ritmo: m.projetado_no_ritmo + atrasado } : m)),
            etapas: c.etapas.map((x) => ({ etapa: x.etapa, descricao: x.descricao, atual: x.atual, realizado: realizadoDe(x.etapa), executado_pct: 0, falta: Math.max(0, x.atual - realizadoDe(x.etapa)), devido_agora: 0, sem_cronograma: !x.percentuais.some((q) => q > 0) })),
            totais: { orcado: orc.totais.atual, realizado, pago, falta, custo_final: realizado + falta, desvio: realizado + falta - orc.totais.atual, sem_mes: 0 },
          });
        }
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
          totais: { orcado: orc.totais.atual, realizado, pago, falta: 0, custo_final: realizado, desvio: 0, sem_mes: 0 },
        });
      }
      if (metodo === "GET" && b === "resumo" && !id2) {
        const obra = obraPorId(e, id);
        const orc = orcamentoDemo(e, obra);
        const t = orc.totais;
        // Mesma regra da API (servicos/resumo.py): só o contrato vigente faz a obra "ter orçamento".
        const tem = orc.versoes.some((v) => v.ativa && v.tipo === "contrato");
        const pendentes = e.propostas.filter((p) => p.obra_id === obra.id && p.status === "pendente");
        const rg = gastos.resumoGastos(baseGastos(e), obra.id);
        return ok({
          obra,
          hoje: new Date().toISOString().slice(0, 10),
          // o cronograma gravado na demonstração (Gerar com IA ou à mão); sem medição, o projetado fica nulo como na API
          cronograma: cronogramaDoResumo(montarCronogramaDemo(e, obra)),
          financeiro: {
            tem_orcamento: tem,
            contratado: t.contratado,
            aditivos: t.aditivos,
            aditivos_pct: t.aditivos_pct,
            orcado_atual: t.atual,
            cotando: t.cotando,
            comprometido: t.comprometido,
            realizado: t.realizado,
            // o que saiu do caixa é o gasto confirmado: o mesmo número do realizado
            pago: rg.total,
            saldo: t.saldo,
            falta_gastar: Math.max(0, t.atual - t.realizado),
            realizado_pct: t.atual ? Math.round((t.realizado * 10000) / t.atual) : null,
            etapas_estouradas: orc.etapas.filter((x) => x.estourou).map((x) => ({ etapa: x.etapa, descricao: x.descricao, saldo: x.saldo })),
            gastos: {
              total: rg.total,
              nas_etapas: rg.total - (rg.a_definir ?? 0) - (rg.fora_do_orcamento as number) - (rg.sem_etapa_do_orcamento as number),
              fora_do_orcamento: rg.fora_do_orcamento,
              na_lista_padrao: tem ? 0 : rg.total - (rg.a_definir ?? 0),
              sem_etapa_do_orcamento: rg.sem_etapa_do_orcamento,
            },
          },
          pendencias: { propostas: pendentes.length, titulos: pendentes.slice(0, 5).map((p) => p.titulo) },
        });
      }
      if (metodo === "GET" && b === "orcamento" && !id2) return ok(orcamentoDemo(e, obraPorId(e, id)));
      if (metodo === "POST" && b === "orcamento") {
        exigirAdmin(u);
        if (id2 === "versoes") return erro(422, "Na demonstração a importação do orçamento por etapas não está disponível.");
        if (id2 === "estrutura") return ok(lancarEstrutura(e, u, obraPorId(e, id), c as Record<string, unknown>));
        if (id2 === "etapas" && c2 === "ordem") return ok(ordenarEtapas(e, u, obraPorId(e, id), c as Record<string, unknown>));
        const arq = c.arquivo as { nome: string; texto: string } | undefined;
        if (id2 === "ler" && !arq) return erro(422, "Envie o arquivo da planilha.");
        if (id2 === "ler") return ok(lerPlanilhaDemo(arq!.texto, arq!.nome));
        if (id2 === "aprovar") {
          const o = obraPorId(e, id);
          if (o.status !== "em_orcamento") return erro(409, "O orçamento já foi aprovado.");
          const vs = e.versoes.filter((x) => x.versao.obra_id === id && x.versao.ativa);
          if (!vs.length) return erro(422, "Lance o projeto (ou importe o orçamento) antes de aprovar.");
          const totalVs = vs.reduce((t, v) => t + v.versao.total, 0);
          o.status = "em_andamento";
          const reg = registrar(e, u, { obra_id: id, texto: `Aprovou o orçamento de ${o.nome} (${fmtReais(totalVs)})`, proposta_id: null, desfazer: { op: "reabrir_orcamento", obra_id: id }, origem: "tela" });
          return ok({ ...o, registro_id: reg.id });
        }
      }
      if (metodo === "PATCH" && b === "orcamento" && id2 === "itens" && c2) {
        exigirAdmin(u);
        return editarItemDemo(e, u, obraPorId(e, id), c2, c);
      }
      if (metodo === "GET" && b === "hoje" && !id2) return ok(hojeDemo(e, obraPorId(e, id)));
    }
    if (a === "etapas-extras" && id && metodo === "PATCH" && !b) return ok(gastos.editarEtapaExtra(baseGastos(e), u, id, c));
    if (a === "topicos" && id && metodo === "PATCH" && !b) return ok(gastos.editarTopico(baseGastos(e), u, id, c));
    if (a === "comprovantes" && id && metodo === "GET" && !b) return ok(gastos.detalheDoComprovante(baseGastos(e), id));
    if (a === "comprovantes" && id && metodo === "POST" && b === "confirmar") return gastos.confirmar(baseGastos(e), u, id, c);
    if (a === "comprovantes" && id && metodo === "POST" && b === "descartar") return ok(gastos.descartar(baseGastos(e), u, id, c));
    if (a === "gastos" && id && metodo === "PATCH" && !b) return ok(gastos.mudarEtapa(baseGastos(e), u, id, c));
    if (a === "fornecedores") {
      if (metodo === "GET" && !id) return ok([...e.fornecedores].sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR")));
      if (metodo === "POST" && !id) return ok(gravarFornecedor(e, u, null, c), 201);
      if (metodo === "PATCH" && id && !b) return ok(gravarFornecedor(e, u, id, c));
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
      semearConversas(e, u);
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
    if (x instanceof ArquivoGrande) return erro(413, x.message);
    if (x instanceof RegraViolada || x instanceof PlanilhaInvalida) return erro(422, x.message);
    throw x;
  }
}
