/**
 * Repasse para o catálogo de produtos e preços (bases oficiais: SINAPI, SICRO...). Só GET, só as rotas de consulta;
 * como o serviço não conhece usuário, quem barra é este Next (sessão válida), e a chave do catálogo é posta aqui e
 * nunca chega ao navegador.
 */
import { chaveProdutos, modoDemo, urlApi, urlProdutos } from "@/lib/servidor/config";
import { headersDeRepasse, json } from "@/lib/servidor/repasse";
import { usuarioDoAcesso } from "@/lib/demo/loja";

const BASE = /^[a-z0-9-]{1,30}$/;
const TIPO = /^(insumo|composicao)$/;
const CODIGO = /^[A-Za-z0-9.-]{1,30}$/;
const UF = /^[A-Za-z]{2}$/;
const MES = /^\d{4}-\d{2}$/;

/**
 * GET bases · GET itens?q=... · GET itens/{base}/{tipo}/{codigo}
 * A busca e o detalhe aceitam uf, mes, desonerado, tipo, base, limite; nada que escreva.
 */
export function caminhoProdutos(seg: string[], metodo: string, busca = ""): boolean {
  if (metodo.toUpperCase() !== "GET") return false;
  const p = new URLSearchParams(busca);
  const filtros = () => {
    const uf = p.get("uf");
    const mes = p.get("mes");
    const base = p.get("base");
    return (uf === null || UF.test(uf)) && (mes === null || MES.test(mes)) && (base === null || BASE.test(base));
  };
  if (seg.length === 1 && seg[0] === "bases") return true;
  if (seg[0] === "itens" && seg.length === 1) return (p.get("q") ?? "").trim().length > 0 && filtros();
  if (seg[0] === "itens" && seg.length === 4)
    return BASE.test(seg[1]!) && TIPO.test(seg[2]!) && CODIGO.test(seg[3]!) && filtros();
  return false;
}

async function temSessao(req: Request): Promise<boolean> {
  if (modoDemo()) return usuarioDoAcesso(req.headers.get("authorization")) !== null;
  if (!req.headers.get("authorization")) return false;
  const r = await fetch(`${urlApi()}/conta`, { headers: headersDeRepasse(req), cache: "no-store", redirect: "manual" });
  return r.ok;
}

async function repassar(req: Request, ctx: { params: Promise<{ caminho: string[] }> }) {
  const { caminho } = await ctx.params;
  const url = new URL(req.url);
  if (!caminhoProdutos(caminho, req.method, url.search)) return json({ detail: "Rota fora do contrato." }, 404);
  const base = urlProdutos();
  if (!base) return json({ detail: "O catálogo de produtos não está ligado neste ambiente (PRODUTOS_URL)." }, 503);
  if (!(await temSessao(req))) return json({ detail: "Sessão expirada." }, 401);

  const h = new Headers();
  const chave = chaveProdutos();
  if (chave) h.set("x-api-key", chave);
  let r: Response;
  try {
    r = await fetch(`${base}/v1/${caminho.map(encodeURIComponent).join("/")}${url.search}`, {
      method: "GET",
      headers: h,
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    return json({ detail: "O catálogo de produtos não respondeu. Tente de novo em instantes." }, 502);
  }
  return new Response(r.body, {
    status: r.status,
    headers: { "content-type": r.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
  });
}

export const GET = repassar;
