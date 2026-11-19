/**
 * Os erros da demonstração, um por código HTTP do contrato. `responder()` os traduz para o status; ficam aqui (e não em
 * loja.ts) para os módulos da demo (gastos, loja) lançarem os mesmos sem se importarem uns aos outros.
 */
import "server-only";

/** 422: a regra de negócio recusou (o espelho, só para a demo, do `RegraViolada` do domínio da API). */
export class RegraViolada extends Error {}
export class NaoEncontrado extends Error {}
export class Conflito extends Error {}
export class Proibido extends Error {}
/** 413: o arquivo passa do limite do contrato. */
export class ArquivoGrande extends Error {}
