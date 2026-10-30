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
import { VIDA_ACESSO_DEMO_S, entrarDemo, renovarDemo, sairDemo } from "@/lib/demo/loja";

const opcoesCookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: CAMINHO_COOKIE,
  maxAge: VIDA_COOKIE_S,
};

async function guardar(r: RespostaEntrar) {
  (await cookies()).set(COOKIE_RENOVACAO, r.renovacao, opcoesCookie);
  const expira_em = modoDemo() ? VIDA_ACESSO_DEMO_S : segundosAteVencer(r.acesso);
  return json({ acesso: r.acesso, usuario: r.usuario, expira_em });
}

async function limpar() {
  const jar = await cookies();
  jar.delete({ name: COOKIE_RENOVACAO, path: CAMINHO_COOKIE });
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
    const { email = "", senha = "" } = ((await req.json().catch(() => ({}))) ?? {}) as { email?: string; senha?: string };
    if (modoDemo()) {
      const r = entrarDemo(String(email), String(senha));
      return r ? guardar(r) : json({ detail: "Informe e-mail e senha." }, 401);
    }
    const r = await api(req, "entrar", { email, senha });
    if (!r.ok) return new Response(r.body, { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "application/json" } });
    return guardar((await r.json()) as RespostaEntrar);
  }

  if (acao === "renovar") {
    const renovacao = jar.get(COOKIE_RENOVACAO)?.value;
    if (!renovacao) return json({ detail: "Sem sessão." }, 401);
    if (modoDemo()) {
      const r = renovarDemo(renovacao);
      if (r) return guardar(r);
    } else {
      const r = await api(req, "renovar", { renovacao });
      if (r.ok) return guardar((await r.json()) as RespostaEntrar);
    }
    await limpar();
    return json({ detail: "Sua sessão acabou. Entre de novo." }, 401);
  }

  if (acao === "sair") {
    const renovacao = jar.get(COOKIE_RENOVACAO)?.value;
    if (modoDemo()) sairDemo(renovacao);
    else if (renovacao) await api(req, "sair", { renovacao }).catch(() => undefined);
    await limpar();
    return new Response(null, { status: 204 });
  }

  return json({ detail: "Não encontrado." }, 404);
}
