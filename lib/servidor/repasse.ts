/**
 * Utilidades das rotas /srv/*: o Next é a única origem que o navegador conhece; daqui o pedido segue para a API ou o
 * agente (ou para a demonstração). Mantém a API sem CORS e o cookie de renovação fora do alcance do JavaScript.
 */

/**
 * Rotas de dados do contrato que a web pode repassar, por método. /auth fica nas rotas próprias. A conta e o consumo só
 * se leem daqui; a única escrita fora de GET/POST é a chave própria da Anthropic (o papel master quem confere é a API).
 */
const PREFIXOS = new Set(["obras", "pedidos", "propostas", "registro", "creditos", "sessoes"]);
const SO_LEITURA = new Set(["conta", "conta/chave-anthropic", "uso"]);
const CHAVE = "conta/chave-anthropic";

/** Recusa caminho ou método fora do contrato e qualquer truque de "..", barra codificada ou segmento vazio. */
export function caminhoPermitido(seg: string[], metodo = "GET"): boolean {
  if (!seg.length || !seg.every((s) => s.length > 0 && s !== "." && s !== ".." && !/[/\\?#]/.test(s))) return false;
  const rota = seg.join("/");
  const m = metodo.toUpperCase();
  if (m === "PUT" || m === "DELETE") return rota === CHAVE;
  if (SO_LEITURA.has(rota)) return m === "GET";
  return (m === "GET" || m === "POST") && PREFIXOS.has(seg[0]!);
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
 * tentativas por IP; a API só confia nele porque o IP deste Next está em TRUSTED_PROXIES do lado dela (local) ou pelo
 * segredo PROXY_SEGREDO (Vercel).
 */
export function headersDeRepasse(req: Request): Headers {
  const h = new Headers();
  for (const k of ["authorization", "content-type", "accept"]) {
    const v = req.headers.get(k);
    if (v) h.set(k, v);
  }
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip");
  if (ip) h.set("x-forwarded-for", ip);
  // Na Vercel não há IP fixo para a API listar em TRUSTED_PROXIES: o Next se identifica pelo segredo compartilhado e
  // informa o IP do visitante. A Vercel sobrescreve x-real-ip/x-forwarded-for, então o visitante não consegue forjá-los.
  const segredo = process.env.PROXY_SEGREDO;
  if (segredo) {
    const visitante = (req.headers.get("x-real-ip") ?? ip?.split(",")[0] ?? "").trim();
    h.set("x-canteiro-proxy", segredo);
    if (visitante) h.set("x-canteiro-ip-cliente", visitante);
  }
  return h;
}

export const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
