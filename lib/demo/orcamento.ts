/**
 * A leitura da planilha do orçamento na demonstração, com as regras de servicos/orcamento.py: cabeçalho detectado
 * pelos sinônimos e a sugestão de colunas, que a importação da versão usa depois. Só CSV: o .xlsx precisa
 * da API (openpyxl), e a demonstração não fala com ela.
 */
import "server-only";
import type { LeituraPlanilha, Mapeamento } from "../contrato";

export class PlanilhaInvalida extends Error {}

type Grade = string[][];

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
export const nomeChave = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();

export function lerCsv(texto: string): Grade {
  const t = texto.replace(/^﻿/, "");
  const primeira = t.split(/\r?\n/)[0] ?? "";
  const sep = (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ";" : ",";
  const linhas: Grade = [];
  let celula = "";
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]!;
    if (aspas) {
      if (ch === '"' && t[i + 1] === '"') {
        celula += '"';
        i++;
      } else if (ch === '"') aspas = false;
      else celula += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) {
      linha.push(celula.trim());
      celula = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      linha.push(celula.trim());
      linhas.push(linha);
      linha = [];
      celula = "";
    } else celula += ch;
  }
  if (celula || linha.length) {
    linha.push(celula.trim());
    linhas.push(linha);
  }
  return linhas;
}

type Campo = Exclude<keyof Mapeamento, "planilha" | "linha_cabecalho">;

function campoDoTitulo(titulo: string): Campo | null {
  const t = semAcento(titulo);
  if (!t) return null;
  if (["item", "no", "n", "nº", "n°"].includes(t) || t.startsWith("item ")) return "item";
  if (t.startsWith("cod")) return "codigo";
  if (["fonte", "banco", "base", "referencia", "ref"].includes(t)) return "fonte";
  if (t.includes("unit")) return t.includes("unid") ? "unidade" : "valor_unitario";
  if (["descricao", "discriminacao", "insumo", "material", "servico", "nome", "especificacao"].some((s) => t.includes(s))) return "nome";
  if (t === "un" || ["unid", "und", "unidade"].some((s) => t.includes(s))) return "unidade";
  if (["quant", "qtd", "qtde"].some((s) => t.includes(s))) return "quantidade";
  if (t.includes("total")) return "valor_total";
  return null;
}

// Espelha PRECO_SOLTO da API: "PREÇO (R$)", "VALOR", "P.U." ao lado de uma coluna de total só pode ser o unitário.
const PRECO_SOLTO = new Set(["preco", "valor", "custo", "pu", "p u", "vl", "vlr"]);
const MOEDA = new Set(["r", "rs", "brl", "reais"]);
const precoSolto = (titulo: string) =>
  PRECO_SOLTO.has(
    semAcento(titulo)
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((p) => p && !MOEDA.has(p))
      .join(" "),
  );

// Espelha _referencia_do_topo da API: o topo da planilha diz de quando são os preços. Só linhas que falam de
// referência, para endereço ("Chácara 22") e "outros 12" não virarem data-base.
const BANCOS = ["sinapi", "sicro", "seinfra", "orse", "setop", "emop", "sudecap", "cpos", "fde", "agetop", "sbc"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const FALA_DE_REFERENCIA = new RegExp(`\\b(data|refer|base|tabela|preco|precos|mes)\\w*|\\b(${BANCOS.join("|")})\\b`);

function dataBaseDe(n: string): string | null {
  const porNome = new RegExp(`\\b(${MESES.join("|")})[a-z]*\\s*(\\d{4}|\\d{2})\\b`).exec(n.replace(/[/.-]/g, " "));
  if (porNome) {
    const ano = Number(porNome[2]) + (porNome[2]!.length === 2 ? 2000 : 0);
    return `${ano}-${String(MESES.indexOf(porNome[1]!) + 1).padStart(2, "0")}`;
  }
  const porNumero = /\b(0?[1-9]|1[0-2])\s*\/\s*(\d{4})\b/.exec(n);
  return porNumero ? `${porNumero[2]}-${porNumero[1]!.padStart(2, "0")}` : null;
}

export function referenciaDoTopo(linhas: string[]): { data_base: string | null; banco: string | null } {
  let data_base: string | null = null;
  let banco: string | null = null;
  for (const linha of linhas) {
    const n = semAcento(linha);
    if (!FALA_DE_REFERENCIA.test(n)) continue;
    data_base ??= dataBaseDe(n);
    const b: RegExpExecArray | null = banco === null ? new RegExp(`\\b(${BANCOS.join("|")})\\b`).exec(n) : null;
    if (b) banco = b[1]!.toUpperCase() + (/nao desonerad|sem desonera/.test(n) ? " não desonerado" : /desonerad/.test(n) ? " desonerado" : "");
  }
  return { data_base, banco };
}

export function lerPlanilhaDemo(texto: string, nomeArquivo: string): LeituraPlanilha {
  if (/\.xlsx?$/i.test(nomeArquivo)) throw new PlanilhaInvalida("Na demonstração só dá para importar CSV. Na plataforma de verdade, .xlsx também.");
  const g = lerCsv(texto);
  const cab = g.slice(0, 30).findIndex((l) => l.filter((c) => campoDoTitulo(c)).length >= 2);
  if (cab < 0) throw new PlanilhaInvalida("Não achei o cabeçalho (Descrição, Unidade, Quantidade…) nas 30 primeiras linhas.");
  const cabecalho = g[cab]!;
  const sugestao: Mapeamento = {
    planilha: "CSV",
    linha_cabecalho: cab + 1,
    item: null,
    codigo: null,
    fonte: null,
    nome: null,
    unidade: null,
    quantidade: null,
    valor_unitario: null,
    valor_total: null,
  };
  cabecalho.forEach((c, i) => {
    const k = campoDoTitulo(c);
    if (k && sugestao[k] === null) sugestao[k] = i;
  });
  if (sugestao.valor_unitario === null && sugestao.valor_total !== null) {
    const usadas = new Set(Object.values(sugestao));
    const i = cabecalho.findIndex((c, j) => !usadas.has(j) && precoSolto(c));
    if (i >= 0) sugestao.valor_unitario = i;
  }
  return {
    planilhas: ["CSV"],
    planilha: "CSV",
    linha_cabecalho: cab + 1,
    colunas: cabecalho.map((titulo, indice) => ({ indice, titulo })).filter((c) => c.titulo),
    amostra: g.slice(cab + 1, cab + 9),
    sugestao,
    // como na API: o mês no título da coluna vale antes do topo
    ...(() => {
      const topo = referenciaDoTopo(g.slice(0, cab).map((l) => l.filter(Boolean).join(" ")));
      return { data_base: cabecalho.map((c) => dataBaseDe(semAcento(c))).find(Boolean) ?? topo.data_base, banco: topo.banco };
    })(),
  };
}
