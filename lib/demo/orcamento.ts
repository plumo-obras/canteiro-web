/**
 * A leitura da planilha do orçamento na demonstração, com as regras de servicos/orcamento.py: cabeçalho detectado
 * pelos sinônimos, títulos e subtotais pulados, repetidos juntados e curva ABC pelo valor. Só CSV: o .xlsx precisa
 * da API (openpyxl), e a demonstração não fala com ela.
 */
import "server-only";
import type { CurvaABC, LeituraPlanilha, LinhaOrcamento, Mapeamento, PreviaOrcamento } from "../contrato";
import { lerQtd, lerReais } from "../formato";

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
  if (t.includes("saldo") || t.includes("estoque")) return "saldo";
  if (t.includes("curva") || t === "abc") return "curva";
  return null;
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
    saldo: null,
    curva: null,
  };
  cabecalho.forEach((c, i) => {
    const k = campoDoTitulo(c);
    if (k && sugestao[k] === null) sugestao[k] = i;
  });
  return {
    planilhas: ["CSV"],
    planilha: "CSV",
    linha_cabecalho: cab + 1,
    colunas: cabecalho.map((titulo, indice) => ({ indice, titulo })).filter((c) => c.titulo),
    amostra: g.slice(cab + 1, cab + 9),
    sugestao,
  };
}

const num = (t: string, f: (x: string) => number | null) => {
  // CSV exportado em formato inglês ("37.9") também aparece: ponto com 1–2 casas é decimal, como na API.
  const s = /^\d+\.\d{1,2}$/.test(t.trim()) ? t.trim().replace(".", ",") : t;
  return f(s);
};

export function previaDemo(texto: string, m: Mapeamento, existentes: { nome: string; unidade: string; precisa: number; valor: number }[]): PreviaOrcamento {
  if (m.nome === null || m.unidade === null || m.quantidade === null) throw new PlanilhaInvalida("Diga as colunas de descrição, unidade e quantidade.");
  const g = lerCsv(texto);
  const ignoradas: PreviaOrcamento["ignoradas"] = [];
  const erros: PreviaOrcamento["erros"] = [];
  const porChave = new Map<string, LinhaOrcamento & { _curvaColuna: CurvaABC | null }>();
  let juntadas = 0;
  g.slice(m.linha_cabecalho).forEach((l, i) => {
    const n = m.linha_cabecalho + i + 1;
    const cel = (k: number | null) => (k === null ? "" : (l[k] ?? "").trim());
    const nome = cel(m.nome).replace(/\s+/g, " ");
    const un = cel(m.unidade);
    const qt = cel(m.quantidade);
    if (!l.some((c) => c.trim())) return;
    if (!nome) return void ignoradas.push({ linha: n, texto: l.find((c) => c.trim()) ?? "", motivo: "sem descrição" });
    if (!un) return void ignoradas.push({ linha: n, texto: nome, motivo: "sem unidade (título ou subtotal?)" });
    const q = qt ? num(qt, lerQtd) : 0;
    if (q === 0) return void ignoradas.push({ linha: n, texto: nome, motivo: "sem quantidade" });
    if (q === null) return void erros.push({ linha: n, campo: "quantidade", mensagem: `'${qt}' não é um número.` });
    const vu = cel(m.valor_unitario);
    const vt = cel(m.valor_total);
    const unit = vu ? num(vu, lerReais) : null;
    const tot = vt ? num(vt, lerReais) : null;
    if (vu && unit === null) return void erros.push({ linha: n, campo: "valor_unitario", mensagem: `'${vu}' não é um valor.` });
    if (vt && tot === null) return void erros.push({ linha: n, campo: "valor_total", mensagem: `'${vt}' não é um valor.` });
    const cv = cel(m.curva).toUpperCase();
    if (cv && !["A", "B", "C"].includes(cv)) return void erros.push({ linha: n, campo: "curva", mensagem: "Curva tem de ser A, B ou C." });
    const valor = unit ?? (tot !== null ? Math.round((tot * 1000) / q) : 0);
    const k = nomeChave(nome);
    const ja = porChave.get(k);
    if (ja) {
      if (nomeChave(ja.unidade) !== nomeChave(un))
        return void erros.push({ linha: n, campo: "unidade", mensagem: `'${nome}' aparece em ${ja.unidade} na linha ${ja.linhas[0]} e em ${un} aqui.` });
      const totalAntes = Math.round((ja.quantidade * ja.valor_unitario) / 1000);
      ja.quantidade += q;
      ja.valor_unitario = Math.round(((totalAntes + Math.round((q * valor) / 1000)) * 1000) / ja.quantidade);
      ja.linhas.push(n);
      juntadas++;
      return;
    }
    const ex = existentes.find((x) => nomeChave(x.nome) === k);
    if (ex && nomeChave(ex.unidade) !== nomeChave(un))
      return void erros.push({ linha: n, campo: "unidade", mensagem: `'${nome}' já está cadastrado em ${ex.unidade}.` });
    porChave.set(k, {
      linhas: [n],
      nome,
      unidade: un,
      quantidade: q,
      valor_unitario: valor,
      total: 0,
      curva: "B",
      saldo: 0,
      situacao: ex ? "atualiza" : "novo",
      precisa_antes: ex?.precisa ?? null,
      valor_antes: ex?.valor ?? null,
      _curvaColuna: (cv || null) as CurvaABC | null,
    });
  });
  const linhas = [...porChave.values()];
  for (const l of linhas) l.total = Math.round((l.quantidade * l.valor_unitario) / 1000);
  const total = linhas.reduce((t, l) => t + l.total, 0);
  // ABC pelo valor: A até cobrir 80% (o item que cruza entra em A), B até 95%, o resto C.
  let acumulado = 0;
  for (const l of [...linhas].sort((a, b) => b.total - a.total)) {
    const antes = acumulado;
    acumulado += l.total;
    l.curva = l._curvaColuna ?? (!total ? "B" : !l.total ? "C" : antes < total * 0.8 ? "A" : antes < total * 0.95 ? "B" : "C");
  }
  return {
    aplicado: false,
    linhas: linhas.map(({ _curvaColuna: _, ...l }) => l),
    ignoradas,
    erros,
    total,
    novos: linhas.filter((l) => l.situacao === "novo").length,
    atualizados: linhas.filter((l) => l.situacao === "atualiza").length,
    juntadas,
  };
}
