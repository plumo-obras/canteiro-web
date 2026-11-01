/**
 * Fica fora do componente "use client": o layout (server component) importa o script como texto, e o que vem de um
 * módulo de cliente chega ao servidor como referência, não como valor.
 */
export const CHAVE_TEMA = "plumo.tema";

/** Roda inline no <head>, antes da primeira pintura: autocontido e sem poder falhar. Escuro é o padrão. */
export const SCRIPT_TEMA = `try{var t=localStorage.getItem("${CHAVE_TEMA}");document.documentElement.dataset.tema=t==="claro"?"claro":"escuro"}catch(e){document.documentElement.dataset.tema="escuro"}`;
