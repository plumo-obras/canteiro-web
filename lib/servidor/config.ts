/**
 * Configuração do servidor do Next. Só variáveis de ambiente (o repositório é público: nada de URL interna ou segredo
 * em arquivo). Este módulo nunca vai para o navegador.
 */
import "server-only";

export const modoDemo = () => ["1", "true", "sim"].includes((process.env.CANTEIRO_DEMO ?? "").toLowerCase());

function url(nome: "API_URL" | "AGENTE_URL"): string {
  const v = process.env[nome];
  if (!v) throw new Error(`${nome} não configurada. Defina ${nome} ou ligue CANTEIRO_DEMO=1.`);
  return v.replace(/\/+$/, "");
}

export const urlApi = () => url("API_URL");
export const urlAgente = () => url("AGENTE_URL");

export const COOKIE_RENOVACAO = "canteiro_renovacao";
// Só as rotas de login recebem o cookie: as chamadas de dados nem o carregam.
export const CAMINHO_COOKIE = "/srv/auth";
// A renovação vence no servidor; o cookie só precisa durar o suficiente para não ser ele o limite.
export const VIDA_COOKIE_S = 30 * 24 * 3600;
