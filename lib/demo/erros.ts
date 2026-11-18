/**
 * Os erros da demonstração, um por código HTTP do contrato. `responder()` os traduz para o status; ficam aqui (e não em
 * loja.ts) para os módulos da demo (gastos, loja) lançarem os mesmos sem se importarem uns aos outros.
 */
import "server-only";

export { RegraViolada } from "./regras-espelho";
export class NaoEncontrado extends Error {}
export class Conflito extends Error {}
export class Proibido extends Error {}
/** 413: o arquivo passa do limite do contrato. */
export class ArquivoGrande extends Error {}
