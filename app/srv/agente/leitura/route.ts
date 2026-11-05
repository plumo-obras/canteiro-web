/**
 * POST /leituras/comprovante no serviço do agente: a leitura do comprovante com IA. Uma resposta JSON só, no fim
 * (dezenas de segundos), com o mesmo Authorization do usuário: o agente lê e grava a leitura agindo por quem enviou.
 */
import { modoDemo, urlAgente } from "@/lib/servidor/config";
import { headersDeRepasse, json } from "@/lib/servidor/repasse";

// A leitura de uma foto com raciocínio pode passar de um minuto: o plano Hobby da Vercel permite até 300 s.
export const maxDuration = 300;

const AGENTE_DESLIGADO = "A leitura automática não está ligada nesta instalação. Preencha à mão.";

export async function POST(req: Request) {
  if (modoDemo()) return json({ detail: "A leitura automática não roda na demonstração." }, 503);
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
