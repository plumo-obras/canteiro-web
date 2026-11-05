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
let renovando: Promise<ResultadoRenovacao> | null = null;
let relogio: ReturnType<typeof setTimeout> | null = null;
// Quando o acesso atual vence (ms, relógio local): a aba que volta a ficar visível decide por ele se renova na hora.
let venceEm = 0;
let ouvindoVisibilidade = false;
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

// Antecedência da renovação proativa: um minuto antes de o acesso vencer.
const ANTECEDENCIA_MS = 60_000;

const abaOculta = () => typeof document !== "undefined" && document.visibilityState === "hidden";

/**
 * Aba em segundo plano não renova pelo relógio. O navegador segura o timer de aba oculta e o solta no instante em que
 * ela volta — justamente quando a pessoa recarrega ou navega —, e a renovação que fica no ar nessa hora é a que o
 * servidor troca sem o navegador guardar o cookie novo. Oculta, a aba deixa para renovar quando voltar a aparecer
 * (e, enquanto isso, um 401 numa chamada renova como sempre).
 */
function aoMudarVisibilidade() {
  if (!abaOculta() && estado && Date.now() >= venceEm - ANTECEDENCIA_MS) void renovar();
}

function vigiarVisibilidade() {
  if (ouvindoVisibilidade || typeof document === "undefined") return;
  ouvindoVisibilidade = true;
  document.addEventListener("visibilitychange", aoMudarVisibilidade);
}

function guardar(r: RespostaSessao) {
  estado = { acesso: r.acesso, usuario: r.usuario ?? estado?.usuario ?? null };
  venceEm = Date.now() + r.expira_em * 1000;
  if (relogio) clearTimeout(relogio);
  // Renova um minuto antes de vencer; se a aba dormir e perder a hora, o 401 da próxima chamada renova do mesmo jeito.
  const ms = Math.max(5_000, r.expira_em * 1000 - ANTECEDENCIA_MS);
  relogio = setTimeout(() => {
    if (!abaOculta()) void renovar();
  }, ms);
  vigiarVisibilidade();
  avisar();
}

export function limparSessao() {
  estado = null;
  if (relogio) clearTimeout(relogio);
  relogio = null;
  avisar();
}

async function lerErro(r: Response, padrao = "Não foi possível entrar."): Promise<string> {
  try {
    const j = (await r.json()) as { detail?: unknown; mensagem?: unknown };
    if (typeof j.mensagem === "string") return j.mensagem;
    if (typeof j.detail === "string") return j.detail;
  } catch {
    /* corpo vazio ou não-JSON */
  }
  return r.status === 429 ? "Muitas tentativas. Espere um pouco e tente de novo." : padrao;
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

/** "negado": a API recusou a renovação, a sessão acabou. "falha": rede ou servidor fora; a sessão pode estar viva. */
export type ResultadoRenovacao = "ok" | "negado" | "falha";

/** Quanto esperar depois de um 409 da renovação: tempo para a renovação que está no ar gravar o cookie novo. */
export const ESPERA_RENOVACAO_EM_ANDAMENTO_MS = 1500;

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

async function trocarUmaVez(): Promise<ResultadoRenovacao | "em_andamento"> {
  try {
    // keepalive: a renovação que começou logo antes de uma recarga termina mesmo com a página indo embora, e o
    // Set-Cookie dela chega ao navegador; sem isso o servidor trocaria o token e o cookie ficaria com o velho.
    const r = await fetch("/srv/auth/renovar", { method: "POST", headers: CABECALHO_CSRF, keepalive: true });
    if (r.status === 401 || r.status === 403) {
      limparSessao();
      return "negado";
    }
    // 409: o cookie que mandamos já foi trocado há instantes por outra renovação (a da página anterior) cujo
    // cookie novo ainda está chegando. Não é sessão acabada.
    if (r.status === 409) return "em_andamento";
    if (!r.ok) return "falha"; // API acordando ou fora: não derruba a sessão, a próxima tentativa resolve
    guardar((await r.json()) as RespostaSessao);
    return "ok";
  } catch {
    return "falha"; // rede caiu: mantém o estado; a próxima chamada tenta de novo
  }
}

async function trocar(): Promise<ResultadoRenovacao> {
  const primeira = await trocarUmaVez();
  if (primeira !== "em_andamento") return primeira;
  // Uma nova tentativa só, já com o cookie gravado pela renovação que estava no ar. Se ainda vier 409, fica como
  // "falha" (a sessão pode estar viva; quem chamou tenta de novo mais tarde) — 401 continua encerrando.
  await esperar(ESPERA_RENOVACAO_EM_ANDAMENTO_MS);
  const segunda = await trocarUmaVez();
  return segunda === "em_andamento" ? "falha" : segunda;
}

/**
 * Troca o par pelo cookie. Uma renovação por vez nesta aba (várias chamadas com 401 esperam a mesma) e entre abas:
 * o cookie é um só, e duas abas renovando com ele ao mesmo tempo fazem a API ver o token reusado e derrubar a sessão.
 * Quem espera o lock renova depois, já com o cookie que a outra aba acabou de gravar.
 */
export function renovarSessao(): Promise<ResultadoRenovacao> {
  renovando ??= (async () => {
    try {
      const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
      return locks ? await locks.request("canteiro-renovacao", trocar) : await trocar();
    } finally {
      renovando = null;
    }
  })();
  return renovando;
}

export const renovar = async (): Promise<boolean> => (await renovarSessao()) === "ok";

/** Mesmo lock da renovação: a troca de senha também substitui o cookie. */
const LOCK_COOKIE = "canteiro-renovacao";

/**
 * Troca a própria senha. A API derruba todas as sessões, inclusive esta, e devolve uma nova: guardá-la aqui é o que
 * mantém a pessoa logada neste aparelho.
 *
 * Não usa comAcesso: lá um 401 renova e REPETE, e repetir uma senha atual errada gastaria duas tentativas do limite.
 * Aqui só se repete quando o Next marca o 401 como acesso vencido (`sessao_expirada`); senha errada volta como erro.
 * Roda dentro do lock entre abas porque troca o cookie: uma renovação de outra aba no meio gravaria por cima o token
 * de uma família que a troca acabou de derrubar.
 */
export async function trocarSenha(atual: string, nova: string): Promise<{ ok: true } | { ok: false; mensagem: string }> {
  const umaVez = async () => {
    const acesso = acessoAtual();
    const enviar = () =>
      fetch("/srv/auth/senha", {
        method: "POST",
        headers: { "content-type": "application/json", ...CABECALHO_CSRF, ...(acesso ? { authorization: `Bearer ${acesso}` } : {}) },
        body: JSON.stringify({ senha_atual: atual, senha_nova: nova }),
      });
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    const r = locks ? await locks.request(LOCK_COOKIE, enviar) : await enviar();
    const corpo = r.ok ? null : ((await r.clone().json().catch(() => ({}))) as { sessao_expirada?: boolean });
    return { r, expirada: r.status === 401 && !!corpo?.sessao_expirada };
  };
  try {
    if (!acessoAtual() && !(await renovar())) return { ok: false, mensagem: "Sua sessão acabou. Entre de novo." };
    const primeira = await umaVez();
    let r = primeira.r;
    if (primeira.expirada) {
      if (!(await renovar())) return { ok: false, mensagem: "Sua sessão acabou. Entre de novo." };
      r = (await umaVez()).r;
    }
    if (!r.ok) return { ok: false, mensagem: await lerErro(r, "Não foi possível trocar a senha. Tente de novo.") };
    guardar((await r.json()) as RespostaSessao);
    return { ok: true };
  } catch {
    return { ok: false, mensagem: "Não foi possível falar com o servidor. Tente de novo." };
  }
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
