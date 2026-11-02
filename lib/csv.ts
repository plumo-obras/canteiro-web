/**
 * CSV para o Excel brasileiro: separador ";", decimal com vírgula e BOM UTF-8 (sem ele o Excel lê "Fundações" como
 * "FundaÃ§Ãµes"). Dinheiro sai sem "R$" nem ponto de milhar, para a célula virar número.
 */

/** 2035001,58 a partir de centavos. */
export const centavosCsv = (c: number) => {
  const s = c < 0 ? "-" : "";
  const a = Math.abs(Math.trunc(c));
  return `${s}${Math.floor(a / 100)},${String(a % 100).padStart(2, "0")}`;
};

const celula = (v: string | number) => {
  const t = String(v);
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

export function gerarCsv(linhas: (string | number)[][]): string {
  return "﻿" + linhas.map((l) => l.map(celula).join(";")).join("\r\n") + "\r\n";
}

/** Baixa o texto como arquivo, no navegador. */
export function baixarCsv(nome: string, texto: string) {
  const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
