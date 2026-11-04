/**
 * GET /srv/saude: o HEALTHCHECK do contêiner. Só diz que o servidor do Next responde; não chama a API nem o agente,
 * para a API fora do ar (ou acordando no plano gratuito) não derrubar a web junto, e o teste sair barato a cada 30 s.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
