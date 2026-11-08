/**
 * Nomes para gente das escolhas fiscais (os valores são os do contrato) e o formulário dos dados fiscais da obra, que
 * manda só o que mudou no PATCH /obras/{id}. Nenhuma conta de imposto aqui: quem calcula é a API.
 */
import type { CategoriaObra, DadosObra, Destinacao, Finalidade, Material, NaturezaFiscal, Obra, Proprietario } from "@/lib/contrato";
import { lerQtd, lerReais, qtdParaCampo, reaisParaCampo } from "@/lib/formato";
import { lerMesAno } from "../obra/CamposObra";

export const NATUREZAS: { k: NaturezaFiscal; rotulo: string; dica: string }[] = [
  { k: "mao_de_obra_nf", rotulo: "Mão de obra com nota", dica: "Empreiteiro ou subempreiteiro com nota fiscal de serviço. Só conta se a nota trouxer o CNO e o endereço da obra." },
  { k: "mao_de_obra_sem_nf", rotulo: "Mão de obra sem nota", dica: "Pix ou recibo a quem trabalhou na obra, sem nota nem eSocial: a Receita não aceita." },
  { k: "folha", rotulo: "Folha (eSocial)", dica: "Salário de empregado registrado e declarado no eSocial com a DCTFWeb." },
  { k: "autonomo_mei", rotulo: "Autônomo ou MEI (eSocial)", dica: "Pedreiro autônomo ou MEI declarado no eSocial: abate os 20% patronais e conta no fator de ajuste." },
  { k: "gps", rotulo: "GPS paga com o CNO", dica: "Guia de INSS paga pelo dono da obra com o CNO: o SERO converte em remuneração (÷ 36,8%)." },
  { k: "concreto_usinado", rotulo: "Concreto usinado", dica: "Concreto, argamassa usinada ou massa asfáltica com nota: a obra abate 5% do custo (pela tabela da UF), não um percentual da nota." },
  { k: "pre_moldado", rotulo: "Pré-moldado", dica: "Estrutura ou parede pré-fabricada com nota (laje, piso e cobertura não contam). Somando 40% do custo, a mão de obra cai 70%." },
  { k: "material", rotulo: "Material", dica: "Material de construção comprado." },
  { k: "equipamento", rotulo: "Equipamento", dica: "Aluguel de equipamento, caçamba, andaime." },
  { k: "outros", rotulo: "Outros", dica: "Taxas, projetos e o que não é mão de obra nem material." },
];
export const rotuloNatureza = (k: NaturezaFiscal | null | undefined) => NATUREZAS.find((n) => n.k === k)?.rotulo ?? "A classificar";

export const PROPRIETARIOS: { k: Proprietario; rotulo: string }[] = [
  { k: "pf", rotulo: "Pessoa física" },
  { k: "pj", rotulo: "Empresa (PJ)" },
];
export const DESTINACOES: { k: Destinacao; rotulo: string }[] = [
  { k: "residencial_unifamiliar", rotulo: "Casa (unifamiliar)" },
  { k: "residencial_multifamiliar", rotulo: "Prédio residencial" },
  { k: "casa_popular", rotulo: "Casa popular" },
  { k: "conjunto_habitacional", rotulo: "Conjunto habitacional" },
  { k: "comercial", rotulo: "Comercial" },
  { k: "edificio_garagens", rotulo: "Edifício garagem" },
  { k: "galpao", rotulo: "Galpão" },
];
export const MATERIAIS: { k: Material; rotulo: string }[] = [
  { k: "alvenaria", rotulo: "Alvenaria" },
  { k: "mista", rotulo: "Mista" },
  { k: "madeira", rotulo: "Madeira" },
];
export const CATEGORIAS: { k: CategoriaObra; rotulo: string }[] = [
  { k: "obra_nova", rotulo: "Obra nova" },
  { k: "acrescimo", rotulo: "Acréscimo" },
  { k: "reforma", rotulo: "Reforma" },
  { k: "demolicao", rotulo: "Demolição" },
];
export const SIM_NAO = [
  { k: "sim", rotulo: "Sim, todo mês" },
  { k: "nao", rotulo: "Não ou não sei" },
] as const;
export const FINALIDADES: { k: Finalidade; rotulo: string }[] = [
  { k: "uso_proprio", rotulo: "Uso próprio" },
  { k: "venda", rotulo: "Venda do imóvel" },
  { k: "prestacao_servico", rotulo: "Empreitada" },
];

/** "900123456789" → "90.012.34567/89" (a máscara do CNO); outro tamanho volta como veio. */
export function fmtCno(d: string): string {
  return /^\d{12}$/.test(d) ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 10)}/${d.slice(10)}` : d;
}

export interface FormFiscal {
  cno: string;
  proprietario: Proprietario | "";
  destinacao: Destinacao | "";
  material: Material | "";
  categoria: CategoriaObra | "";
  /** A DCTFWeb foi entregue todo mês: condição do fator de ajuste. */
  dctfweb: "sim" | "nao" | "";
  area_complementar: string;
  area_descoberta: string;
  vau: string;
  /** "MM/AAAA" na tela; a API grava "AAAA-MM". */
  vau_referencia: string;
  finalidade: Finalidade | "";
  valor_terreno: string;
  unidades: string;
}
export type ErrosFiscal = Partial<Record<keyof FormFiscal, string | null>>;

export function formFiscalDe(o: Obra): FormFiscal {
  const r = o.vau_referencia;
  return {
    cno: o.cno ? fmtCno(o.cno) : "",
    proprietario: o.proprietario ?? "",
    destinacao: o.destinacao ?? "",
    material: o.material ?? "",
    categoria: o.categoria ?? "",
    dctfweb: o.dctfweb_em_dia === true ? "sim" : o.dctfweb_em_dia === false ? "nao" : "",
    area_complementar: o.area_complementar ? qtdParaCampo(o.area_complementar) : "",
    area_descoberta: o.area_descoberta ? qtdParaCampo(o.area_descoberta) : "",
    vau: o.vau ? reaisParaCampo(o.vau) : "",
    vau_referencia: r ? `${r.slice(5, 7)}/${r.slice(0, 4)}` : "",
    finalidade: o.finalidade ?? "",
    valor_terreno: o.valor_terreno ? reaisParaCampo(o.valor_terreno) : "",
    unidades: o.unidades ? String(o.unidades) : "",
  };
}

const digitosCno = (t: string) => t.replace(/[.\-/\s]/g, "");
const vazioOu = <T,>(t: string, ler: (t: string) => T | null): T | 0 | null => (t.trim() ? ler(t) : 0);

export function validarFiscal(f: FormFiscal): ErrosFiscal {
  const u = f.unidades.trim();
  return {
    cno: f.cno.trim() && !/^\d{12}$/.test(digitosCno(f.cno.trim())) ? "O CNO tem 12 números, ex.: 90.012.34567/89." : null,
    area_complementar: vazioOu(f.area_complementar, lerQtd) === null ? "Digite a área em m², ex.: 30 ou 30,5." : null,
    area_descoberta: vazioOu(f.area_descoberta, lerQtd) === null ? "Digite a área em m², ex.: 40." : null,
    vau: vazioOu(f.vau, lerReais) === null ? "Digite o valor por m², ex.: 2.150,00." : null,
    vau_referencia: f.vau_referencia.trim() && !lerMesAno(f.vau_referencia) ? "Mês e ano, ex.: 10/2026." : null,
    valor_terreno: vazioOu(f.valor_terreno, lerReais) === null ? "Digite o valor em reais, ex.: 200.000." : null,
    unidades: u && !/^\d{1,6}$/.test(u) ? "Número de imóveis, ex.: 1." : null,
  };
}

/** O corpo do PATCH: só os campos que mudaram em relação à obra (o registro diz exatamente o quê). */
export function dadosFiscaisDe(f: FormFiscal, o: Obra): DadosObra {
  const novo: DadosObra = {
    cno: digitosCno(f.cno.trim()),
    proprietario: f.proprietario || null,
    destinacao: f.destinacao || null,
    material: f.material || null,
    categoria: f.categoria || null,
    dctfweb_em_dia: f.dctfweb === "sim" ? true : f.dctfweb === "nao" ? false : null,
    area_complementar: (vazioOu(f.area_complementar, lerQtd) ?? 0),
    area_descoberta: (vazioOu(f.area_descoberta, lerQtd) ?? 0),
    vau: (vazioOu(f.vau, lerReais) ?? 0),
    vau_referencia: f.vau_referencia.trim() ? lerMesAno(f.vau_referencia) : null,
    finalidade: f.finalidade || null,
    valor_terreno: (vazioOu(f.valor_terreno, lerReais) ?? 0),
    unidades: f.unidades.trim() ? Number(f.unidades.trim()) : 0,
  };
  const antes: DadosObra = {
    cno: o.cno ?? "",
    proprietario: o.proprietario ?? null,
    destinacao: o.destinacao ?? null,
    material: o.material ?? null,
    categoria: o.categoria ?? null,
    dctfweb_em_dia: o.dctfweb_em_dia ?? null,
    area_complementar: o.area_complementar ?? 0,
    area_descoberta: o.area_descoberta ?? 0,
    vau: o.vau ?? 0,
    vau_referencia: o.vau_referencia ?? null,
    finalidade: o.finalidade ?? null,
    valor_terreno: o.valor_terreno ?? 0,
    unidades: o.unidades ?? 0,
  };
  return Object.fromEntries(Object.entries(novo).filter(([k, v]) => antes[k as keyof DadosObra] !== v)) as DadosObra;
}
