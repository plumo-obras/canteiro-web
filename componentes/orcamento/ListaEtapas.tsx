"use client";
/**
 * O orçamento numa lista só (Onda 3). Antes eram duas listas das mesmas 24 etapas: "Andamento por etapa" (o gasto) e
 * "Itens por etapa" (a planilha). Agora cada etapa é uma linha (nome, orçado atual, barra do comprometido) que se abre
 * ali mesmo com o gasto rotulado, os pedidos da etapa e os itens da planilha. Busca e curva filtram os itens e abrem
 * as etapas que têm resultado; a ordem por desvio continua valendo. Os números vêm da API; a tela só agrupa.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { CorpoEditarItem, CurvaABC, Obra, Orcamento, Pedido } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { uuid7 } from "@/lib/ids";
import { fmtQtd, fmtQtdUn, fmtReais, lerQtd, lerReais, qtdParaCampo, reaisParaCampo } from "@/lib/formato";
import { ROTULO_STATUS } from "../CartaoProposta";
import { mensagemDe, useCasca } from "../contexto";
import { BarraFiltros } from "../CabecalhoPagina";
import { Icone } from "../Icone";
import { CelulaEditavel } from "./CelulaEditavel";
import { Barra, fmtPct, linhasAndamento, porDesvio, reaisInteiros, type LinhaAndamento } from "./Andamento";

export type ItemDaEtapa = Orcamento["itens"][number];

export interface EtapaDaLista {
  linha: LinhaAndamento;
  /** Itens (e sub-etapas) da planilha nesta etapa, já filtrados pela busca/curva. */
  itens: ItemDaEtapa[];
  /** Busca ou curva acharam algo aqui: a etapa abre sozinha. */
  achou: boolean;
}

export interface FiltroLista {
  busca: string;
  curva: CurvaABC | null;
  ordem: "desvio" | "planilha";
}

const semAcento = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Junta o gasto por etapa (linhasAndamento) com os itens da planilha da mesma etapa. Com busca/curva, ficam só as
 * etapas com item que bate (e só esses itens); sem filtro, todas, com todos os itens. A ordem por desvio põe o estouro
 * em cima; "planilha" mantém a ordem do orçamento.
 */
export function montarLista(orc: Orcamento, f: FiltroLista): EtapaDaLista[] {
  const porEtapa = new Map<string, ItemDaEtapa[]>();
  for (const i of orc.itens) {
    // A linha de etapa raiz é a própria linha da lista; sub-etapas viram título dentro dela.
    if (i.tipo === "etapa" && i.nivel <= 1) continue;
    porEtapa.set(i.etapa, [...(porEtapa.get(i.etapa) ?? []), i]);
  }
  const q = semAcento(f.busca.trim());
  const filtrando = !!q || !!f.curva;
  const base = linhasAndamento(orc);
  const ls = f.ordem === "desvio" ? [...base].sort(porDesvio) : base;
  const out: EtapaDaLista[] = [];
  for (const linha of ls) {
    const todos = linha.semEtapa ? [] : (porEtapa.get(linha.etapa) ?? []);
    if (!filtrando) {
      out.push({ linha, itens: todos, achou: false });
      continue;
    }
    const itens = todos.filter(
      (i) => i.tipo === "item" && (!f.curva || i.curva === f.curva) && (!q || semAcento(`${i.descricao} ${i.codigo} ${i.numero} ${i.fonte}`).includes(q)),
    );
    if (itens.length) out.push({ linha, itens, achou: true });
  }
  return out;
}

const CURVAS: { k: CurvaABC | null; rotulo: string }[] = [
  { k: null, rotulo: "Todas" },
  { k: "A", rotulo: "A" },
  { k: "B", rotulo: "B" },
  { k: "C", rotulo: "C" },
];
const ORDENS: { k: "desvio" | "planilha"; rotulo: string }[] = [
  { k: "desvio", rotulo: "Maior desvio" },
  { k: "planilha", rotulo: "Da planilha" },
];

export function ListaEtapas({ obra, orc, nomeVersao }: { obra: Obra; orc: Orcamento; nomeVersao: (v: { tipo: "contrato" | "aditivo"; numero: number }) => string }) {
  const { podeOperar, mudou, avisar, avisarFeito } = useCasca();
  // Antes de aprovar não há gasto para dar desvio: a ordem que importa é a da obra, e é ela que se arruma aqui.
  const [filtro, setFiltro] = useState<FiltroLista>({ busca: "", curva: null, ordem: obra.status === "em_orcamento" ? "planilha" : "desvio" });
  // Com uma etapa só (ex.: a Estrutura do projeto), já abre: a quantidade e o unitário de cada item ficam à vista
  // sem precisar clicar para expandir.
  const [abertas, setAbertas] = useState<Set<string>>(() => {
    const unica = orc.etapas.length === 1 ? orc.etapas[0] : null;
    return unica ? new Set([unica.etapa]) : new Set();
  });
  const lista = useMemo(() => montarLista(orc, filtro), [orc, filtro]);
  const filtrando = !!filtro.busca.trim() || !!filtro.curva;
  const achados = lista.reduce((n, e) => n + e.itens.length, 0);
  const versoes = useMemo(() => new Map(orc.versoes.map((v) => [v.id, v])), [orc.versoes]);
  const chave = (l: LinhaAndamento) => (l.semEtapa ? "_sem" : l.etapa);

  // Os pedidos da obra só vêm quando a primeira etapa é aberta (a lista fechada não precisa deles).
  const [pedidos, setPedidos] = useState<{ dado: Pedido[] | null; erro: string | null }>({ dado: null, erro: null });
  const precisaPedidos = abertas.size > 0 && pedidos.dado === null && !pedidos.erro;
  useEffect(() => {
    if (!precisaPedidos) return;
    let vivo = true;
    api
      .listarPedidos(obra.id, { limite: 500 })
      .then((d) => vivo && setPedidos({ dado: d, erro: null }))
      .catch((e) => vivo && setPedidos({ dado: null, erro: mensagemDe(e) }));
    return () => {
      vivo = false;
    };
  }, [precisaPedidos, obra.id]);

  // Subir/descer só na ordem da planilha e sem filtro (é a lista inteira que se ordena), antes de aprovar e sem aditivo.
  const etapasDaOrdem = orc.etapas.map((e) => e.etapa).filter(Boolean);
  const podeOrdenar =
    podeOperar && obra.status === "em_orcamento" && !filtrando && filtro.ordem === "planilha" && etapasDaOrdem.length > 1 && !orc.versoes.some((v) => v.ativa && v.tipo === "aditivo");
  const [ordenando, setOrdenando] = useState(false);
  // A ordem é montada sobre a numeração que a tela vê, e a API renumera: até o orçamento novo chegar, outro toque
  // mandaria a numeração velha e moveria outra etapa. Por isso as setas esperam um `orc` diferente do do toque.
  const [travadoEm, setTravadoEm] = useState<Orcamento | null>(null);
  const ocupado = ordenando || travadoEm === orc;
  const vigente = orc.versoes.find((v) => v.ativa && v.tipo === "contrato")?.id;
  // As etapas são renumeradas: o foco volta para o mesmo botão na posição nova, não fica perdido no topo da página.
  const focoDepois = useRef<{ posicao: number; dir: "subir" | "descer" } | null>(null);
  const refLista = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const f = focoDepois.current;
    if (!f || !refLista.current) return;
    const botoes = refLista.current.querySelectorAll<HTMLButtonElement>(`[data-posicao="${f.posicao}"]`);
    const alvo = [...botoes].find((b) => b.dataset.dir === f.dir && !b.disabled) ?? [...botoes].find((b) => !b.disabled);
    if (!alvo) return;
    focoDepois.current = null;
    alvo.focus();
  }, [orc]);
  const mover = async (etapa: string, descricao: string, dir: "subir" | "descer") => {
    const de = etapasDaOrdem.indexOf(etapa);
    const para = dir === "subir" ? de - 1 : de + 1;
    if (de < 0 || para < 0 || para >= etapasDaOrdem.length) return;
    const ordem = [...etapasDaOrdem];
    [ordem[de], ordem[para]] = [ordem[para]!, ordem[de]!];
    setOrdenando(true);
    try {
      // Chave nova a cada toque: reaproveitar a de um toque que deu erro podia achar uma versão já gravada e desfeita
      // (200, "subiu", e nada muda). Resposta perdida não grava duas vezes: o `versao_id` já não é o vigente (409).
      const r = await api.ordenarEtapas(obra.id, { ordem, chave_idempotencia: uuid7(), ...(vigente ? { versao_id: vigente } : {}) });
      focoDepois.current = { posicao: para + 1, dir };
      mudou();
      // fixo, como o do somar: mudar a ordem sem querer é fácil e o caminho de volta tem de esperar a pessoa
      avisarFeito(`${descricao} ${dir === "subir" ? "subiu" : "desceu"}: agora é a etapa ${para + 1}.`, r.registro_id, { fixo: true });
    } catch (e) {
      mudou();
      avisar(mensagemDe(e), true);
    } finally {
      setTravadoEm(orc);
      setOrdenando(false);
    }
  };

  const alternar = (k: string) =>
    setAbertas((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });


  return (
    <section aria-label="Etapas do orçamento">
      <BarraFiltros
        busca={{ valor: filtro.busca, mudar: (t) => setFiltro((f) => ({ ...f, busca: t })), placeholder: "Buscar item: descrição, código ou nº", rotulo: "Buscar item do orçamento" }}
        grupos={[
          { rotulo: "Curva", valor: filtro.curva, opcoes: CURVAS, mudar: (k: CurvaABC | null) => setFiltro((f) => ({ ...f, curva: k })) },
          { rotulo: "Ordem", valor: filtro.ordem, opcoes: ORDENS, mudar: (k: "desvio" | "planilha") => setFiltro((f) => ({ ...f, ordem: k })) },
        ]}
      />
      {filtrando ? (
        <p className="mut sm le-achados" role="status">
          {achados ? `${achados} ${achados === 1 ? "item" : "itens"} em ${lista.length} ${lista.length === 1 ? "etapa" : "etapas"}` : "Nenhum item encontrado."}
        </p>
      ) : null}

      {podeOrdenar ? <p className="mut sm">Use as setas para pôr as etapas na ordem em que a obra acontece: as compras seguem essa ordem.</p> : null}
      <ul className="le" aria-label="Etapas do orçamento" ref={refLista}>
        <li className="le-cab" aria-hidden="true">
          <span>Etapa</span>
          <span className="num">Orçado atual</span>
          <span className="num">Comprometido</span>
          <span className="num">Realizado</span>
          <span className="num">Saldo</span>
        </li>
        {lista.map(({ linha: l, itens, achou }) => {
          const k = chave(l);
          const aberta = achou || abertas.has(k);
          const semCompra = !l.comprometido && !l.cotando && !l.realizado;
          const estouro = l.comprometido > l.atual;
          return (
            <li key={k} className={`le-l${semCompra ? " sem-compra" : ""}${estouro ? " estouro" : ""}${aberta ? " aberta" : ""}${podeOrdenar ? " ordenando" : ""}`}>
              <button type="button" className="le-linha" aria-expanded={aberta} aria-controls={`le-${k}`} onClick={() => alternar(k)}>
                <span className="le-nome">
                  <Icone nome="chevRight" tam={14} className="le-seta" />
                  {l.etapa ? <span className="eap-num">{l.etapa}</span> : null}
                  <span className="le-desc">{l.descricao}</span>
                  {semCompra ? null : <Barra l={l} />}
                </span>
                <span className="num le-orc">{l.atual ? fmtReais(l.atual) : "—"}</span>
                {semCompra ? null : (
                  <>
                    <span className="num le-comp">
                      {fmtReais(l.comprometido)}
                      <small>{fmtPct(l.pct)}</small>
                    </span>
                    <span className="num le-real">{fmtReais(l.realizado)}</span>
                    <span className={`num le-saldo${l.saldo < 0 ? " t-neg" : ""}`}>{fmtReais(l.saldo)}</span>
                  </>
                )}
                {/* celular: nome + um valor; com compra, "comprometido de orçado · %" embaixo da barra */}
                <span className="le-movel">
                  {semCompra ? `${reaisInteiros(l.atual)} orçado` : `${reaisInteiros(l.comprometido)} de ${reaisInteiros(l.atual)} · ${fmtPct(l.pct)}`}
                </span>
              </button>
              {podeOrdenar && !l.semEtapa ? (
                <OrdemEtapa
                  posicao={etapasDaOrdem.indexOf(l.etapa) + 1}
                  total={etapasDaOrdem.length}
                  descricao={l.descricao}
                  ocupado={ocupado}
                  mover={(dir) => mover(l.etapa, l.descricao, dir)}
                />
              ) : null}
              {aberta ? (
                <div className="le-corpo" id={`le-${k}`}>
                  {semCompra ? null : (
                    <dl className="and-det">
                      <div>
                        <dt>Orçado atual</dt>
                        <dd>{fmtReais(l.atual)}</dd>
                      </div>
                      <div>
                        <dt>Em cotação</dt>
                        <dd>{l.cotando ? fmtReais(l.cotando) : "—"}</dd>
                      </div>
                      <div>
                        <dt>Comprometido</dt>
                        <dd>
                          {fmtReais(l.comprometido)}
                          {l.comprometido ? <small> · {fmtPct(l.pct)}</small> : null}
                        </dd>
                      </div>
                      <div>
                        <dt>Realizado (compras)</dt>
                        <dd>{fmtReais(l.realizado)}</dd>
                      </div>
                      <div>
                        <dt>Saldo a comprometer</dt>
                        <dd className={l.saldo < 0 ? "t-neg" : ""}>{fmtReais(l.saldo)}</dd>
                      </div>
                    </dl>
                  )}
                  {semCompra ? null : <PedidosDaEtapa linha={l} etapas={orc.etapas.map((e) => e.etapa)} pedidos={pedidos} />}
                  {itens.length ? <ItensDaEtapa obra={obra} itens={itens} versoes={versoes} nomeVersao={nomeVersao} /> : semCompra ? <p className="mut sm">Sem itens nesta etapa.</p> : null}
                </div>
              ) : null}
            </li>
          );
        })}
        {!lista.length && !filtrando ? <li className="mut sm le-vazio">Nenhuma etapa vigente.</li> : null}
      </ul>
    </section>
  );
}

/** Subir e descer uma etapa: botões e não arrastar, para dar com o teclado e o dedo (e o leitor dizer a posição). */
function OrdemEtapa({ posicao, total, descricao, ocupado, mover }: { posicao: number; total: number; descricao: string; ocupado: boolean; mover: (dir: "subir" | "descer") => void }) {
  return (
    <span className="le-ordem" role="group" aria-label={`Ordem de ${descricao}: etapa ${posicao} de ${total}`}>
      <button type="button" className="iconbtn" data-posicao={posicao} data-dir="subir" disabled={ocupado || posicao === 1} aria-label={`Subir ${descricao}`} onClick={() => mover("subir")}>
        <Icone nome="arrowUp" tam={14} />
      </button>
      <button type="button" className="iconbtn" data-posicao={posicao} data-dir="descer" disabled={ocupado || posicao === total} aria-label={`Descer ${descricao}`} onClick={() => mover("descer")}>
        <Icone nome="arrowDown" tam={14} />
      </button>
    </span>
  );
}

function PedidosDaEtapa({ linha, etapas, pedidos }: { linha: LinhaAndamento; etapas: string[]; pedidos: { dado: Pedido[] | null; erro: string | null } }) {
  if (pedidos.erro)
    return (
      <div className="aviso-erro" role="alert">
        <Icone nome="alert" tam={15} />
        {pedidos.erro}
      </div>
    );
  if (!pedidos.dado)
    return (
      <div className="carregando" role="status">
        <Icone nome="loader" className="spin" tam={15} />
        Carregando pedidos…
      </div>
    );
  const conhecidas = new Set(etapas);
  const daEtapa = (et: string | null) => (linha.semEtapa ? !et || !conhecidas.has(et) : et === linha.etapa);
  const ps = pedidos.dado.filter((p) => p.status !== "cancelado" && p.linhas.some((l) => daEtapa(l.etapa)));
  if (!ps.length) return null;
  return (
    <>
      <h4 className="le-sub">Pedidos</h4>
      <ul className="le-peds">
        {ps.map((p) => (
          <li key={p.id}>
            <div className="and-ped-t">
              <b>{p.numero}</b> · {p.fornecedor} <span className={`pill st-${p.status}`}>{ROTULO_STATUS[p.status]}</span>
            </div>
            {p.linhas
              .filter((l) => daEtapa(l.etapa))
              .map((l, i) => (
                <div key={i} className="and-ped-l">
                  <span>
                    {fmtQtdUn(l.quantidade, l.unidade)} · {l.nome}
                    {l.recebida ? <small className="mut"> · chegou {fmtQtdUn(l.recebida, l.unidade)}</small> : null}
                  </span>
                  <span className="num">{fmtReais(l.total)}</span>
                </div>
              ))}
          </li>
        ))}
      </ul>
    </>
  );
}

function ItensDaEtapa({
  obra,
  itens,
  versoes,
  nomeVersao,
}: {
  obra: Obra;
  itens: ItemDaEtapa[];
  versoes: Map<string, { tipo: "contrato" | "aditivo"; numero: number }>;
  nomeVersao: (v: { tipo: "contrato" | "aditivo"; numero: number }) => string;
}) {
  const { podeOperar, mudou, avisar, avisarFeito } = useCasca();
  const n = itens.filter((i) => i.tipo === "item").length;
  // Aprovado, o orçamento é a referência de custo da obra e fica travado; só o item sem preço ainda pode recebê-lo.
  const emOrcamento = obra.status === "em_orcamento";
  const qtdEditavel = podeOperar && emOrcamento;
  // Com o Desfazer da aprovação pela metade, a API recusa qualquer edição: nem oferece.
  const precoEditavel = (i: ItemDaEtapa) => podeOperar && obra.status !== "desfazendo_aprovacao" && (emOrcamento || !i.valor_unitario);
  const editar = async (i: ItemDaEtapa, corpo: CorpoEditarItem, feito: string) => {
    try {
      const r = await api.editarItemOrcamento(obra.id, i.id, corpo);
      mudou();
      avisarFeito(feito, r.registro_id);
    } catch (e) {
      avisar(mensagemDe(e), true);
      throw e;
    }
  };
  return (
    <>
      <h4 className="le-sub">
        Itens da planilha <span className="mut">({n})</span>
      </h4>
      <div className="eap-rola">
        <table className="tbl-eap">
          <thead>
            <tr>
              <th scope="col">Nº</th>
              <th scope="col">Descrição</th>
              <th scope="col">Un.</th>
              <th scope="col" className="num">
                Quant.
              </th>
              <th scope="col" className="num">
                Unitário
              </th>
              <th scope="col" className="num">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => {
              const v = versoes.get(i.versao_id);
              if (i.tipo === "etapa")
                return (
                  <tr key={i.id} className="eap-sub">
                    <td>{i.numero}</td>
                    <td colSpan={5}>{i.descricao}</td>
                  </tr>
                );
              return (
                <tr key={i.id}>
                  <td className="eap-n">{i.numero}</td>
                  <td className="eap-d">
                    {i.descricao}
                    {i.curva ? (
                      <span className={`curva c${i.curva}`} title={`Curva ${i.curva}`}>
                        {i.curva}
                      </span>
                    ) : null}
                    {v?.tipo === "aditivo" ? <span className="pill eap-adt">{nomeVersao(v)}</span> : null}
                    {i.codigo || i.fonte ? <span className="eap-cod">{[i.codigo, i.fonte].filter(Boolean).join(" · ")}</span> : null}
                  </td>
                  <td>{i.unidade}</td>
                  <td className="num">
                    {qtdEditavel ? (
                      <CelulaEditavel
                        rotulo={`Quantidade de ${i.descricao}`}
                        inicial={qtdParaCampo(i.quantidade)}
                        ajuda="Quantidade, ex.: 120 ou 2,5."
                        ler={(t) => lerQtd(t, { negativo: v?.tipo === "aditivo" }) || null}
                        salvar={(q) => editar(i, { quantidade: q }, `Quantidade de ${i.descricao}: ${fmtQtd(q)} ${i.unidade}.`)}
                      >
                        {fmtQtd(i.quantidade)}
                        <span className="eap-un"> {i.unidade}</span>
                      </CelulaEditavel>
                    ) : (
                      <>
                        {fmtQtd(i.quantidade)}
                        <span className="eap-un"> {i.unidade}</span>
                      </>
                    )}
                  </td>
                  <td className="num">
                    {precoEditavel(i) ? (
                      <CelulaEditavel
                        rotulo={`Preço de ${i.descricao}`}
                        inicial={i.valor_unitario ? reaisParaCampo(i.valor_unitario) : ""}
                        ajuda="Preço em reais, ex.: 39,90."
                        ler={lerReais}
                        alerta={!i.valor_unitario}
                        salvar={(v2) => editar(i, { valor_unitario: v2 }, `Preço de ${i.descricao}: ${fmtReais(v2)}.`)}
                      >
                        {i.valor_unitario ? fmtReais(i.valor_unitario) : "sem preço"}
                      </CelulaEditavel>
                    ) : (
                      fmtReais(i.valor_unitario)
                    )}
                  </td>
                  <td className="num">
                    <b>{fmtReais(i.total)}</b>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
