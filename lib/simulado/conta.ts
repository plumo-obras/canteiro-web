// SIMULADO: sem API ainda — trocar por PATCH /conta (nome do usuário)
/**
 * "Editar nome" da Conta: o protótipo tem o botão, a API ainda não tem a rota. A tela muda só o nome mostrado ali,
 * avisa que é prévia e nada sai do navegador; ao recarregar, volta o nome que a API devolve.
 */
export { AVISO_PREVIA } from "./aviso";

/** O que a tela recusa antes de mostrar a prévia (a mesma ideia da validação de nome do cadastro). */
export function problemaNoNome(nome: string): string | null {
  const n = nome.trim();
  if (!n) return "Informe o nome.";
  if (n.length > 120) return "Nome longo demais (até 120 caracteres).";
  return null;
}
