/**
 * Gastos da obra na demonstração: a árvore (etapas do orçamento ou a lista padrão, mais as extras e os tópicos), os
 * comprovantes, a revisão da leitura e o gasto confirmado. Espelha a seção "Gastos da obra" do contrato da
 * canteiro-api (e `canteiro_dominio.{etapas,leitura,gastos}`) só para a demo: com a API de verdade, quem decide é ela.
 *
 * Fica fora de loja.ts porque é um assunto inteiro; loja.ts entrega o que só ela sabe (a obra, as etapas do orçamento
 * vigente, o registro) pela `Base`, e chama daqui nas rotas, no orçamento, no resumo e no Desfazer.
 */
import "server-only";
import { createHash } from "node:crypto";
import type {
  Comprovante,
  ComprovanteDetalhe,
  CampoRevisao,
  EntradaRegistro,
  EstadoCampo,
  EtapaExtra,
  EtapaNaArvore,
  GastoObra,
  Obra,
  OpcaoClassificacao,
  OpcaoRevisao,
  ResumoGastos,
  Revisao,
  Topico,
  Usuario,
} from "../contrato";
import { fmtReais } from "../formato";
import { uuid7 } from "../ids";
import { ArquivoGrande, Conflito, NaoEncontrado, Proibido, RegraViolada } from "./erros";

/* ---------- estado ---------- */

export interface ComprovanteDemo extends Comprovante {
  /** `<obra_id>/<id>.<ext>`, como a API (o tenant vem à parte). */
  arquivo: string;
  sha256: string;
  usuario_id: string;
  modelo_leitura: string | null;
  atualizado_em: string;
}

export interface GastoDemo extends GastoObra {
  usuario_id: string;
}

export interface EstadoGastos {
  comprovantes: ComprovanteDemo[];
  /** O arquivo de cada comprovante, pelo id: fica guardado mesmo descartado ou estornado (é a prova do pagamento). */
  arquivos: Map<string, Uint8Array>;
  gastos: GastoDemo[];
  extras: EtapaExtra[];
  topicos: Topico[];
}

export const gastosVazios = (): EstadoGastos => ({ comprovantes: [], arquivos: new Map(), gastos: [], extras: [], topicos: [] });

/** O que loja.ts entrega: a obra, as etapas do orçamento vigente e o registro (com o Desfazer). */
export interface Base {
  g: EstadoGastos;
  obra: (id: string) => Obra;
  /** As etapas do orçamento vigente (chave = código); null quando a obra não tem orçamento. */
  etapasDoOrcamento: (obraId: string) => { etapa: string; descricao: string }[] | null;
  registrar: (u: Usuario, r: { obra_id: string; texto: string; desfazer: Record<string, unknown> | null }) => EntradaRegistro;
  /** AAAA-MM-DD no fuso de São Paulo. */
  hoje: () => string;
}

/* ---------- a árvore ---------- */

/** A lista padrão de `canteiro_dominio.etapas.ETAPAS_FIXAS`: chave, nome e o que entra nela. */
const ETAPAS_FIXAS: [string, string, string][] = [
  ["terreno", "Terreno e documentação", "compra do terreno, ITBI, escritura, cartório, registro de incorporação, IPTU"],
  ["projetos", "Projetos e aprovações", "projetos, despachante, alvará, aprovação do bombeiro, taxas de ligação de água e luz"],
  ["preliminares", "Serviços preliminares", "demolição, limpeza do terreno, locação da obra, tapume, barracão, ligações provisórias"],
  ["fundacao", "Fundação", "estacas, tubulão, sapatas, blocos e vigas baldrame"],
  ["estrutura", "Estrutura e lajes", "armação, concreto usinado, formas, escoramento, pilares, vigas, lajes pré-moldadas"],
  ["alvenaria", "Alvenaria e vedações", "tijolo, bloco, paredes, painéis, vergas"],
  ["hidrossanitaria", "Instalações hidrossanitárias", "água fria e quente, esgoto, louças e metais"],
  ["eletrica", "Instalações elétricas", "eletrodutos, fiação, quadros, tomadas, iluminação"],
  ["especiais", "Instalações especiais", "gás, ar-condicionado, incêndio, interfone, CFTV"],
  ["impermeabilizacao", "Impermeabilização", "manta asfáltica, argamassa impermeabilizante"],
  ["cobertura", "Cobertura", "engradamento, telhas, rufos, calhas"],
  ["esquadrias", "Esquadrias", "portas, janelas, guarda-corpo, porta corta-fogo, vidros"],
  ["revestimento_interno", "Revestimentos internos", "chapisco, reboco, azulejo, forro de gesso"],
  ["fachada", "Fachada", "massa externa, revestimento e pintura externa, tela fachadeira"],
  ["pisos", "Pisos", "contrapiso, porcelanato, cerâmica, rodapé"],
  ["bancadas", "Bancadas, soleiras e peitoris", "granito, mármore, bancadas, soleiras, peitoris"],
  ["pintura", "Pintura", "tinta, massa, lixa e mão de obra de pintura interna"],
  ["elevadores", "Elevadores", "compra, instalação e acabamento de elevador"],
  ["equipamentos", "Equipamentos e ferramentas", "aluguel e compra de equipamentos e ferramentas, controle tecnológico"],
  ["administracao", "Administração da obra", "água, luz e internet do canteiro, mestre de obras, segurança do trabalho, EPI, contador"],
  ["pessoal", "Pessoal e encargos", "guias de FGTS e INSS, rescisão, férias, vale-transporte, alimentação, exames, seguro de vida"],
  ["limpeza", "Limpeza e entrega", "limpeza da obra, desmobilização, jardim, placas, letreiro"],
  ["vendas", "Vendas e comercial", "comissão de corretor, propaganda, imposto RET"],
  ["outros", "Outros", "o que não couber em nenhuma outra etapa"],
];
const NOME_FIXO = new Map(ETAPAS_FIXAS.map(([k, n]) => [k, n]));
const MAX_EXTRAS = 20;
const MAX_TOPICOS = 30;
const MAX_NOME = 60;
const SEM_ETAPA = "Sem etapa";

/** Uma etapa da árvore, sempre com a origem (o contrato a manda em cada etapa). */
type NoArvore = EtapaNaArvore & { origem: NonNullable<EtapaNaArvore["origem"]> };

/** Como o domínio compara nomes: sem caixa, sem acento, sem espaço sobrando. */
const chaveNome = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const limpo = (t: unknown) => (typeof t === "string" ? t.replace(/\s+/g, " ").trim() : "");

export function arvore(b: Base, obraId: string): NoArvore[] {
  const topicosDe = (chave: string) =>
    b.g.topicos.filter((t) => t.obra_id === obraId && t.etapa === chave && !t.arquivado).map((t) => ({ id: t.id, nome: t.nome, origem: "manual" as const }));
  const extras: NoArvore[] = b.g.extras
    .filter((x) => x.obra_id === obraId && !x.arquivado)
    .map((x) => ({ chave: x.chave, nome: x.nome, inclui: "", fixa: false, origem: "extra", topicos: topicosDe(x.chave) }));
  const orc = b.etapasDoOrcamento(obraId);
  if (orc) {
    const doOrcamento: NoArvore[] = orc.map((et) => ({
      chave: et.etapa,
      nome: et.descricao ? `${et.etapa} ${et.descricao}` : et.etapa,
      inclui: "",
      fixa: true,
      origem: "orcamento",
      topicos: topicosDe(et.etapa),
    }));
    return [...doOrcamento, ...extras];
  }
  const fixas: NoArvore[] = ETAPAS_FIXAS.map(([chave, nome, inclui]) => ({ chave, nome, inclui, fixa: true, origem: "padrao", topicos: topicosDe(chave) }));
  return [...fixas.slice(0, -1), ...extras, fixas.at(-1)!];
}

/** O nome de uma chave hoje: da árvore; senão a etapa extra arquivada, a lista padrão ou a própria chave. */
function nomeDaEtapa(b: Base, obraId: string, chave: string, nos = arvore(b, obraId)): string {
  return (
    nos.find((n) => n.chave === chave)?.nome ??
    b.g.extras.find((x) => x.obra_id === obraId && x.chave === chave)?.nome ??
    NOME_FIXO.get(chave) ??
    chave
  );
}

function origemDaEtapa(b: Base, obraId: string, etapa: string | null, nos = arvore(b, obraId)) {
  if (etapa === null) return "a_definir";
  const no = nos.find((n) => n.chave === etapa);
  if (no) return no.origem;
  return b.etapasDoOrcamento(obraId) && !etapa.startsWith("x-") ? "sem_etapa_do_orcamento" : "extra";
}

function nomeValido(nome: unknown): string {
  const n = limpo(nome);
  if (!n) throw new RegraViolada("Dê um nome.");
  if (n.length > MAX_NOME) throw new RegraViolada(`O nome vai até ${MAX_NOME} letras.`);
  return n;
}

/** Nome de etapa extra não repete o de outra etapa da obra (com orçamento, a descrição com ou sem o código). */
function exigirNomeDeEtapaLivre(b: Base, obraId: string, nome: string, menosId?: string) {
  const k = chaveNome(nome);
  const orc = b.etapasDoOrcamento(obraId);
  const ocupados = [
    ...(orc ? orc.flatMap((e) => [e.descricao, `${e.etapa} ${e.descricao}`]) : ETAPAS_FIXAS.map(([, n]) => n)),
    ...b.g.extras.filter((x) => x.obra_id === obraId && !x.arquivado && x.id !== menosId).map((x) => x.nome),
  ];
  const igual = ocupados.find((o) => chaveNome(o) === k);
  if (igual) throw new RegraViolada(`Já existe: ${igual}.`);
}

function exigirNomeDeTopicoLivre(b: Base, obraId: string, etapa: string, nome: string, menosId?: string) {
  const k = chaveNome(nome);
  const igual = b.g.topicos.find((t) => t.obra_id === obraId && t.etapa === etapa && !t.arquivado && t.id !== menosId && chaveNome(t.nome) === k);
  if (igual) throw new RegraViolada(`Já existe: ${igual.nome}.`);
}

function exigirAdmin(u: Usuario) {
  if (u.papel === "viewer") throw new Proibido("Seu papel (leitura) não aprova nem opera. Peça a um admin.");
}

export function criarEtapaExtra(b: Base, u: Usuario, obraId: string, c: Record<string, unknown>) {
  exigirAdmin(u);
  b.obra(obraId);
  const nome = nomeValido(c.nome);
  if (b.g.extras.filter((x) => x.obra_id === obraId && !x.arquivado).length >= MAX_EXTRAS) throw new RegraViolada(`Até ${MAX_EXTRAS} etapas extras por obra.`);
  exigirNomeDeEtapaLivre(b, obraId, nome);
  const id = uuid7();
  const x: EtapaExtra = { id, chave: `x-${id}`, obra_id: obraId, nome, arquivado: false };
  b.g.extras.push(x);
  const reg = b.registrar(u, { obra_id: obraId, texto: `Criou a etapa extra «${nome}»`, desfazer: { op: "arquivar_extra", id } });
  return { ...x, registro_id: reg.id };
}

export function criarTopico(b: Base, u: Usuario, obraId: string, c: Record<string, unknown>) {
  exigirAdmin(u);
  b.obra(obraId);
  const etapa = limpo(c.etapa);
  const no = arvore(b, obraId).find((n) => n.chave === etapa);
  if (!no) throw new RegraViolada("Esta etapa não está na árvore da obra.");
  const nome = nomeValido(c.nome);
  if (no.topicos.length >= MAX_TOPICOS) throw new RegraViolada(`Até ${MAX_TOPICOS} tópicos por etapa.`);
  exigirNomeDeTopicoLivre(b, obraId, etapa, nome);
  const t: Topico = { id: uuid7(), obra_id: obraId, etapa, nome, arquivado: false };
  b.g.topicos.push(t);
  const reg = b.registrar(u, { obra_id: obraId, texto: `Criou o tópico «${nome}» em ${no.nome}`, desfazer: { op: "arquivar_topico", id: t.id } });
  return { ...t, registro_id: reg.id };
}

/** PATCH de etapa extra ou de tópico: `{nome?, arquivado?}`, com Desfazer que volta ao de antes. */
function editarNo<T extends { id: string; obra_id: string; nome: string; arquivado: boolean }>(
  b: Base,
  u: Usuario,
  x: T,
  c: Record<string, unknown>,
  tipo: "extra" | "topico",
  livre: (nome: string) => void,
) {
  exigirAdmin(u);
  const antes = { nome: x.nome, arquivado: x.arquivado };
  const nome = "nome" in c ? nomeValido(c.nome) : x.nome;
  const arquivado = typeof c.arquivado === "boolean" ? c.arquivado : x.arquivado;
  if (nome === x.nome && arquivado === x.arquivado) throw new RegraViolada("Nada mudou.");
  if (!arquivado) livre(nome);
  x.nome = nome;
  x.arquivado = arquivado;
  const oQue = tipo === "extra" ? "a etapa extra" : "o tópico";
  const texto = arquivado && !antes.arquivado ? `Arquivou ${oQue} «${nome}»` : !arquivado && antes.arquivado ? `Reativou ${oQue} «${nome}»` : `Renomeou ${oQue} «${antes.nome}» para «${nome}»`;
  const reg = b.registrar(u, { obra_id: x.obra_id, texto, desfazer: { op: tipo === "extra" ? "restaurar_extra" : "restaurar_topico", id: x.id, antes, depois: { nome, arquivado } } });
  return { ...x, registro_id: reg.id };
}

export function editarEtapaExtra(b: Base, u: Usuario, id: string, c: Record<string, unknown>) {
  const x = b.g.extras.find((e) => e.id === id);
  if (!x) throw new NaoEncontrado("Etapa extra não encontrada.");
  return editarNo(b, u, x, c, "extra", (nome) => exigirNomeDeEtapaLivre(b, x.obra_id, nome, x.id));
}

export function editarTopico(b: Base, u: Usuario, id: string, c: Record<string, unknown>) {
  const t = b.g.topicos.find((e) => e.id === id);
  if (!t) throw new NaoEncontrado("Tópico não encontrado.");
  return editarNo(b, u, t, c, "topico", (nome) => exigirNomeDeTopicoLivre(b, t.obra_id, t.etapa, nome, t.id));
}

/* ---------- comprovantes ---------- */

const MAX_IMAGEM = 3_500_000;
const MAX_PDF = 4 * 1024 * 1024;
const MAX_LEGENDA = 300;

/** O tipo pelos bytes, como a API: o Content-Type que o navegador declara é chute pela extensão. */
function tipoDosBytes(x: Uint8Array): { tipo: string; ext: string } | null {
  const inicia = (...b: number[]) => b.every((v, i) => x[i] === v);
  if (inicia(0xff, 0xd8, 0xff)) return { tipo: "image/jpeg", ext: "jpg" };
  if (inicia(0x89, 0x50, 0x4e, 0x47)) return { tipo: "image/png", ext: "png" };
  if (inicia(0x52, 0x49, 0x46, 0x46) && x[8] === 0x57 && x[9] === 0x45 && x[10] === 0x42 && x[11] === 0x50) return { tipo: "image/webp", ext: "webp" };
  if (inicia(0x25, 0x50, 0x44, 0x46, 0x2d)) return { tipo: "application/pdf", ext: "pdf" };
  return null;
}

const publico = ({ sha256: _s, usuario_id: _u, modelo_leitura: _m, atualizado_em: _a, ...c }: ComprovanteDemo): Comprovante & { sha256: string } => ({ ...c, sha256: _s });

export function enviarComprovante(b: Base, u: Usuario, obraId: string, c: Record<string, unknown>): { status: number; corpo: unknown } {
  b.obra(obraId);
  const arq = c.arquivo as { nome: string; bytes: Uint8Array } | undefined;
  if (!arq?.bytes) throw new RegraViolada("Envie o arquivo do comprovante.");
  const t = tipoDosBytes(arq.bytes);
  if (!t) throw new RegraViolada("Formato não aceito: envie uma foto (JPG, PNG ou WEBP) ou um PDF.");
  if (t.tipo === "application/pdf" ? arq.bytes.length > MAX_PDF : arq.bytes.length > MAX_IMAGEM)
    throw new ArquivoGrande(t.tipo === "application/pdf" ? "O PDF passa de 4 MB. Mande um arquivo menor." : "A foto passa de 3,5 MB. Mande uma menor.");
  const legenda = limpo(c.legenda);
  if (legenda.length > MAX_LEGENDA) throw new RegraViolada(`A legenda vai até ${MAX_LEGENDA} letras.`);
  const sha256 = createHash("sha256").update(arq.bytes).digest("hex");
  // o mesmo arquivo de novo nesta obra devolve o comprovante que já existe: o ID sai do sha256
  const id = createHash("sha256").update(`${obraId}:${sha256}`).digest("hex").slice(0, 32);
  const ja = b.g.comprovantes.find((x) => x.id === id);
  if (ja) return { status: 200, corpo: { ...publico(ja), ja_existia: true } };
  const agora = new Date().toISOString();
  const novo: ComprovanteDemo = {
    id,
    obra_id: obraId,
    arquivo: `${obraId}/${id}.${t.ext}`,
    tipo_conteudo: t.tipo,
    tamanho: arq.bytes.length,
    sha256,
    legenda,
    quem: u.nome,
    usuario_id: u.id,
    status: "a_revisar",
    leitura: null,
    erro_leitura: null,
    lido_em: null,
    modelo_leitura: null,
    gasto_id: null,
    motivo_descarte: "",
    criado_em: agora,
    atualizado_em: agora,
  };
  b.g.comprovantes.push(novo);
  b.g.arquivos.set(id, arq.bytes);
  return { status: 201, corpo: { ...publico(novo), ja_existia: false } };
}

function comprovantePorId(b: Base, id: string) {
  const c = b.g.comprovantes.find((x) => x.id === id);
  if (!c) throw new NaoEncontrado("Comprovante não encontrado.");
  return c;
}

export function listarComprovantes(b: Base, obraId: string, params: URLSearchParams) {
  b.obra(obraId);
  const status = params.get("status");
  const antes = params.get("antes_de");
  const limite = Math.min(500, Number(params.get("limite") ?? 100) || 100);
  return b.g.comprovantes
    .filter((c) => c.obra_id === obraId && (!status || c.status === status) && (!antes || c.criado_em < antes))
    .sort((x, y) => y.criado_em.localeCompare(x.criado_em))
    .slice(0, limite)
    .map(publico);
}

export function arquivoDoComprovante(b: Base, id: string): { bytes: Uint8Array; tipo: string } {
  const c = comprovantePorId(b, id);
  const bytes = b.g.arquivos.get(id);
  if (!bytes) throw new NaoEncontrado("Arquivo não encontrado.");
  return { bytes, tipo: c.tipo_conteudo };
}

/* ---------- a leitura (o esquema do modelo) e a revisão ---------- */

type Certeza = "alta" | "baixa";
interface CampoLido {
  certeza: Certeza;
  opcoes: { valor: string; motivo: string }[];
}
export interface LeituraComprovante {
  tipo_documento: "nota_fiscal" | "comprovante_pix" | "comprovante_transferencia" | "boleto" | "recibo" | "anotacao_a_mao" | "outro";
  situacao_pagamento: "pago" | "a_pagar" | "incerto";
  valor: CampoLido;
  data_pagamento: CampoLido;
  favorecido: CampoLido;
  cnpj_favorecido: string | null;
  descricao: CampoLido;
  classificacao: { certeza: Certeza; opcoes: { etapa: string; topico_id: string | null; motivo: string }[] };
  observacoes: string | null;
}

const MAX_OPCOES = 3;
const VAZIO: CampoRevisao = { estado: "vazio", opcoes: [], escolhido: null };

/** "1.234,56" → centavos, como `leitura.centavos_lidos`: no comprovante o ponto com três casas é milhar. */
function centavosLidos(texto: string): number | null {
  let t = texto.replace("R$", "").replace(/\s/g, "").trim();
  const partes = t.split(".");
  if (!t.includes(",") && partes.length > 1 && partes.slice(1).every((p) => p.length === 3) && /^\d+$/.test(partes[0]!)) t = t.replaceAll(".", "");
  if (t.includes(",")) t = t.replaceAll(".", "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const c = Math.round(Number(t) * 100);
  return c > 0 ? c : null;
}

const dataLida = (t: string) => (/^\d{4}-\d{2}-\d{2}$/.test(t.trim()) && !Number.isNaN(Date.parse(t.trim())) ? t.trim() : null);
const fmtDataBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

function estadoDe(certeza: Certeza, lidas: number, validas: number): { estado: EstadoCampo; escolhido: number | null } {
  if (!validas) return { estado: "vazio", escolhido: null };
  if (certeza === "alta" && lidas === 1 && validas === 1) return { estado: "lido", escolhido: 0 };
  return { estado: "conferir", escolhido: null };
}

function campo(c: CampoLido, converter: (v: string) => [number | string, string] | null): CampoRevisao {
  const opcoes: OpcaoRevisao[] = [];
  for (const o of c.opcoes) {
    const x = converter(o.valor);
    if (!x || opcoes.some((y) => y.valor === x[0])) continue;
    opcoes.push({ valor: x[0], rotulo: x[1], motivo: o.motivo.trim(), fornecedor_id: null });
  }
  const validas = opcoes.slice(0, MAX_OPCOES);
  return { ...estadoDe(c.certeza, c.opcoes.length, validas.length), opcoes: validas };
}

const texto = (limite: number) => (v: string) => {
  const t = v.replace(/\s+/g, " ").trim().slice(0, limite);
  return t ? ([t, t] as [string, string]) : null;
};

/** `leitura.montar_revisao`: o formulário a partir da leitura, recalculado a cada abertura (a árvore muda). */
function montarRevisao(l: LeituraComprovante | null, nos: NoArvore[], hoje: string): Revisao {
  if (!l) return { valor: VAZIO, data_pagamento: VAZIO, favorecido: VAZIO, descricao: VAZIO, classificacao: { estado: "vazio", opcoes: [], escolhido: null }, tipo_documento: null, situacao_pagamento: null, avisos: [], observacoes: null };
  let data = campo(l.data_pagamento, (v) => {
    const d = dataLida(v);
    return d ? [d, fmtDataBr(d)] : null;
  });
  const avisos: string[] = [];
  const datas = data.opcoes.map((o) => String(o.valor));
  const umAnoAntes = new Date(`${hoje}T12:00:00`);
  umAnoAntes.setDate(umAnoAntes.getDate() - 365);
  if (datas.some((d) => d > hoje)) avisos.push("A data lida é depois de hoje: confira.");
  if (datas.some((d) => d < umAnoAntes.toISOString().slice(0, 10))) avisos.push("A data lida tem mais de um ano: confira.");
  if (avisos.length && data.estado === "lido") data = { ...data, estado: "conferir", escolhido: null };
  if (l.situacao_pagamento === "a_pagar")
    avisos.unshift("Este documento não comprova pagamento (nota a prazo ou boleto em aberto). Gasto é o dinheiro que já saiu: lance quando pagar, pelo comprovante do pagamento.");
  else if (l.situacao_pagamento === "incerto") avisos.unshift("Não dá para saber pelo documento se já foi pago: confira antes de confirmar.");
  const opcoes: OpcaoClassificacao[] = [];
  for (const o of l.classificacao.opcoes) {
    const no = nos.find((n) => n.chave === o.etapa);
    if (!no) continue;
    const t = no.topicos.find((x) => x.id === o.topico_id);
    if (opcoes.some((x) => x.etapa === no.chave && x.topico_id === (t?.id ?? null))) continue;
    opcoes.push({ etapa: no.chave, topico_id: t?.id ?? null, rotulo: t ? `${no.nome} › ${t.nome}` : no.nome, motivo: o.motivo.trim() });
  }
  const classif = opcoes.slice(0, MAX_OPCOES);
  return {
    valor: campo(l.valor, (v) => {
      const c = centavosLidos(v);
      return c === null ? null : [c, fmtReais(c)];
    }),
    data_pagamento: data,
    favorecido: campo(l.favorecido, texto(120)),
    descricao: campo(l.descricao, texto(200)),
    classificacao: { ...estadoDe(l.classificacao.certeza, l.classificacao.opcoes.length, classif.length), opcoes: classif },
    tipo_documento: l.tipo_documento,
    situacao_pagamento: l.situacao_pagamento,
    avisos,
    observacoes: l.observacoes?.replace(/\s+/g, " ").trim().slice(0, 500) || null,
  };
}

export function detalheDoComprovante(b: Base, id: string): ComprovanteDetalhe {
  const c = comprovantePorId(b, id);
  const revisao = montarRevisao(c.leitura as LeituraComprovante | null, arvore(b, c.obra_id), b.hoje());
  if (c.erro_leitura) revisao.avisos.push(c.erro_leitura);
  return { ...publico(c), revisao };
}

/* ---------- a leitura simulada ---------- */

/**
 * Comprovantes fictícios que a leitura simulada "encontra" no arquivo. Ela não olha a imagem: escolhe pelo que a
 * legenda ("do que é?") diz e, sem pista, por um rodízio estável pelo sha256 (o mesmo arquivo lê igual).
 * `etapas` são pedaços do nome das etapas onde o gasto costuma entrar, na ordem de preferência.
 */
const MODELOS: { palavras: RegExp; tipo: LeituraComprovante["tipo_documento"]; valor: string; favorecido: string; descricao: string; etapas: string[] }[] = [
  { palavras: /cimento|areia|brita|concreto|a[çc]o|ferro|vergalh|arma[çc]/, tipo: "nota_fiscal", valor: "1.560,00", favorecido: "Depósito Ouro Verde", descricao: "Cimento CP-II 50 kg (40 sc)", etapas: ["estrutura", "fundac", "superestrutura"] },
  { palavras: /fio|cabo|disjuntor|tomada|eletric|quadro|lampada|lâmpada/, tipo: "comprovante_pix", valor: "1.245,90", favorecido: "Elétrica Bom Jesus (fictícia)", descricao: "Fio 2,5 mm e disjuntores", etapas: ["eletric", "instala"] },
  { palavras: /tubo|cano|pvc|conex|registro|hidr|esgoto|caixa d/, tipo: "nota_fiscal", valor: "432,50", favorecido: "Hidráulica Campinas (fictícia)", descricao: "Tubos e conexões de PVC", etapas: ["hidr", "sanit", "instala"] },
  { palavras: /pedreiro|servente|diaria|diária|mao de obra|mão de obra|empreit/, tipo: "recibo", valor: "1.250,00", favorecido: "José Aparecido Lima", descricao: "Diárias de pedreiro (5 dias)", etapas: ["alvenaria", "estrutura", "revest"] },
  { palavras: /betoneira|loca[çc]|andaime|aluguel|equipamento/, tipo: "boleto", valor: "380,00", favorecido: "Loca Obra Equipamentos (fictícia)", descricao: "Locação de betoneira (15 dias)", etapas: ["equipamento", "preliminar", "administra", "estrutura"] },
  { palavras: /telha|calha|rufo|cobertura|telhado/, tipo: "nota_fiscal", valor: "2.890,00", favorecido: "Telhas Jaguari (fictícia)", descricao: "Telhas cerâmicas e cumeeiras", etapas: ["cobertura", "telhad"] },
  { palavras: /bloco|tijolo|alvenaria/, tipo: "nota_fiscal", valor: "3.200,00", favorecido: "Cerâmica Santa Rita", descricao: "Bloco cerâmico 14×19×29 (1.000 un)", etapas: ["alvenaria", "vedac"] },
];

/** Um número estável de 0 a n-1 a partir do sha256 (pedaço diferente para cada uso). */
const sorteio = (sha: string, n: number, pedaco = 0) => parseInt(sha.slice(pedaco * 6, pedaco * 6 + 6), 16) % n;

function etapasPara(nos: NoArvore[], pistas: string[], sha: string): NoArvore[] {
  const achadas = pistas.flatMap((p) => nos.filter((n) => chaveNome(n.nome).includes(p))).filter((n, i, xs) => xs.indexOf(n) === i);
  if (achadas.length) return achadas;
  // sem etapa parecida (obra com outra planilha): três etapas da árvore, em rodízio
  const comecar = sorteio(sha, Math.max(1, nos.length), 2);
  return [0, 1, 2].map((k) => nos[(comecar + k) % nos.length]!).filter((n, i, xs) => n && xs.indexOf(n) === i);
}

/**
 * POST /srv/agente/leitura na demonstração: grava no comprovante uma leitura fictícia, no mesmo esquema da IA. Uma em
 * cada três vem com dúvida (valor e etapa com opções e nada marcado), para a demo mostrar o "conferir".
 */
export function lerSimulado(b: Base, id: string, forcar: { duvida?: boolean } = {}) {
  const c = comprovantePorId(b, id);
  if (c.status !== "a_revisar") throw new Conflito("Este comprovante já foi revisado.");
  const pista = chaveNome(c.legenda);
  const modelo = MODELOS.find((m) => m.palavras.test(pista)) ?? MODELOS[sorteio(c.sha256, MODELOS.length)]!;
  const duvida = forcar.duvida ?? sorteio(c.sha256, 3, 1) === 0;
  const nos = arvore(b, c.obra_id);
  const etapas = etapasPara(nos, modelo.etapas, c.sha256);
  const dia = new Date(`${b.hoje()}T12:00:00`);
  dia.setDate(dia.getDate() - sorteio(c.sha256, 6, 3));
  const data = dia.toISOString().slice(0, 10);
  // na dúvida, o valor lido tem um dígito trocado como alternativa (o 4 que parece 9, o que a foto torta faz)
  const trocado = modelo.valor.replace(/(\d)(\d)(,)/, (_, a: string, x: string, v: string) => `${a}${x === "4" ? "9" : "4"}${v}`);
  const leitura: LeituraComprovante = {
    tipo_documento: modelo.tipo,
    situacao_pagamento: modelo.tipo === "boleto" && duvida ? "incerto" : "pago",
    valor: duvida
      ? { certeza: "baixa", opcoes: [{ valor: modelo.valor, motivo: "total em destaque" }, { valor: trocado, motivo: "o número está borrado na foto" }] }
      : { certeza: "alta", opcoes: [{ valor: modelo.valor, motivo: modelo.tipo === "comprovante_pix" ? "valor do Pix" : "valor total" }] },
    data_pagamento: { certeza: "alta", opcoes: [{ valor: data, motivo: "data do pagamento" }] },
    favorecido: { certeza: "alta", opcoes: [{ valor: modelo.favorecido, motivo: modelo.tipo === "comprovante_pix" ? "recebedor do Pix" : "emitente" }] },
    cnpj_favorecido: null,
    descricao: { certeza: "alta", opcoes: [{ valor: modelo.descricao, motivo: "o que está descrito no documento" }] },
    classificacao: duvida
      ? { certeza: "baixa", opcoes: etapas.slice(0, 3).map((n, i) => ({ etapa: n.chave, topico_id: null, motivo: i === 0 ? "o material é usado principalmente aqui" : "também pode ser desta etapa" })) }
      : { certeza: "alta", opcoes: etapas.slice(0, 1).map((n) => ({ etapa: n.chave, topico_id: null, motivo: `${modelo.descricao.split(" ")[0]} entra em ${n.nome}` })) },
    observacoes: duvida ? "Foto um pouco tremida: confira o valor." : null,
  };
  c.leitura = leitura;
  c.erro_leitura = null;
  c.lido_em = new Date().toISOString();
  c.modelo_leitura = "demonstração";
  c.atualizado_em = c.lido_em;
  return { ok: true };
}

/* ---------- confirmar e descartar ---------- */

function exigirNaFila(c: ComprovanteDemo) {
  if (c.status !== "a_revisar") throw new Conflito("Este comprovante já foi revisado.");
}

/** "18 INSTALAÇÃO ELÉTRICA › Quadro" para o registro. */
function rotulo(b: Base, obraId: string, etapa: string | null, topicoId: string | null) {
  if (etapa === null) return "sem etapa";
  const nome = nomeDaEtapa(b, obraId, etapa);
  const t = topicoId ? b.g.topicos.find((x) => x.id === topicoId)?.nome : null;
  return t ? `${nome} › ${t}` : nome;
}

/** Destino válido hoje: etapa da árvore e tópico daquela etapa (ou nenhum). */
function exigirDestino(b: Base, obraId: string, etapa: unknown, topicoId: unknown): { etapa: string | null; topico_id: string | null } {
  if (etapa === null) {
    if (topicoId) throw new RegraViolada("Sem etapa não tem tópico.");
    return { etapa: null, topico_id: null };
  }
  const no = arvore(b, obraId).find((n) => n.chave === etapa);
  if (!no) throw new RegraViolada("Esta etapa não está na árvore da obra.");
  if (topicoId == null || topicoId === "") return { etapa: no.chave, topico_id: null };
  if (!no.topicos.some((t) => t.id === topicoId)) throw new RegraViolada("Este tópico não é desta etapa.");
  return { etapa: no.chave, topico_id: String(topicoId) };
}

/** O gasto como a API devolve: com o nome e a origem da etapa de hoje e a marca de fora do orçado. */
export function gastoApi(b: Base, g: GastoDemo): GastoObra {
  const { usuario_id: _u, ...x } = g;
  const nos = arvore(b, g.obra_id);
  return {
    ...x,
    etapa_nome: g.etapa === null ? SEM_ETAPA : nomeDaEtapa(b, g.obra_id, g.etapa, nos),
    etapa_origem: origemDaEtapa(b, g.obra_id, g.etapa, nos),
  };
}

export function confirmar(b: Base, u: Usuario, id: string, c: Record<string, unknown>) {
  exigirAdmin(u);
  const cp = comprovantePorId(b, id);
  exigirNaFila(cp);
  const valor = c.valor;
  if (typeof valor !== "number" || !Number.isInteger(valor) || valor <= 0) throw new RegraViolada("O valor tem de ser maior que zero (em centavos).");
  const data = typeof c.data_pagamento === "string" ? dataLida(c.data_pagamento) : null;
  if (!data || data > b.hoje()) throw new RegraViolada("Data do pagamento inválida: AAAA-MM-DD, até hoje.");
  const favorecido = limpo(c.favorecido);
  if (!favorecido) throw new RegraViolada("Diga quem recebeu o pagamento.");
  const descricao = limpo(c.descricao);
  if (!descricao) throw new RegraViolada("Diga o que foi pago.");
  if (!("etapa" in c)) throw new RegraViolada("Escolha a etapa (ou mande etapa: null para ver depois).");
  const destino = exigirDestino(b, cp.obra_id, c.etapa, c.topico_id);
  const g: GastoDemo = {
    id: uuid7(),
    obra_id: cp.obra_id,
    comprovante_id: cp.id,
    valor,
    data_pagamento: data,
    favorecido: favorecido.slice(0, 120),
    fornecedor_id: null,
    descricao: descricao.slice(0, 200),
    ...destino,
    quem: u.nome,
    usuario_id: u.id,
    estornado: false,
    criado_em: new Date().toISOString(),
  };
  b.g.gastos.push(g);
  cp.status = "confirmado";
  cp.gasto_id = g.id;
  cp.atualizado_em = g.criado_em;
  const onde = destino.etapa === null ? "sem etapa (ver depois)" : `em ${rotulo(b, cp.obra_id, destino.etapa, destino.topico_id)}`;
  const reg = b.registrar(u, { obra_id: cp.obra_id, texto: `Gasto de ${fmtReais(valor)} ${onde}: ${g.descricao} (${g.favorecido})`, desfazer: { op: "estornar_gasto", gasto_id: g.id } });
  return { status: 201, corpo: { gasto: gastoApi(b, g), comprovante: publico(cp), registro_id: reg.id } };
}

export function descartar(b: Base, u: Usuario, id: string, c: Record<string, unknown>) {
  exigirAdmin(u);
  const cp = comprovantePorId(b, id);
  exigirNaFila(cp);
  const motivo = limpo(c.motivo).slice(0, 200);
  cp.status = "descartado";
  cp.motivo_descarte = motivo;
  cp.atualizado_em = new Date().toISOString();
  const reg = b.registrar(u, { obra_id: cp.obra_id, texto: `Descartou um comprovante${motivo ? ` (${motivo})` : ""}`, desfazer: { op: "reabrir_comprovante", comprovante_id: cp.id } });
  return { ...publico(cp), registro_id: reg.id };
}

/* ---------- gastos lançados ---------- */

const ativos = (b: Base, obraId: string) => b.g.gastos.filter((g) => g.obra_id === obraId && !g.estornado);

export function listarGastos(b: Base, obraId: string, params: URLSearchParams) {
  b.obra(obraId);
  const etapa = params.get("etapa");
  const antes = params.get("antes_de");
  const limite = Math.min(500, Number(params.get("limite") ?? 100) || 100);
  return ativos(b, obraId)
    .filter((g) => (!etapa || g.etapa === etapa) && (!antes || g.criado_em < antes))
    .sort((x, y) => y.criado_em.localeCompare(x.criado_em))
    .slice(0, limite)
    .map((g) => gastoApi(b, g));
}

export function mudarEtapa(b: Base, u: Usuario, id: string, c: Record<string, unknown>) {
  exigirAdmin(u);
  const g = b.g.gastos.find((x) => x.id === id);
  if (!g) throw new NaoEncontrado("Gasto não encontrado.");
  if (g.estornado) throw new Conflito("Este gasto foi estornado.");
  if (!("etapa" in c) || c.etapa === null) throw new RegraViolada("Escolha a etapa do gasto.");
  const para = exigirDestino(b, g.obra_id, c.etapa, c.topico_id);
  if (para.etapa === g.etapa && para.topico_id === g.topico_id) throw new RegraViolada("Nada mudou.");
  const de = { etapa: g.etapa, topico_id: g.topico_id };
  const texto = `Mudou o gasto de ${fmtReais(g.valor)} (${g.descricao}) de ${rotulo(b, g.obra_id, de.etapa, de.topico_id)} para ${rotulo(b, g.obra_id, para.etapa, para.topico_id)}`;
  g.etapa = para.etapa;
  g.topico_id = para.topico_id;
  const reg = b.registrar(u, { obra_id: g.obra_id, texto, desfazer: { op: "reclassificar_gasto", gasto_id: g.id, de, para } });
  return { ...gastoApi(b, g), registro_id: reg.id };
}

/** Os gastos que somam no orçamento, por chave de etapa (null = sem etapa) e por tópico. */
export function somaPorEtapa(b: Base, obraId: string): Map<string | null, { total: number; topicos: Map<string | null, number> }> {
  const m = new Map<string | null, { total: number; topicos: Map<string | null, number> }>();
  for (const g of ativos(b, obraId)) {
    const e = m.get(g.etapa) ?? { total: 0, topicos: new Map() };
    e.total += g.valor;
    e.topicos.set(g.topico_id, (e.topicos.get(g.topico_id) ?? 0) + g.valor);
    m.set(g.etapa, e);
  }
  return m;
}

/** Os gastos pagos por mês (AAAA-MM), para o desembolso. */
export function pagoPorMes(b: Base, obraId: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const g of ativos(b, obraId)) m.set(g.data_pagamento.slice(0, 7), (m.get(g.data_pagamento.slice(0, 7)) ?? 0) + g.valor);
  return m;
}

export function resumoGastos(b: Base, obraId: string): ResumoGastos & Record<string, unknown> {
  b.obra(obraId);
  const nos = arvore(b, obraId);
  const temOrcamento = !!b.etapasDoOrcamento(obraId);
  const soma = somaPorEtapa(b, obraId);
  const ordem = new Map(nos.map((n, i) => [n.chave, i]));
  const topicoNome = (id: string) => b.g.topicos.find((t) => t.id === id)?.nome ?? "Tópico";
  const etapas = [...soma.entries()]
    .map(([etapa, s]) => ({
      etapa,
      nome: etapa === null ? SEM_ETAPA : nomeDaEtapa(b, obraId, etapa, nos),
      origem: origemDaEtapa(b, obraId, etapa, nos),
      total: s.total,
      topicos: [...s.topicos.entries()].map(([topico_id, total]) => ({ topico_id, nome: topico_id ? topicoNome(topico_id) : "Sem tópico", total })),
    }))
    // na ordem da árvore; as que saíram dela por último, e a sem etapa no fim
    .sort((x, y) => (x.etapa === null ? 1 : 0) - (y.etapa === null ? 1 : 0) || (ordem.get(x.etapa ?? "") ?? 999) - (ordem.get(y.etapa ?? "") ?? 999));
  const parte = (origem: string) => etapas.filter((e) => e.origem === origem).reduce((t, e) => t + e.total, 0);
  const total = etapas.reduce((t, e) => t + e.total, 0);
  return {
    total,
    a_revisar: b.g.comprovantes.filter((c) => c.obra_id === obraId && c.status === "a_revisar").length,
    tem_orcamento: temOrcamento,
    fora_do_orcamento: temOrcamento ? parte("extra") : 0,
    sem_etapa_do_orcamento: temOrcamento ? parte("sem_etapa_do_orcamento") : 0,
    a_definir: parte("a_definir"),
    etapas,
  };
}

/* ---------- o Desfazer ---------- */

/** Desfaz uma escrita de gastos. Devolve o texto do registro do desfazer, ou null se a operação não é daqui. */
export function desfazerGasto(b: Base, d: Record<string, unknown>): string | null {
  switch (d.op) {
    case "estornar_gasto": {
      const g = b.g.gastos.find((x) => x.id === d.gasto_id);
      if (!g) throw new NaoEncontrado("Gasto não encontrado.");
      if (g.estornado) throw new Conflito("Este gasto já foi estornado.");
      g.estornado = true;
      const cp = b.g.comprovantes.find((x) => x.id === g.comprovante_id);
      if (cp) {
        cp.status = "a_revisar";
        cp.gasto_id = null;
        cp.atualizado_em = new Date().toISOString();
      }
      return `Desfeito: gasto de ${fmtReais(g.valor)} estornado; o comprovante voltou para conferir`;
    }
    case "reabrir_comprovante": {
      const cp = b.g.comprovantes.find((x) => x.id === d.comprovante_id);
      if (!cp) throw new NaoEncontrado("Comprovante não encontrado.");
      if (cp.status !== "descartado") throw new Conflito("Este comprovante já não está descartado.");
      cp.status = "a_revisar";
      cp.motivo_descarte = "";
      return "Desfeito: o comprovante voltou para conferir";
    }
    case "reclassificar_gasto": {
      const g = b.g.gastos.find((x) => x.id === d.gasto_id);
      if (!g) throw new NaoEncontrado("Gasto não encontrado.");
      const para = d.para as { etapa: string | null; topico_id: string | null };
      const de = d.de as { etapa: string | null; topico_id: string | null };
      if (g.estornado || g.etapa !== para.etapa || g.topico_id !== para.topico_id) throw new Conflito("O gasto mudou de novo depois disso; não dá para desfazer.");
      g.etapa = de.etapa;
      g.topico_id = de.topico_id;
      return `Desfeito: o gasto de ${fmtReais(g.valor)} voltou para ${rotulo(b, g.obra_id, de.etapa, de.topico_id)}`;
    }
    case "arquivar_extra":
    case "arquivar_topico": {
      const x = d.op === "arquivar_extra" ? b.g.extras.find((y) => y.id === d.id) : b.g.topicos.find((y) => y.id === d.id);
      if (!x) throw new NaoEncontrado("Não encontrado.");
      if (x.arquivado) throw new Conflito("Já está arquivado.");
      x.arquivado = true;
      return `Desfeito: «${x.nome}» arquivado`;
    }
    case "restaurar_extra":
    case "restaurar_topico": {
      const extra = d.op === "restaurar_extra";
      const x = extra ? b.g.extras.find((y) => y.id === d.id) : b.g.topicos.find((y) => y.id === d.id);
      if (!x) throw new NaoEncontrado("Não encontrado.");
      const antes = d.antes as { nome: string; arquivado: boolean };
      const depois = d.depois as { nome: string; arquivado: boolean };
      if (x.nome !== depois.nome || x.arquivado !== depois.arquivado) throw new Conflito("Mudou de novo depois disso; não dá para desfazer.");
      if (!antes.arquivado) {
        if (extra) exigirNomeDeEtapaLivre(b, x.obra_id, antes.nome, x.id);
        else exigirNomeDeTopicoLivre(b, x.obra_id, (x as Topico).etapa, antes.nome, x.id);
      }
      x.nome = antes.nome;
      x.arquivado = antes.arquivado;
      return `Desfeito: «${x.nome}» voltou ao que era`;
    }
    default:
      return null;
  }
}

/* ---------- a semente da demonstração ---------- */

/**
 * Um recibo em PDF de verdade (uma página, Helvetica), para o comprovante semeado abrir na tela como os enviados.
 * O texto vai em WinAnsi (Latin-1 cobre os acentos do português); o que não couber vira "?".
 */
export function pdfRecibo(linhas: string[]): Uint8Array {
  const esc = (t: string) =>
    [...t]
      .map((ch) => (ch.charCodeAt(0) > 0xff ? "?" : ch))
      .join("")
      .replace(/[\\()]/g, (m) => `\\${m}`);
  const corpo = [`BT /F1 15 Tf 32 250 Td (${esc(linhas[0] ?? "")}) Tj /F1 11 Tf`, ...linhas.slice(1).map((l) => `0 -20 Td (${esc(l)}) Tj`), "ET"].join("\n");
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 297] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(corpo, "latin1")} >>\nstream\n${corpo}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const posicoes: number[] = [];
  objetos.forEach((o, i) => {
    posicoes.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${posicoes.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, "latin1"));
}

/** Um comprovante já recebido, com o arquivo em PDF. Sem registro: é o passado da obra. */
export function semearComprovante(b: Base, quem: Usuario, obraId: string, legenda: string, linhas: string[], criado_em: string): ComprovanteDemo {
  const bytes = pdfRecibo(linhas);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const id = createHash("sha256").update(`${obraId}:${sha256}`).digest("hex").slice(0, 32);
  const c: ComprovanteDemo = {
    id,
    obra_id: obraId,
    arquivo: `${obraId}/${id}.pdf`,
    tipo_conteudo: "application/pdf",
    tamanho: bytes.length,
    sha256,
    legenda,
    quem: quem.nome,
    usuario_id: quem.id,
    status: "a_revisar",
    leitura: null,
    erro_leitura: null,
    lido_em: null,
    modelo_leitura: null,
    gasto_id: null,
    motivo_descarte: "",
    criado_em,
    atualizado_em: criado_em,
  };
  b.g.comprovantes.push(c);
  b.g.arquivos.set(id, bytes);
  return c;
}

/** Um gasto já confirmado, com o comprovante dele. Devolve o gasto (o registro é quem semeia que escreve). */
export function semearGasto(
  b: Base,
  envia: Usuario,
  confirma: Usuario,
  obraId: string,
  d: { valor: number; data: string; favorecido: string; descricao: string; etapa: string | null; tipo: string },
): GastoDemo {
  const criado = `${d.data}T15:00:00.000Z`;
  const c = semearComprovante(b, envia, obraId, d.descricao, [d.tipo, `Pago a: ${d.favorecido}`, `Referente a: ${d.descricao}`, `Valor: ${fmtReais(d.valor)}`, `Data: ${fmtDataBr(d.data)}`, "Documento fictício da demonstração"], criado);
  const g: GastoDemo = {
    id: uuid7(),
    obra_id: obraId,
    comprovante_id: c.id,
    valor: d.valor,
    data_pagamento: d.data,
    favorecido: d.favorecido,
    fornecedor_id: null,
    descricao: d.descricao,
    etapa: d.etapa,
    topico_id: null,
    quem: confirma.nome,
    usuario_id: confirma.id,
    estornado: false,
    criado_em: criado,
  };
  b.g.gastos.push(g);
  c.status = "confirmado";
  c.gasto_id = g.id;
  return g;
}
