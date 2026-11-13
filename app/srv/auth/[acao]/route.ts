/**
 * Login próprio: o Next conversa com POST /auth/* da API e guarda a renovação num cookie httpOnly. O navegador recebe
 * só o acesso (curto, fica em memória) e os dados de exibição do usuário.
 */
import { cookies } from "next/headers";
import type { RespostaEntrar } from "@/lib/contrato";
import {
  CAMINHO_COOKIE,
  COOKIE_RENOVACAO,
  VIDA_COOKIE_S,
  modoDemo,
  urlApi,
} from "@/lib/servidor/config";
import { headersDeRepasse, json, origemConfiavel, segundosAteVencer } from "@/lib/servidor/repasse";
import { VIDA_ACESSO_DEMO_S, entrarDemo, renovarDemo, sairDemo, trocarSenhaDemo } from "@/lib/demo/loja";

const opcoesCookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: CAMINHO_COOKIE,
  maxAge: VIDA_COOKIE_S,
};

/**
 * "Manter conectado" desmarcado: o cookie de renovação vira cookie de sessão (sem maxAge, some ao fechar o navegador).
 * A marca fica num cookie irmão para as renovações seguintes continuarem curtas — sem ela, a primeira renovação
 * devolveria os 30 dias.
 */
const COOKIE_CURTA = `${COOKIE_RENOVACAO}_curta`;
const { maxAge: _vida, ...opcoesSessao } = opcoesCookie;

async function guardar(r: RespostaEntrar, curta?: boolean) {
  const jar = await cookies();
  const sessao = curta ?? jar.get(COOKIE_CURTA)?.value === "1";
  if (sessao) {
    jar.set(COOKIE_RENOVACAO, r.renovacao, opcoesSessao);
    jar.set(COOKIE_CURTA, "1", opcoesSessao);
  } else {
    jar.set(COOKIE_RENOVACAO, r.renovacao, opcoesCookie);
    if (jar.get(COOKIE_CURTA)) jar.delete({ name: COOKIE_CURTA, path: CAMINHO_COOKIE });
  }
  const expira_em = modoDemo() ? VIDA_ACESSO_DEMO_S : segundosAteVencer(r.acesso);
  return json({ acesso: r.acesso, usuario: r.usuario, expira_em });
}

async function limpar() {
  const jar = await cookies();
  jar.delete({ name: COOKIE_RENOVACAO, path: CAMINHO_COOKIE });
  jar.delete({ name: COOKIE_CURTA, path: CAMINHO_COOKIE });
}

async function api(req: Request, rota: string, corpo: unknown) {
  const h = headersDeRepasse(req);
  h.set("content-type", "application/json");
  return fetch(`${urlApi()}/auth/${rota}`, { method: "POST", headers: h, body: JSON.stringify(corpo), cache: "no-store" });
}

export async function POST(req: Request, ctx: { params: Promise<{ acao: string }> }) {
  const { acao } = await ctx.params;
  if (!origemConfiavel(req)) return json({ detail: "Origem não permitida." }, 403);
  const jar = await cookies();

  if (acao === "entrar") {
    const { email = "", senha = "", manter } = ((await req.json().catch(() => ({}))) ?? {}) as { email?: string; senha?: string; manter?: unknown };
    // só um "false" explícito encurta: cliente antigo (sem o campo) continua com os 30 dias
    const curta = manter === false;
    if (modoDemo()) {
      const r = entrarDemo(String(email), String(senha));
      return r ? guardar(r, curta) : json({ detail: "Informe e-mail e senha." }, 401);
    }
    const r = await api(req, "entrar", { email, senha });
    if (!r.ok) return new Response(r.body, { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "application/json" } });
    return guardar((await r.json()) as RespostaEntrar, curta);
  }

  if (acao === "renovar") {
    const renovacao = jar.get(COOKIE_RENOVACAO)?.value;
    if (!renovacao) return json({ detail: "Sem sessão." }, 401);
    if (modoDemo()) {
      const r = renovarDemo(renovacao);
      if (r) return guardar(r);
    } else {
      const r = await api(req, "renovar", { renovacao }).catch(() => null);
      if (r?.ok) return guardar((await r.json()) as RespostaEntrar);
      // 409: este cookie já foi trocado segundos atrás por uma renovação que ainda não gravou o cookie novo (recarga de
      // página com a renovação no ar). A sessão está viva; o navegador espera e tenta de novo com o cookie que chegar.
      if (r?.status === 409) return json({ detail: "Renovação em andamento; tente de novo." }, 409);
      // Só a recusa da API encerra a sessão. Erro de servidor ou de rede (a API acordando no Render, por exemplo)
      // deixa o cookie onde está, para a próxima tentativa.
      if (!r || (r.status !== 401 && r.status !== 403)) return json({ detail: "Não foi possível falar com o servidor." }, 503);
    }
    await limpar();
    return json({ detail: "Sua sessão acabou. Entre de novo." }, 401);
  }

  if (acao === "senha") return trocarSenha(req);

  if (acao === "sair") {
    const renovacao = jar.get(COOKIE_RENOVACAO)?.value;
    if (modoDemo()) sairDemo(renovacao);
    else if (renovacao) await api(req, "sair", { renovacao }).catch(() => undefined);
    await limpar();
    return new Response(null, { status: 204 });
  }

  return json({ detail: "Não encontrado." }, 404);
}

/** Respostas da troca de senha que a tela mostra como vieram (a mensagem da API já é para a pessoa). */
const REPASSA_SENHA = new Set([401, 403, 409, 422, 429]);

/**
 * Troca de senha: autenticada pelo acesso (Authorization), não pelo cookie, mas devolve uma sessão nova e por isso
 * grava o cookie como o entrar — a API derruba todas as famílias de renovação, inclusive a deste navegador.
 *
 * Nenhuma recusa apaga o cookie: senha atual errada (401), regra da senha nova (422) e limite (429) não podem
 * desconectar ninguém. Quando o 401 é do acesso vencido (a API manda WWW-Authenticate; o da senha errada não), a
 * resposta leva `sessao_expirada` para o navegador renovar e tentar de novo, sem confundir com a senha errada.
 */
async function trocarSenha(req: Request) {
  const lido = ((await req.json().catch(() => ({}))) ?? {}) as { senha_atual?: unknown; senha_nova?: unknown };
  const corpo = { senha_atual: String(lido.senha_atual ?? ""), senha_nova: String(lido.senha_nova ?? "") };
  if (modoDemo()) {
    const r = trocarSenhaDemo(req.headers.get("authorization"), corpo.senha_atual, corpo.senha_nova);
    if (!("detail" in r)) return guardar(r);
    const { status, ...recusa } = r;
    return json(recusa, status);
  }
  if (!req.headers.get("authorization")) return json({ detail: "Entre para continuar.", sessao_expirada: true }, 401);
  const r = await api(req, "senha", corpo).catch(() => null);
  if (r?.ok) return guardar((await r.json()) as RespostaEntrar);
  if (!r || !REPASSA_SENHA.has(r.status)) return json({ detail: "Não foi possível falar com o servidor." }, 503);
  const recusa = (await r.json().catch(() => ({}))) as { detail?: unknown };
  const detail = typeof recusa.detail === "string" ? recusa.detail : "Não foi possível trocar a senha.";
  const expirada = r.status === 401 && r.headers.has("www-authenticate");
  return json(expirada ? { detail, sessao_expirada: true } : { detail }, r.status);
}
