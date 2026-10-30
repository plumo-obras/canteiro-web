/**
 * POST /conversa em SSE. Repassa o fluxo do serviço do agente sem bufferizar (cada evento chega à tela na hora) e com
 * o mesmo Authorization do usuário: o agente age com o token de quem pergunta.
 */
import { modoDemo, urlAgente } from "@/lib/servidor/config";
import { headersDeRepasse, json } from "@/lib/servidor/repasse";
import { usuarioDoAcesso } from "@/lib/demo/loja";
import { emSSE, roteiroDemo } from "@/lib/demo/agente";

// A conversa pode levar mais que o padrão: o plano Hobby da Vercel (Fluid Compute) permite até 300 s.
export const maxDuration = 300;

const CABECALHOS_SSE = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  "x-accel-buffering": "no",
};

export async function POST(req: Request) {
  if (modoDemo()) {
    const u = usuarioDoAcesso(req.headers.get("authorization"));
    if (!u) return json({ detail: "Sessão expirada." }, 401);
    const corpo = (await req.json().catch(() => ({}))) as Parameters<typeof roteiroDemo>[0];
    const it = roteiroDemo(corpo, u);
    const enc = new TextEncoder();
    const fluxo = new ReadableStream<Uint8Array>({
      async pull(ctl) {
        const { done, value } = await it.next();
        if (done) ctl.close();
        else ctl.enqueue(enc.encode(emSSE(value)));
      },
      async cancel() {
        await it.return(undefined);
      },
    });
    return new Response(fluxo, { headers: CABECALHOS_SSE });
  }

  const h = headersDeRepasse(req);
  h.set("accept", "text/event-stream");
  const r = await fetch(`${urlAgente()}/conversa`, {
    method: "POST",
    headers: h,
    body: await req.arrayBuffer(),
    cache: "no-store",
    signal: req.signal, // a pessoa clicou em Parar ou fechou a aba: o agente para de gastar token
  });
  if (!r.ok || !r.body) {
    return new Response(r.body, { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "application/json" } });
  }
  return new Response(r.body, { headers: CABECALHOS_SSE });
}
