/**
 * Sessão de login no navegador. O token de acesso vive só na memória desta aba (nunca em localStorage, que qualquer
 * script injetado leria); a renovação fica num cookie httpOnly que só as rotas /srv/auth/* do próprio Next enxergam.
 * Ao recarregar a página, a memória some e a sessão volta pelo cookie (renovar).
 */
import type { Usuario } from "./contrato";

export interface RespostaSessao {
  acesso: string;
  usuario: Usuario | null;
  expira_em: number; // segundos até o acesso vencer
}

interface Estado {
  acesso: string;
  usuario: Usuario | null;
}

let estado: Estado | null = null;
let renovando: Promise<boolean> | null = null;
let relogio: ReturnType<typeof setTimeout> | null = null;
const ouvintes = new Set<() => void>();

// Header próprio obriga o navegador a fazer preflight em pedido de outra origem: proteção extra contra CSRF nas
// rotas que usam o cookie de renovação (além do SameSite=Strict).
export const CABECALHO_CSRF = { "x-canteiro": "1" } as const;

function avisar() {
  ouvintes.forEach((f) => f());
}

export function assinarSessao(f: () => void) {
  ouvintes.add(f);
  return () => {
    ouvintes.delete(f);
  };
}

export const usuarioAtual = () => estado?.usuario ?? null;
export const acessoAtual = () => estado?.acesso ?? null;

function guardar(r: RespostaSessao) {
  estado = { acesso: r.acesso, usuario: r.usuario ?? estado?.usuario ?? null };
  if (relogio) clearTimeout(relogio);
  // Renova um minuto antes de vencer; se a aba dormir e perder a hora, o 401 da próxima chamada renova do mesmo jeito.
  const ms = Math.max(5, r.expira_em - 60) * 1000;
  relogio = setTimeout(() => void renovar(), ms);
  avisar();
}

export function limparSessao() {
  estado = null;
  if (relogio) clearTimeout(relogio);
  relogio = null;
  avisar();
}

async function lerErro(r: Response): Promise<string> {
  try {
    const j = (await r.json()) as { detail?: unknown; mensagem?: unknown };
    if (typeof j.mensagem === "string") return j.mensagem;
    if (typeof j.detail === "string") return j.detail;
  } catch {
    /* corpo vazio ou não-JSON */
  }
  return r.status === 429 ? "Muitas tentativas. Espere um pouco e tente de novo." : "Não foi possível entrar.";
}

export async function entrar(email: string, senha: string): Promise<{ ok: true } | { ok: false; mensagem: string }> {
  const r = await fetch("/srv/auth/entrar", {
    method: "POST",
    headers: { "content-type": "application/json", ...CABECALHO_CSRF },
    body: JSON.stringify({ email, senha }),
  });
  if (!r.ok) return { ok: false, mensagem: r.status === 401 ? "E-mail ou senha não conferem." : await lerErro(r) };
  guardar((await r.json()) as RespostaSessao);
  return { ok: true };
}

/** Troca o par pelo cookie. Uma renovação por vez: várias chamadas com 401 ao mesmo tempo esperam a mesma. */
export function renovar(): Promise<boolean> {
  renovando ??= (async () => {
    try {
      const r = await fetch("/srv/auth/renovar", { method: "POST", headers: CABECALHO_CSRF });
      if (!r.ok) {
        limparSessao();
        return false;
      }
      guardar((await r.json()) as RespostaSessao);
      return true;
    } catch {
      return false; // rede caiu: mantém o estado; a próxima chamada tenta de novo
    } finally {
      renovando = null;
    }
  })();
  return renovando;
}

export async function sair() {
  const acesso = acessoAtual();
  limparSessao();
  await fetch("/srv/auth/sair", {
    method: "POST",
    headers: { ...CABECALHO_CSRF, ...(acesso ? { authorization: `Bearer ${acesso}` } : {}) },
  }).catch(() => undefined);
}

/**
 * fetch com o acesso. Num 401, renova uma vez e repete; se a renovação falhar, a sessão acabou (a casca volta ao login).
 */
export async function comAcesso(url: string, init: RequestInit = {}): Promise<Response> {
  let usado: string | null = null;
  const tentar = () => {
    const h = new Headers(init.headers);
    usado = acessoAtual();
    if (usado) h.set("authorization", `Bearer ${usado}`);
    return fetch(url, { ...init, headers: h });
  };
  if (!acessoAtual()) await renovar();
  const r = await tentar();
  if (r.status !== 401) return r;
  // Outra chamada já renovou enquanto esta voava com o acesso velho: basta repetir, sem gastar outra renovação.
  if (acessoAtual() && acessoAtual() !== usado) return tentar();
  return (await renovar()) ? tentar() : r;
}
