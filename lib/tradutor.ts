/**
 * Cliente do tradutor de pranchas, pelo repasse /srv/tradutor (o navegador nunca vê a URL nem a chave do serviço).
 * Os tipos espelham o contrato 1.0 do tradutor (docs/integracao-prumo.md e docs/modelo3d.schema.json dele).
 */
import { comAcesso } from "./sessao";

export type StatusTraducao = "na_fila" | "processando" | "concluida" | "falhou";

export interface Traducao {
  id: string;
  status: StatusTraducao;
  nome: string | null;
  tipo: string;
  segundos: number | null;
  erro: string | null;
}

export interface Caixa {
  forma: "caixa";
  centro: [number, number];
  dimensoes: [number, number];
  z0: number;
  z1: number;
}
export interface Prisma {
  forma: "prisma";
  poligono: [number, number][];
  z0: number;
  z1: number;
}
export type TipoElemento = "pilar" | "sapata" | "viga" | "laje";
export interface Elemento3D {
  id: string;
  tipo: TipoElemento;
  geometria: Caixa | Prisma;
  propriedades: Record<string, unknown>;
}
export interface Modelo3D {
  versao_contrato: string;
  id: string;
  niveis: { cota_cm: number; nome: string | null }[];
  limites: { x0: number; y0: number; x1: number; y1: number; z0: number; z1: number };
  elementos: Elemento3D[];
  resumo: Partial<Record<TipoElemento, number>>;
  calibracao_formas: { titulo: string; nivel: number; calibracao_erro_cm: number; pilares_usados: number; vigas: number }[];
  avisos: string[];
}

/** Só o que a tela usa do resultado completo; o resto do contrato fica disponível para telas futuras. */
export interface ResultadoTraducao {
  id: string;
  arquivo: string;
  fonte: "pdf-vetorial" | "ocr";
  carimbo: Record<string, string | null> & { folha?: string | null };
  classificacao: { tipo: string; pavimento: string | null; conteudos: string[] };
  cobertura: { textos_na_prancha: number; estruturados: number; cotas_com_desenho: number; textos_soltos: number; sem_regiao: number; pct_estruturado: number };
  totais: { aco_kg: Record<string, number>; aco_total_kg: number; concreto_m3: Record<string, number>; forma_m2: number };
  tabelas_aco: { grupo: string | null; linhas: unknown[]; linhas_com_divergencia: number }[];
}

export type Papel = "locacao" | "formas" | "fundacoes" | "pilares" | "vigas" | "lajes" | "cortes";

/** Uma parte do pacote do projeto estrutural e quem a cobriu. */
export interface ParteDoPacote {
  papel: Papel;
  nome: string;
  responsavel_por: string;
  obrigatorio_para_3d: boolean;
  situacao: "coberto" | "parcial" | "faltando";
  arquivos: { id: string; arquivo: string | null; folha: string | null; detalhes: string[] }[];
  faltam_pavimentos: string[];
}

export interface Projeto {
  traducoes: string[];
  obra: Record<string, string | null>;
  pacote: ParteDoPacote[];
  nao_lidos_ainda: string[];
  conferencias: { ok: boolean; texto: string }[];
  quantitativos: {
    aco_kg: Record<string, number>;
    aco_total_kg: number;
    concreto_m3: Record<string, number>;
    concreto_total_m3: number;
    forma_m2: number;
    por_folha: { folha: string | null; arquivo: string | null; aco_total_kg: number | null }[];
  };
  modelo3d: Modelo3D | null;
  pronto_para_3d: boolean;
  /** A última edição feita no CAD sobre o espelho, já aplicada no modelo acima. */
  edicoes_cad: {
    id: string;
    arquivo: string | null;
    mudancas: { id: string; tipo: TipoElemento; mudanca: "movido" | "redimensionado" | "novo" | "removido"; texto: string }[];
  } | null;
  em_andamento: { id: string; status: StatusTraducao; nome: string | null; erro: string | null }[];
  /** Leituras que o tradutor já não tem (passaram de 72 h): a tela as tira do pacote. */
  nao_encontradas: string[];
}

/** Um material que o projeto pede, com o insumo do SINAPI que é o mesmo produto (quando existe). */
export interface MaterialProjeto {
  chave: string;
  categoria: "aco" | "concreto" | "forma" | "enchimento" | "vigota";
  especificacao: string;
  unidade: string;
  /** Na unidade do material (kg, m3...), não em milésimos: é o levantamento do projeto. 0 = a confirmar. */
  quantidade: number;
  origem: string[];
  /** O que foi corrigido do que estava no CAD (bitola fora da NBR 7480). */
  ajuste: string | null;
  /** O que quem compra precisa saber sobre a quantidade. */
  nota: string | null;
  referencia: { codigo: string; descricao: string; unidade: string; preco_centavos: number | null; total_centavos: number | null } | null;
}

export interface MateriaisProjeto {
  referencia: { fonte: string; mes: string; encargos: string; uf: string } | null;
  itens: MaterialProjeto[];
  total_referencia_centavos: number;
  avisos: string[];
  em_andamento: { id: string; status: StatusTraducao; nome: string | null; erro: string | null }[];
  nao_encontradas: string[];
}

async function pedir<T>(caminho: string, init?: RequestInit): Promise<T> {
  const r = await comAcesso(`/srv/tradutor/${caminho}`, init);
  const corpo = (await r.json().catch(() => ({}))) as T & { detail?: string };
  if (!r.ok) throw new Error(typeof corpo.detail === "string" ? corpo.detail : `O tradutor respondeu ${r.status}.`);
  return corpo;
}

export const tradutor = {
  /** Envia a prancha. O PDF do CAD costuma ficar pronto em segundos; imagem passa por leitura de texto e demora minutos. */
  enviar: (arquivo: File) => {
    const f = new FormData();
    f.append("arquivo", arquivo);
    // PDF que fica pronto na espera curta já volta como resultado; o resto volta como tradução em andamento
    return pedir<Traducao | ResultadoTraducao>("traducoes", { method: "POST", body: f });
  },
  /** Apaga a leitura no tradutor. A que ele já não tem (passou de 72 h) conta como apagada. */
  apagar: async (id: string) => {
    const r = await comAcesso(`/srv/tradutor/traducoes/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!r.ok && r.status !== 404) {
      const c = (await r.json().catch(() => ({}))) as { detail?: string };
      throw new Error(c.detail ?? `O tradutor respondeu ${r.status}.`);
    }
  },
  status: (id: string) => pedir<Traducao>(`traducoes/${encodeURIComponent(id)}`),
  resultado: (id: string) => pedir<ResultadoTraducao>(`traducoes/${encodeURIComponent(id)}/resultado`),
  modelo3d: (id: string) => pedir<Modelo3D>(`traducoes/${encodeURIComponent(id)}/modelo3d`),
  /** As folhas do projeto juntas: o que cada parte cobre, o que falta, as conferências e o 3D com tudo. */
  projeto: (ids: string[]) => pedir<Projeto>(`projetos?ids=${ids.map(encodeURIComponent).join(",")}`),
  /** O que o projeto pede para a estrutura sair do papel, com o insumo do SINAPI e o preço na UF da obra. */
  materiais: (ids: string[], uf: string) =>
    pedir<MateriaisProjeto>(`projetos/materiais?ids=${ids.map(encodeURIComponent).join(",")}&uf=${encodeURIComponent(uf)}`),
  /** O modelo em DXF para abrir e editar no CAD (CADCraft, AutoCAD...); volta arrastando o DXF salvo. */
  espelho: async (ids: string[]): Promise<{ arquivo: Blob; nome: string }> => {
    const r = await comAcesso(`/srv/tradutor/projetos/espelho.dxf?ids=${ids.map(encodeURIComponent).join(",")}`);
    if (!r.ok) {
      const c = (await r.json().catch(() => ({}))) as { detail?: string };
      throw new Error(c.detail ?? `O tradutor respondeu ${r.status}.`);
    }
    const nome = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? "espelho.dxf";
    return { arquivo: await r.blob(), nome };
  },
};
