"use client";
/**
 * Busca na tabela oficial (SINAPI, SICRO...) para cadastrar o item já com o nome, a unidade e o preço de referência.
 * O serviço de produtos é opcional: se não estiver ligado neste ambiente (ou cair), o componente some sozinho e o
 * cadastro segue manual.
 */
import { useEffect, useId, useRef, useState } from "react";
import { fmtReais } from "@/lib/formato";
import { produtos, type ProdutoAchado } from "@/lib/produtos";
import { mensagemDe } from "../contexto";
import { Icone } from "../Icone";

export interface EscolhaProduto {
  nome: string;
  unidade: string;
  valorCentavos: number | null;
  fonte: string;
}

/** Normaliza a unidade da base (KG, M3...) para a do app (kg, m³...). */
const UNID: Record<string, string> = { KG: "kg", UN: "un", M: "m", M2: "m²", M3: "m³", L: "l", H: "h", MES: "mês" };
const unidadeApp = (u: string) => UNID[u.trim().toUpperCase()] ?? u.trim().toLowerCase();

export function BuscaProduto({ uf, aoEscolher }: { uf: string; aoEscolher: (e: EscolhaProduto) => void }) {
  const [ligado, setLigado] = useState<boolean | null>(null);
  const [termo, setTermo] = useState("");
  const [itens, setItens] = useState<ProdutoAchado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const campo = useId();
  const lista = useId();

  // o serviço está ligado? (pergunta uma vez; 503/erro = esconde a busca)
  useEffect(() => {
    let vivo = true;
    produtos
      .bases()
      .then(() => vivo && setLigado(true))
      .catch(() => vivo && setLigado(false));
    return () => {
      vivo = false;
    };
  }, []);

  const pedido = useRef(0);
  useEffect(() => {
    const q = termo.trim();
    if (!ligado || q.length < 3) {
      setItens([]);
      setAberto(false);
      return;
    }
    const meu = ++pedido.current;
    const t = setTimeout(() => {
      setBuscando(true);
      setErro(null);
      produtos
        .buscar(q, { uf, limite: 12 })
        .then((r) => {
          if (meu !== pedido.current) return;
          setItens(r.itens);
          setAberto(true);
        })
        .catch((e) => meu === pedido.current && setErro(mensagemDe(e)))
        .finally(() => meu === pedido.current && setBuscando(false));
    }, 350);
    return () => clearTimeout(t);
  }, [termo, uf, ligado]);

  if (!ligado) return null;

  function escolher(i: ProdutoAchado) {
    aoEscolher({
      nome: i.descricao.replace(/\s+/g, " ").trim().slice(0, 120),
      unidade: unidadeApp(i.unidade),
      valorCentavos: i.preco_centavos,
      fonte: `${i.base.toUpperCase()} ${i.codigo} · ${i.mes.split("-").reverse().join("/")} · ${uf}`,
    });
    setTermo("");
    setAberto(false);
  }

  return (
    <div className="busca-prod">
      <label htmlFor={campo} className="busca-prod-rot">
        <Icone nome="busca" tam={14} /> Buscar na tabela oficial (SINAPI, SICRO)
      </label>
      <input
        id={campo}
        className="f"
        type="search"
        autoComplete="off"
        role="combobox"
        aria-expanded={aberto}
        aria-controls={lista}
        placeholder="Ex.: aço CA-50 10 mm, concreto fck 30…"
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
      />
      {buscando ? (
        <span className="mut sm" role="status">
          <Icone nome="loader" tam={12} className="spin" /> Buscando…
        </span>
      ) : null}
      {erro ? (
        <span className="mut sm" role="status">
          {erro}
        </span>
      ) : null}
      {aberto && itens.length ? (
        <ul id={lista} className="busca-prod-lista" role="listbox">
          {itens.map((i) => (
            <li key={`${i.base}:${i.tipo}:${i.codigo}`} role="option" aria-selected={false}>
              <button type="button" onClick={() => escolher(i)}>
                <span className="bp-desc">{i.descricao}</span>
                <span className="bp-meta">
                  <b className="pill">{i.base.toUpperCase()}</b> {i.codigo} · {i.unidade}
                  {i.preco_centavos != null ? ` · ${fmtReais(i.preco_centavos)}` : " · sem preço nesta UF"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : aberto && !buscando ? (
        <span className="mut sm">Nada encontrado. Cadastre manualmente abaixo.</span>
      ) : null}
    </div>
  );
}
