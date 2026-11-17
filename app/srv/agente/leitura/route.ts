/**
 * POST /leituras/comprovante no serviço do agente: a leitura do comprovante com IA. Uma resposta JSON só, no fim
 * (dezenas de segundos), com o mesmo Authorization do usuário: o agente lê e grava a leitura agindo por quem enviou.
 */
import { Conflito, NaoEncontrado } from "@/lib/demo/erros";
import { lerComprovanteDemo, usuarioDoAcesso } from "@/lib/demo/loja";
import { modoDemo, urlAgente } from "@/lib/servidor/config";
import { headersDeRepasse, json } from "@/lib/servidor/repasse";

// A leitura de uma foto com raciocínio pode passar de um minuto: o plano Hobby da Vercel permite até 300 s.
export const maxDuration = 300;

const AGENTE_DESLIGADO = "A leitura automática não está ligada nesta instalação. Preencha à mão.";

export async function POST(req: Request) {
  if (modoDemo()) return lerNaDemo(req);
  let r: Response;
  try {
    r = await fetch(`${urlAgente()}/leituras/comprovante`, {
      method: "POST",
      headers: headersDeRepasse(req),
      body: await req.arrayBuffer(),
      cache: "no-store",
    });
  } catch {
    return json({ detail: AGENTE_DESLIGADO }, 503);
  }
  if (r.status === 502 || r.status === 504) return json({ detail: AGENTE_DESLIGADO }, 503);
  return new Response(r.body, { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "application/json" } });
}

/** O tempo de uma leitura de verdade é de dezenas de segundos; a simulada espera um pouco para a tela mostrar o "lendo". */
const ESPERA_DEMO_MS = process.env.NODE_ENV === "test" ? 0 : 1800;

/** Na demonstração não há modelo: a leitura é simulada (lib/demo/gastos.ts), no mesmo esquema e com o mesmo efeito. */
async function lerNaDemo(req: Request): Promise<Response> {
  if (!usuarioDoAcesso(req.headers.get("authorization"))) return json({ detail: "Sessão expirada." }, 401);
  const corpo = (await req.json().catch(() => ({}))) as { comprovante_id?: unknown };
  if (typeof corpo.comprovante_id !== "string") return json({ detail: "Diga qual comprovante ler." }, 422);
  await new Promise((r) => setTimeout(r, ESPERA_DEMO_MS));
  try {
    return json(lerComprovanteDemo(corpo.comprovante_id), 200);
  } catch (x) {
    if (x instanceof NaoEncontrado) return json({ detail: x.message }, 404);
    if (x instanceof Conflito) return json({ detail: x.message }, 409);
    throw x;
  }
}
