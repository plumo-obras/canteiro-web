/**
 * Utilidades das rotas /srv/*: o Next é a única origem que o navegador conhece; daqui o pedido segue para a API ou o
 * agente (ou para a demonstração). Mantém a API sem CORS e o cookie de renovação fora do alcance do JavaScript.
 */

/** Rotas de dados do contrato que a web pode repassar. /auth fica nas rotas próprias; /uso é só do serviço do agente. */
const PREFIXOS = new Set(["obras", "pedidos", "propostas", "registro", "creditos", "sessoes"]);

/** Recusa caminho fora do contrato e qualquer truque de "..", barra codificada ou segmento vazio. */
export function caminhoPermitido(seg: string[]): boolean {
  if (!seg.length || !PREFIXOS.has(seg[0]!)) return false;
  return seg.every((s) => s.length > 0 && s !== "." && s !== ".." && !/[/\\?#]/.test(s));
}

/**
 * Proteção de CSRF para as rotas que usam o cookie: além do SameSite=Strict, exige o header próprio (pedido de outra
 * origem com header customizado precisa de preflight, que o Next não autoriza) e, se houver Origin, a mesma origem.
 */
export function origemConfiavel(req: Request): boolean {
  if (req.headers.get("x-canteiro") !== "1") return false;
  const origem = req.headers.get("origin");
  if (!origem) return true;
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return new URL(origem).host === host;
  } catch {
    return false;
  }
}

/** Segundos até o JWT vencer, pelo `exp`. Só para agendar a renovação: autorização é sempre da API. */
export function segundosAteVencer(acesso: string, padrao = 15 * 60): number {
  const meio = acesso.split(".")[1];
  if (!meio) return padrao;
  try {
    const { exp } = JSON.parse(Buffer.from(meio, "base64url").toString("utf8")) as { exp?: number };
    return typeof exp === "number" ? Math.max(0, Math.floor(exp - Date.now() / 1000)) : padrao;
  } catch {
    return padrao;
  }
}

/**
 * Headers que seguem para a API: só o necessário (nada de cookie do Next). O X-Forwarded-For vai junto para o limite de
 * tentativas por IP; a API só confia nele porque o IP deste Next está em TRUSTED_PROXIES do lado dela.
 */
export function headersDeRepasse(req: Request): Headers {
  const h = new Headers();
  for (const k of ["authorization", "content-type", "accept"]) {
    const v = req.headers.get(k);
    if (v) h.set(k, v);
  }
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip");
  if (ip) h.set("x-forwarded-for", ip);
  return h;
}

export const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
