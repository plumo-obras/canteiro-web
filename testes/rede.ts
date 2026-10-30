/** fetch falso para os testes: rotas "MÉTODO /caminho" (sem a query) → resposta. Guarda as chamadas feitas. */
import { vi } from "vitest";

export type Rota = (req: { url: URL; init: RequestInit; corpo: unknown }) => Response | Promise<Response>;

export const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

/** Corpo SSE entregue em pedaços arbitrários, para provar que o leitor não depende de o evento chegar inteiro. */
export function sse(texto: string, tamanho = 7) {
  const enc = new TextEncoder();
  const pedacos: Uint8Array[] = [];
  for (let i = 0; i < texto.length; i += tamanho) pedacos.push(enc.encode(texto.slice(i, i + tamanho)));
  return new Response(
    new ReadableStream({
      pull(c) {
        const p = pedacos.shift();
        if (p) c.enqueue(p);
        else c.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}

export function criarRede(rotas: Record<string, Rota>) {
  const chamadas: { metodo: string; caminho: string; url: URL; init: RequestInit; corpo: unknown }[] = [];
  const f = vi.fn(async (entrada: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(entrada), "http://localhost");
    const metodo = (init.method ?? "GET").toUpperCase();
    const corpo = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    chamadas.push({ metodo, caminho: url.pathname, url, init, corpo });
    const r = rotas[`${metodo} ${url.pathname}`];
    if (!r) return json({ detail: `rota não simulada: ${metodo} ${url.pathname}` }, 404);
    return r({ url, init, corpo });
  });
  vi.stubGlobal("fetch", f);
  return { chamadas, fetch: f };
}

export const USUARIO = { id: "u-1", nome: "Rizzi", tenant_id: "t-1", papel: "admin" as const };
export const renovarOk = () => json({ acesso: "acesso-1", usuario: USUARIO, expira_em: 900 });
