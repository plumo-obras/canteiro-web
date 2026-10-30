/** Repasse das rotas de dados do contrato para a API central (ou para a demonstração). */
import { modoDemo, urlApi } from "@/lib/servidor/config";
import { caminhoPermitido, headersDeRepasse, json } from "@/lib/servidor/repasse";
import { responder, usuarioDoAcesso } from "@/lib/demo/loja";

async function repassar(req: Request, ctx: { params: Promise<{ caminho: string[] }> }) {
  const { caminho } = await ctx.params;
  if (!caminhoPermitido(caminho, req.method)) return json({ detail: "Rota fora do contrato." }, 404);
  const url = new URL(req.url);
  const temCorpo = req.method === "POST" || req.method === "PUT";

  if (modoDemo()) {
    const u = usuarioDoAcesso(req.headers.get("authorization"));
    if (!u) return json({ detail: "Sessão expirada." }, 401);
    const corpo = temCorpo ? await req.json().catch(() => ({})) : undefined;
    const r = responder(req.method, caminho, url.searchParams, corpo, u);
    return json(r.corpo, r.status);
  }

  const destino = `${urlApi()}/${caminho.map(encodeURIComponent).join("/")}${url.search}`;
  const r = await fetch(destino, {
    method: req.method,
    headers: headersDeRepasse(req),
    body: temCorpo ? await req.arrayBuffer() : undefined,
    cache: "no-store",
    redirect: "manual",
  });
  return new Response(r.body, {
    status: r.status,
    headers: { "content-type": r.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
  });
}

export const GET = repassar;
export const POST = repassar;
export const PUT = repassar;
export const DELETE = repassar;
