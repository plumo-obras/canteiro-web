/**
 * Repasse para o tradutor de pranchas. Como o tradutor não conhece usuário, quem barra é este Next: só passa quem tem
 * sessão válida (na API de verdade, conferida com GET /conta; na demonstração, pelo token da demo). A chave do
 * tradutor é posta aqui e nunca chega ao navegador.
 */
import { chaveTradutor, modoDemo, urlApi, urlTradutor } from "@/lib/servidor/config";
import { headersDeRepasse, json } from "@/lib/servidor/repasse";
import { usuarioDoAcesso } from "@/lib/demo/loja";
import { materiaisDemo, projetoDemo } from "@/lib/simulado/projeto";

const ID = /^[a-f0-9]{8,64}$/;

/** As folhas de um projeto juntas: ?ids=a,b,c com 1 a 30 ids válidos e sem repetição. */
export function idsDoProjeto(busca: string): boolean {
  const ids = new URLSearchParams(busca).get("ids")?.split(",") ?? [];
  return ids.length > 0 && ids.length <= 30 && new Set(ids).size === ids.length && ids.every((i) => ID.test(i));
}

/**
 * POST traducoes · GET traducoes/{id} · GET traducoes/{id}/(resultado|modelo3d) · GET projetos?ids=...
 * · GET projetos/espelho.dxf?ids=... (o modelo para editar no CAD) · GET projetos/materiais?ids=...&uf=SP
 * Nada mais (nem DELETE, nem Excel).
 */
export function caminhoTradutor(seg: string[], metodo: string, busca = ""): boolean {
  const m = metodo.toUpperCase();
  if (seg[0] === "projetos" && (seg.length === 1 || (seg.length === 2 && seg[1] === "espelho.dxf"))) {
    return m === "GET" && idsDoProjeto(busca);
  }
  if (seg[0] === "projetos" && seg.length === 2 && seg[1] === "materiais") {
    // a UF só escolhe o preço de referência do SINAPI: duas letras ou nada
    const uf = new URLSearchParams(busca).get("uf");
    return m === "GET" && idsDoProjeto(busca) && (uf === null || /^[A-Za-z]{2}$/.test(uf));
  }
  if (seg[0] !== "traducoes") return false;
  if (seg.length === 1) return m === "POST";
  if (!ID.test(seg[1] ?? "")) return false;
  // apagar o projeto apaga cada leitura, uma por id (nunca em lote, nunca outra rota)
  if (m === "DELETE") return seg.length === 2;
  if (m !== "GET") return false;
  return seg.length === 2 || (seg.length === 3 && (seg[2] === "resultado" || seg[2] === "modelo3d"));
}

async function temSessao(req: Request): Promise<boolean> {
  if (modoDemo()) return usuarioDoAcesso(req.headers.get("authorization")) !== null;
  if (!req.headers.get("authorization")) return false;
  const r = await fetch(`${urlApi()}/conta`, { headers: headersDeRepasse(req), cache: "no-store", redirect: "manual" });
  return r.ok;
}

async function repassar(req: Request, ctx: { params: Promise<{ caminho: string[] }> }) {
  const { caminho } = await ctx.params;
  if (!caminhoTradutor(caminho, req.method, new URL(req.url).search)) return json({ detail: "Rota fora do contrato." }, 404);
  const base = urlTradutor();
  if (!base && modoDemo()) return demo(req, caminho);
  if (!base) return json({ detail: "O tradutor de pranchas não está ligado neste ambiente (TRADUTOR_URL)." }, 503);
  if (!(await temSessao(req))) return json({ detail: "Sessão expirada." }, 401);

  const h = new Headers();
  const tipo = req.headers.get("content-type");
  if (tipo) h.set("content-type", tipo); // multipart com o boundary do navegador
  const chave = chaveTradutor();
  if (chave) h.set("x-api-key", chave);
  const url = new URL(req.url);
  // PDF do CAD fica pronto em segundos: espera um pouco e já devolve o resultado; imagem segue pela consulta de status
  const busca = req.method === "POST" ? "?aguardar=25" : url.search;
  let r: Response;
  try {
    r = await fetch(`${base}/v1/${caminho.map(encodeURIComponent).join("/")}${busca}`, {
      method: req.method,
      headers: h,
      body: req.method === "POST" ? await req.arrayBuffer() : undefined,
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    return json({ detail: "O tradutor de pranchas não respondeu. Tente de novo em instantes." }, 502);
  }
  // os links absolutos do tradutor apontam para ele; a tela monta os caminhos pelo id
  const saida = new Headers({ "content-type": r.headers.get("content-type") ?? "application/json", "cache-control": "no-store" });
  const anexo = r.headers.get("content-disposition"); // o espelho .dxf vem como arquivo para baixar
  if (anexo) saida.set("content-disposition", anexo);
  return new Response(r.body, { status: r.status, headers: saida });
}

/** Demonstração sem tradutor: o projeto fictício de lib/simulado (SIMULADO). Envio novo e espelho não existem nela. */
async function demo(req: Request, caminho: string[]) {
  if (!(await temSessao(req))) return json({ detail: "Sessão expirada." }, 401);
  const ids = new URLSearchParams(new URL(req.url).search).get("ids")?.split(",") ?? [];
  if (req.method === "GET" && caminho[0] === "projetos" && caminho.length === 1) return json(projetoDemo(ids));
  if (req.method === "GET" && caminho[0] === "projetos" && caminho[1] === "materiais") return json(materiaisDemo());
  // apagar, enviar e baixar o DXF não existem no projeto fictício: responder 204 fingiria que apagou (e ele voltaria)
  return json({ detail: "Na demonstração o projeto é fictício: enviar, apagar e baixar o DXF só com o tradutor ligado." }, 503);
}

export const GET = repassar;
export const POST = repassar;
export const DELETE = repassar;
