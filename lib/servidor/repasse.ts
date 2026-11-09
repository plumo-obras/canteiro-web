/**
 * Utilidades das rotas /srv/*: o Next é a única origem que o navegador conhece; daqui o pedido segue para a API ou o
 * agente (ou para a demonstração). Mantém a API sem CORS e o cookie de renovação fora do alcance do JavaScript.
 */
import "server-only";

/**
 * Rotas de dados do contrato que a web pode repassar, por método. /auth fica nas rotas próprias. A conta e o consumo só
 * se leem daqui; fora de GET/POST, só a chave própria da Anthropic (o papel master quem confere é a API) e o PATCH dos
 * dados de uma obra, de um pedido (previsão, observação), de um fornecedor, de uma etapa extra, de um tópico e a etapa
 * de um gasto (e a natureza fiscal dele, PATCH /gastos/{id}/fiscal), e o de um item do orçamento; o PUT do
 * cronograma da obra. Os tributos da obra se leem por GET /obras/{id}/tributos. A leitura de comprovante pela IA (`/interno/...`) é do agente, nunca do navegador.
 */
const PREFIXOS = new Set([
  "obras", "pedidos", "fornecedores", "propostas", "registro", "creditos", "sessoes", "comprovantes", "etapas-extras", "topicos",
]);
// gastos: só o PATCH /gastos/{id} (mudar a etapa); a leitura dos gastos é por /obras/{id}/gastos
const EDITAVEIS = new Set(["obras", "pedidos", "fornecedores", "etapas-extras", "topicos", "gastos"]);
const SO_LEITURA = new Set(["conta", "conta/chave-anthropic", "uso"]);
const CHAVE = "conta/chave-anthropic";

/** Recusa caminho ou método fora do contrato e qualquer truque de "..", barra codificada ou segmento vazio. */
export function caminhoPermitido(seg: string[], metodo = "GET"): boolean {
  if (!seg.length || !seg.every((s) => s.length > 0 && s !== "." && s !== ".." && !/[/\\?#]/.test(s))) return false;
  const rota = seg.join("/");
  const m = metodo.toUpperCase();
  if (m === "PUT") return rota === CHAVE || (seg.length === 3 && seg[0] === "obras" && seg[2] === "cronograma");
  if (m === "DELETE") return rota === CHAVE;
  if (m === "PATCH") {
    return (
      (seg.length === 2 && EDITAVEIS.has(seg[0]!)) ||
      (seg.length === 3 && seg[0] === "gastos" && seg[2] === "fiscal") ||
      (seg.length === 5 && seg[0] === "obras" && seg[2] === "orcamento" && seg[3] === "itens")
    );
  }
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
 * De onde vem o IP do visitante. Na Vercel, a plataforma sobrescreve x-real-ip/x-forwarded-for, então o que chega aqui
 * é dela, não do visitante. Fora dela (a imagem Docker exposta direto), o visitante manda o X-Forwarded-For que quiser
 * e, repassado como veio, escaparia do limite de tentativas por IP do login. Por isso só se confia no cabeçalho com
 * CONFIAR_XFF=1, que afirma haver na frente um proxy de confiança que o sobrescreve; sem isso, nenhum IP vai, e a API
 * usa o endereço da conexão (este Next) — limite mais grosso, mas não contornável.
 */
function confiaNoXff(): boolean {
  if (process.env.VERCEL) return true;
  return ["1", "true", "sim"].includes((process.env.CONFIAR_XFF ?? "").toLowerCase());
}

/**
 * Headers que seguem para a API: só o necessário (nada de cookie do Next). O X-Forwarded-For vai junto para o limite de
 * tentativas por IP, quando há fonte confiável dele (veja confiaNoXff); a API só o aceita porque o IP deste Next está em
 * TRUSTED_PROXIES do lado dela (local) ou pelo segredo PROXY_SEGREDO (Vercel).
 */
export function headersDeRepasse(req: Request): Headers {
  const h = new Headers();
  for (const k of ["authorization", "content-type", "accept"]) {
    const v = req.headers.get(k);
    if (v) h.set(k, v);
  }
  const confia = confiaNoXff();
  const ip = confia ? (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip")) : null;
  if (ip) h.set("x-forwarded-for", ip);
  // Na Vercel não há IP fixo para a API listar em TRUSTED_PROXIES: o Next se identifica pelo segredo compartilhado e
  // informa o IP do visitante — o mesmo IP de confiança acima, nunca um cabeçalho que o visitante possa ter escrito.
  const segredo = process.env.PROXY_SEGREDO;
  if (segredo) {
    h.set("x-canteiro-proxy", segredo);
    const visitante = confia ? (req.headers.get("x-real-ip") ?? ip?.split(",")[0] ?? "").trim() : "";
    if (visitante) h.set("x-canteiro-ip-cliente", visitante);
  }
  return h;
}

export const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
