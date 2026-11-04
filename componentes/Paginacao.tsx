"use client";
/**
 * Duas formas de não despejar uma lista inteira na tela:
 * - `usePaginas` + `<Paginacao>`: a lista já está toda no navegador (obras, insumos de uma planilha de 2.000 linhas)
 *   e só se mostra uma página por vez. Mudou o filtro ou a busca, volta para a 1ª página.
 * - `useMaisAntigos`: a lista vem da API aos poucos, das mais novas para as mais antigas, pelo cursor `antes_de`
 *   (histórico, pedidos encerrados, movimentos). O cursor é exclusivo e a API nunca parte um empate de instante (o grupo
 *   inteiro vem na mesma página), então nada se repete nem some na virada; o filtro por id fica só de garantia.
 */
import { useEffect, useRef, useState } from "react";
import { mensagemDe } from "./contexto";
import { Icone } from "./Icone";

export function usePaginas<T>(itens: T[], porPagina: number, reiniciarCom: unknown[] = []) {
  const [pagina, setPagina] = useState(1);
  const total = Math.max(1, Math.ceil(itens.length / porPagina));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- as dependências são as do chamador (como no próprio useEffect): volta à 1ª página quando elas mudam
  useEffect(() => setPagina(1), reiniciarCom);
  const atual = Math.min(pagina, total);
  return { pagina: atual, setPagina, total, visiveis: itens.slice((atual - 1) * porPagina, atual * porPagina) };
}

/** 1 … 4 5 6 … 12: a primeira, a última e as vizinhas da atual. */
function numeros(pagina: number, total: number): (number | "…")[] {
  const ns = new Set([1, total, pagina - 1, pagina, pagina + 1].filter((n) => n >= 1 && n <= total));
  const ord = [...ns].sort((a, b) => a - b);
  return ord.flatMap((n, i) => (i && n - ord[i - 1]! > 1 ? (["…", n] as const) : ([n] as const)));
}

export function Paginacao(props: {
  pagina: number;
  total: number;
  mudar: (p: number) => void;
  quantos: number;
  porPagina: number;
  nome: string;
  /** A lista vem da API aos poucos e ainda há mais: "1–20 de 60+". */
  mais?: boolean;
}) {
  const { pagina, total, mudar, quantos, porPagina } = props;
  if (total <= 1 && !props.mais) return null;
  const de = (pagina - 1) * porPagina + 1;
  const ate = Math.min(quantos, pagina * porPagina);
  return (
    <nav className="paginacao" aria-label={`Páginas de ${props.nome}`}>
      <span className="pag-conta">
        {de}–{ate} de {quantos}
        {props.mais ? "+" : ""}
      </span>
      <div className="pag-bts">
        <button type="button" className="pag-bt" disabled={pagina === 1} aria-label="Página anterior" onClick={() => mudar(pagina - 1)}>
          <Icone nome="chevRight" tam={15} className="pag-volta" />
        </button>
        {numeros(pagina, total).map((n, i) =>
          n === "…" ? (
            <span key={`r${i}`} className="pag-reti" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              className={`pag-bt${n === pagina ? " on" : ""}`}
              aria-current={n === pagina ? "page" : undefined}
              onClick={() => mudar(n)}
            >
              {n}
            </button>
          ),
        )}
        <button type="button" className="pag-bt" disabled={pagina === total} aria-label="Próxima página" onClick={() => mudar(pagina + 1)}>
          <Icone nome="chevRight" tam={15} />
        </button>
      </div>
    </nav>
  );
}

/**
 * A 1ª página e as seguintes pelo cursor. `deps` recarrega do zero (a "versão" da casca sobe a cada escrita: o que
 * mudou aparece em cima). `dataDe` diz qual campo é o cursor (criado_em na maioria, atualizado_em nas conversas).
 */
export function useMaisAntigos<T extends { id: string }>(
  buscar: (antes_de?: string) => Promise<T[]>,
  limite: number,
  deps: unknown[],
  dataDe: (x: T) => string = (x) => (x as unknown as { criado_em: string }).criado_em,
) {
  const [itens, setItens] = useState<T[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [acabou, setAcabou] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const geracao = useRef(0);

  useEffect(() => {
    const g = ++geracao.current;
    setBuscando(true);
    buscar()
      .then((r) => {
        if (g !== geracao.current) return;
        setItens(r);
        setAcabou(r.length < limite);
        setErro(null);
      })
      .catch((e) => g === geracao.current && setErro(mensagemDe(e)))
      .finally(() => g === geracao.current && setBuscando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps vem do chamador; buscar é uma closure nova a cada render e rebuscaria sem parar
  }, deps);

  const carregarMais = async () => {
    const ult = itens?.at(-1);
    if (!ult || acabou || buscando) return;
    const g = geracao.current;
    setBuscando(true);
    try {
      const r = await buscar(dataDe(ult));
      if (g !== geracao.current) return;
      const vistos = new Set(itens!.map((x) => x.id));
      const novos = r.filter((x) => !vistos.has(x.id));
      setItens([...itens!, ...novos]);
      // menos que o limite = fim (a página pode vir maior que o limite quando completa um empate, nunca menor sem ser o fim)
      setAcabou(r.length < limite || novos.length === 0);
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      if (g === geracao.current) setBuscando(false);
    }
  };

  return { itens, erro, acabou, buscando, carregarMais };
}

export function BotaoMais({
  acabou,
  buscando,
  carregarMais,
  rotulo = "Carregar mais",
}: {
  acabou: boolean;
  buscando: boolean;
  carregarMais: () => void;
  rotulo?: string;
}) {
  if (acabou) return null;
  return (
    <div className="mais">
      <button type="button" className="btn" disabled={buscando} aria-busy={buscando} onClick={carregarMais}>
        {buscando ? <Icone nome="loader" className="spin" tam={14} /> : null}
        {rotulo}
      </button>
    </div>
  );
}
