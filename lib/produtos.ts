/**
 * O catálogo de produtos e preços da construção (bases oficiais: SINAPI, SICRO...), consultado pelo repasse
 * `/srv/produtos/*`. Só leitura: as bases, a busca por termos e o detalhe de um item (preço na UF, por UF, histórico e,
 * na composição, os itens com coeficiente). O serviço é opcional: sem ele, a tela esconde a busca (não quebra).
 */
import { comAcesso } from "./sessao";
import type { Centavos } from "./contrato";

export interface BaseDeProdutos {
  base: string;
  nome: string;
  orgao: string;
  abrangencia: string;
  fonte_url: string;
  meses: string[];
}

export interface ProdutoAchado {
  base: string;
  tipo: "insumo" | "composicao";
  codigo: string;
  descricao: string;
  unidade: string;
  grupo: string;
  mes: string;
  preco_centavos: Centavos | null;
}

export interface BuscaProdutos {
  consulta: { contem: string[]; nao_contem: string[] };
  uf: string;
  desonerado: boolean;
  /** Bases publicadas por UF (SICRO) que ainda estão chegando em segundo plano, ex.: ["sicro/BA"]. */
  carregando: string[];
  itens: ProdutoAchado[];
}

export interface ItemDaComposicao {
  tipo: "insumo" | "composicao";
  codigo: string;
  descricao: string;
  unidade: string;
  coeficiente: number;
  situacao: string;
  preco_centavos: Centavos | null;
  parcial_centavos: Centavos | null;
}

export interface ProdutoDetalhe extends ProdutoAchado {
  precos_por_uf: Record<string, Centavos>;
  historico: { mes: string; centavos: Centavos }[];
  itens?: ItemDaComposicao[];
}

const qs = (p: Record<string, string | number | boolean | undefined>) =>
  Object.entries(p)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");

async function pedir<T>(caminho: string): Promise<T> {
  const r = await comAcesso(`/srv/produtos/${caminho}`);
  const corpo = (await r.json().catch(() => ({}))) as T & { detail?: string };
  if (!r.ok) throw new Error(typeof corpo.detail === "string" ? corpo.detail : `O catálogo respondeu ${r.status}.`);
  return corpo;
}

export const produtos = {
  bases: () => pedir<BaseDeProdutos[]>("bases"),
  /** Busca em insumos e composições: termos soltos (sem acento, em qualquer ordem); `-termo` exclui. */
  buscar: (q: string, opc: { uf?: string; tipo?: "insumo" | "composicao"; base?: string; desonerado?: boolean; limite?: number } = {}) =>
    pedir<BuscaProdutos>(`itens?${qs({ q, ...opc })}`),
  detalhe: (base: string, tipo: "insumo" | "composicao", codigo: string, opc: { uf?: string; desonerado?: boolean } = {}) =>
    pedir<ProdutoDetalhe>(`itens/${encodeURIComponent(base)}/${tipo}/${encodeURIComponent(codigo)}?${qs(opc)}`),
};
