/**
 * SIMULADO: sem API ainda.
 * - As disciplinas além da estrutura (hidráulica, elétrica, incêndio): trocar pelo cadastro de disciplinas da obra
 *   na API quando existir (GET/PUT /obras/{id}/disciplinas).
 * - O projeto da demonstração: o modo demo não tem o tradutor de pranchas, então o repasse /srv/tradutor responde com
 *   esta estrutura fictícia (uma casa de 10 × 8 m, dois pavimentos). Fora da demo nada daqui é servido.
 */
import type { Elemento3D, MateriaisProjeto, Modelo3D, Projeto } from "@/lib/tradutor";

export type SituacaoDisciplina = "proxima" | "nao_confirmada" | "vai_ter" | "nao_vai_ter";
export interface DisciplinaSimulada {
  id: "hidraulica" | "eletrica" | "incendio";
  nome: string;
  texto: string;
  situacao: SituacaoDisciplina;
}

/** O que a obra ainda vai receber depois da estrutura. A hidráulica é a próxima: sabemos que ela existe. */
export const DISCIPLINAS_SIMULADAS: DisciplinaSimulada[] = [
  {
    id: "hidraulica",
    nome: "Hidráulica",
    texto: "Sabemos que existe. Ao chegar, os tubos entram no modelo e a caixa d'água vai para a cobertura.",
    situacao: "proxima",
  },
  { id: "eletrica", nome: "Elétrica", texto: "Até vir, o orçamento usa estimativa por m², marcada como provisória.", situacao: "nao_confirmada" },
  { id: "incendio", nome: "Prevenção de incêndio", texto: "Pode ser exigida conforme a área e o uso.", situacao: "nao_confirmada" },
];

/** As seis pranchas da demonstração; os ids seguem o formato do tradutor (hex). */
export const FOLHAS_DEMO = [
  { id: "d0e0f0010001", nome: "E-01 Fundações.pdf", folha: "E-01" },
  { id: "d0e0f0010002", nome: "E-02 Forma.pdf", folha: "E-02" },
  { id: "d0e0f0010003", nome: "E-03 Vigas.pdf", folha: "E-03" },
  { id: "d0e0f0010004", nome: "E-04 Pilares.pdf", folha: "E-04" },
  { id: "d0e0f0010005", nome: "E-05 Laje.pdf", folha: "E-05" },
  { id: "d0e0f0010006", nome: "E-06 Escada e cobertura.pdf", folha: "E-06" },
];
export const ehFolhaDemo = (id: string) => FOLHAS_DEMO.some((f) => f.id === id);

const XS = [0, 500, 1000];
const YS = [0, 400, 800];
const NIVEIS = [0, 300, 600];

function modeloDemo(): Modelo3D {
  const el: Elemento3D[] = [];
  const caixa = (centro: [number, number], dimensoes: [number, number], z0: number, z1: number) => ({ forma: "caixa" as const, centro, dimensoes, z0, z1 });
  let n = 0;
  for (const x of XS)
    for (const y of YS) {
      n++;
      el.push({ id: `S${n}`, tipo: "sapata", geometria: caixa([x, y], [120, 120], -100, -60), propriedades: { origem_medida: "detalhamento" } });
      el.push({ id: `P${n}`, tipo: "pilar", geometria: caixa([x, y], [25, 25], -60, 600), propriedades: { secao_cm: "25x25" } });
    }
  let v = 0;
  for (const z of NIVEIS.slice(1)) {
    for (const y of YS) el.push({ id: `V${++v}`, tipo: "viga", geometria: caixa([500, y], [1020, 20], z - 40, z), propriedades: { comprimento_cm: 1000, secao_cm: "20x40" } });
    for (const x of XS) el.push({ id: `V${++v}`, tipo: "viga", geometria: caixa([x, 400], [20, 820], z - 40, z), propriedades: { comprimento_cm: 800, secao_cm: "20x40" } });
  }
  el.push({
    id: "L1",
    tipo: "laje",
    geometria: { forma: "prisma", poligono: [[0, 0], [1000, 0], [1000, 800], [0, 800]], z0: 288, z1: 300 },
    propriedades: { area_m2: 80, espessura_cm: 12 },
  });
  return {
    versao_contrato: "1.0",
    id: "demo",
    niveis: NIVEIS.map((cota_cm, i) => ({ cota_cm, nome: ["Térreo", "1º pavimento", "Cobertura"][i] ?? null })),
    limites: { x0: -60, y0: -60, x1: 1060, y1: 860, z0: -100, z1: 600 },
    elementos: el,
    resumo: { pilar: 9, sapata: 9, viga: v, laje: 1 },
    calibracao_formas: [],
    avisos: [],
  };
}

const arquivo = (i: number) => ({ id: FOLHAS_DEMO[i]!.id, arquivo: FOLHAS_DEMO[i]!.nome, folha: FOLHAS_DEMO[i]!.folha, detalhes: [] });

export function projetoDemo(ids: string[]): Projeto {
  const parte = (papel: Projeto["pacote"][number]["papel"], nome: string, responsavel_por: string, obrig: boolean, i: number) => ({
    papel,
    nome,
    responsavel_por,
    obrigatorio_para_3d: obrig,
    situacao: "coberto" as const,
    arquivos: [arquivo(i)],
    faltam_pavimentos: [],
  });
  return {
    traducoes: ids.filter(ehFolhaDemo),
    obra: { cliente: null, responsavel: null },
    pacote: [
      parte("locacao", "Locação de pilares e fundações", "posição de cada pilar, eixos e profundidade das sapatas", true, 0),
      parte("formas", "Formas dos pavimentos", "vigas, lajes e níveis de cada pavimento", true, 1),
      parte("fundacoes", "Detalhamento das fundações", "medida real das sapatas e o aço delas", false, 0),
      parte("pilares", "Armação dos pilares", "o aço de cada pilar e os lances", false, 3),
      parte("vigas", "Armação das vigas", "o aço das vigas de cada pavimento", false, 2),
      parte("lajes", "Armação das lajes / vigotas", "o aço das lajes e as vigotas", false, 4),
      parte("cortes", "Cortes", "níveis e pé-direito, para conferência", false, 5),
    ],
    nao_lidos_ainda: [],
    conferencias: [
      { ok: true, texto: "As seis folhas são do mesmo projeto (mesmo carimbo)." },
      { ok: false, texto: "P5: seção 25×25 na forma e 20×30 na armação. Confira qual vale." },
      { ok: false, texto: "Laje do 1º pavimento sem a espessura cotada na E-05: usei 12 cm." },
    ],
    quantitativos: {
      aco_kg: { "CA-50": 3420, "CA-60": 520 },
      aco_total_kg: 3940,
      concreto_m3: { "fck 25": 31.5 },
      concreto_total_m3: 31.5,
      forma_m2: 310,
      por_folha: [],
    },
    modelo3d: modeloDemo(),
    pronto_para_3d: true,
    edicoes_cad: null,
    em_andamento: [],
    nao_encontradas: ids.filter((id) => !ehFolhaDemo(id)),
  };
}

export function materiaisDemo(): MateriaisProjeto {
  const ref = (codigo: string, descricao: string, unidade: string, preco: number, qtd: number) => ({
    codigo,
    descricao,
    unidade,
    preco_centavos: preco,
    total_centavos: Math.round(preco * qtd),
  });
  const itens: MateriaisProjeto["itens"] = [
      { chave: "aco-ca50-10", categoria: "aco", especificacao: "Aço CA-50 10 mm", unidade: "kg", quantidade: 3420, origem: ["E-03", "E-04"], ajuste: null, nota: null, referencia: ref("00000034", "Aço CA-50, 10 mm", "kg", 660, 3420) },
      { chave: "aco-ca60-5", categoria: "aco", especificacao: "Aço CA-60 5 mm", unidade: "kg", quantidade: 520, origem: ["E-05"], ajuste: null, nota: null, referencia: ref("00000039", "Aço CA-60, 5 mm", "kg", 720, 520) },
      { chave: "concreto-25", categoria: "concreto", especificacao: "Concreto fck 25 MPa", unidade: "m3", quantidade: 31.5, origem: ["E-01", "E-02"], ajuste: null, nota: null, referencia: ref("00034492", "Concreto usinado fck 25 MPa", "m3", 52000, 31.5) },
      { chave: "forma", categoria: "forma", especificacao: "Forma de madeira", unidade: "m2", quantidade: 310, origem: ["E-02"], ajuste: null, nota: null, referencia: null },
  ];
  return {
    referencia: { fonte: "SINAPI", mes: "2026-09", encargos: "não desonerado", uf: "SP" },
    itens,
    total_referencia_centavos: itens.reduce((s, i) => s + (i.referencia?.total_centavos ?? 0), 0),
    avisos: [],
    em_andamento: [],
    nao_encontradas: [],
  };
}
