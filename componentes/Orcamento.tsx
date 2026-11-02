"use client";
/**
 * Aba Orçamento: a planilha da construtora como ela é, etapa → item, em versões (o contrato e os aditivos que somam a
 * ele). O cabeçalho responde "quanto foi contratado, quanto entrou de aditivo e quanto está orçado agora"; as somas
 * vêm prontas da API (GET /obras/{id}/orcamento), a tela só agrupa e filtra o que já chegou. Comprometido e Realizado
 * dependem de pedidos e notas, então só aparecem quando a obra estiver andando: aqui não se inventa número.
 */
import { useMemo, useState } from "react";
import type { CurvaABC, Obra, Orcamento as DadosOrcamento, VersaoOrcamento } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { fmtQtd, fmtReais } from "@/lib/formato";
import { mensagemDe, useCasca } from "./contexto";
import { Confirmar } from "./Dialogo";
import { Icone } from "./Icone";
import { useCarregar } from "./useCarregar";
import { ImportarOrcamento } from "./obra/ImportarOrcamento";
import { ModalDadosObra } from "./obra/ModalDadosObra";
import { MARGEM_CENTAVOS, tagVerba } from "./obra/verba";
import { CabecalhoPagina, type Kpi } from "./CabecalhoPagina";
import { PADROES, REGIMES, TIPOLOGIAS, pctParaCampo } from "./obra/CamposObra";

type ItemComCurva = DadosOrcamento["itens"][number];

export function resumoDaObra(o: Obra): string[] {
  return [
    TIPOLOGIAS.find((t) => t.k === o.tipologia)?.rotulo,
    o.area_construida ? `${fmtQtd(o.area_construida)} m²` : null,
    o.pavimentos ? `${o.pavimentos} ${o.pavimentos === 1 ? "pavimento" : "pavimentos"}` : null,
    o.padrao ? `padrão ${PADROES.find((p) => p.k === o.padrao)!.rotulo.toLowerCase()}` : null,
    [o.cidade, o.uf].filter(Boolean).join("/") || null,
    o.regime ? REGIMES.find((r) => r.k === o.regime)!.rotulo.toLowerCase() : null,
    o.prazo_meses ? `${o.prazo_meses} meses` : null,
  ].filter((x): x is string => !!x);
}

/** Nº do contrato, BDI e data-base: o que identifica o contrato na conversa com o cliente. */
export function resumoDoContrato(o: Obra): string[] {
  return [
    o.numero_contrato ? `contrato ${o.numero_contrato}` : null,
    o.verba ? `valor do contrato ${fmtReais(o.verba)}` : null,
    o.bdi ? `BDI ${pctParaCampo(o.bdi)}%` : null,
    o.data_base ? `data-base ${o.data_base.slice(5, 7)}/${o.data_base.slice(0, 4)}` : null,
  ].filter((x): x is string => !!x);
}

export const nomeVersao = (v: Pick<VersaoOrcamento, "tipo" | "numero">) => (v.tipo === "contrato" ? "Contrato" : `${v.numero}º aditivo`);
export const fmtData = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");
const comSinal = (c: number) => (c < 0 ? `−${fmtReais(-c)}` : `+${fmtReais(c)}`);
const semAcento = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
const plural = (n: number, um: string, varios: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;

/** precisa (milésimos) × preço (centavos) → centavos, como a lista de materiais soma. */
const totalInsumo = (precisa: number, valor: number) => Math.round((precisa * valor) / 1000);

export function Orcamento({ obra }: { obra: Obra }) {
  const { versao, podeOperar, avisarFeito, mudou, avisar } = useCasca();
  const orc = useCarregar(() => api.orcamento(obra.id), [obra.id, versao]);
  const ins = useCarregar(() => api.listarInsumos(obra.id), [obra.id, versao]);
  const [modal, setModal] = useState<"importar" | "dados" | "aprovar" | null>(null);

  const dado = orc.dado;
  const materiais = (ins.dado ?? []).filter((i) => i.insumo.precisa_ate_o_fim > 0);
  const totalMateriais = materiais.reduce((t, i) => t + totalInsumo(i.insumo.precisa_ate_o_fim, i.insumo.valor_unitario), 0);
  const temContrato = !!dado?.versoes.some((v) => v.tipo === "contrato" && v.ativa);
  const emOrcamento = obra.status === "em_orcamento";
  const podeAprovar = emOrcamento && (temContrato || materiais.length > 0);
  const resumo = [...resumoDaObra(obra), ...resumoDoContrato(obra)];
  const faltaDado = !obra.area_construida || !obra.padrao;

  const aprovar = async () => {
    const r = await api.aprovarOrcamento(obra.id);
    setModal(null);
    mudou();
    avisarFeito(`Orçamento aprovado. ${obra.nome} está em andamento.`, r.registro_id ?? null);
  };

  const t = dado?.totais;
  const kpis: Kpi[] = t && dado.versoes.length ? kpisDoOrcamento(t, obra) : [];

  return (
    <div className="page">
      <CabecalhoPagina
        titulo="Orçamento"
        sub={<span className={`pill ${emOrcamento ? "st-orc" : "st-ok"}`}>{emOrcamento ? "em orçamento" : "aprovado"}</span>}
        kpis={kpis}
        acoes={
          podeOperar && (dado?.versoes.length || materiais.length) ? (
            <>
              <button type="button" className="btn" onClick={() => setModal("importar")}>
                <Icone nome="planilha" tam={15} />
                Importar planilha
              </button>
              {podeAprovar ? (
                <button type="button" className="btn amb" onClick={() => setModal("aprovar")}>
                  <Icone nome="check" tam={15} />
                  Aprovar orçamento
                </button>
              ) : null}
            </>
          ) : null
        }
      />

      <section className="card orc-obra" aria-label="Dados da obra">
        <div>
          <div className="orc-obra-n">{obra.nome}</div>
          <div className="mut sm">{resumo.length ? resumo.join(" · ") : "Sem os dados da obra ainda."}</div>
          {faltaDado ? (
            <div className="campo-dica alerta">
              Falta {!obra.area_construida && !obra.padrao ? "a área e o padrão" : !obra.area_construida ? "a área" : "o padrão"}: eles dão a régua de preço por
              m² para conferir o orçamento.
            </div>
          ) : null}
        </div>
        {podeOperar ? (
          <button type="button" className="btn" onClick={() => setModal("dados")}>
            Editar dados
          </button>
        ) : null}
      </section>

      {orc.erro ? (
        <div className="aviso-erro" role="alert">
          <Icone nome="alert" tam={15} />
          {orc.erro}
        </div>
      ) : null}

      {orc.carregando && !dado ? (
        <div className="carregando" role="status">
          <Icone nome="loader" className="spin" tam={15} />
          Carregando o orçamento…
        </div>
      ) : dado && !dado.versoes.length ? (
        <div className="card vazio">
          <Icone nome="planilha" tam={24} />
          <h3>Nenhum orçamento ainda</h3>
          <p>
            Importe a planilha do orçamento do jeito que ela está, com etapas, itens e subtotais. Você confere a prévia antes de gravar, e o total fecha no
            centavo com a planilha.
          </p>
          {materiais.length ? (
            <p className="mut sm" style={{ marginTop: 10 }}>
              A lista de materiais já tem {plural(materiais.length, "insumo", "insumos")} ({fmtReais(totalMateriais)}): ela é o que comprar e estocar, não o
              orçamento por etapas.
            </p>
          ) : null}
          {podeOperar ? (
            <button type="button" className="btn amb" style={{ marginTop: 16 }} onClick={() => setModal("importar")}>
              Importar planilha
            </button>
          ) : null}
        </div>
      ) : dado ? (
        <>
          {emOrcamento ? (
            <p className="mut sm">
              Aprovado, a obra passa para em andamento e o orçamento vira a referência de custo por etapa. Dá para desfazer pelo Histórico.
            </p>
          ) : null}
          <Versoes versoes={dado.versoes} />
          <Arvore orc={dado} />
          <p className="orc-fase mut sm">
            <Icone nome="info" tam={14} />
            <span>
              <b>Comprometido</b> (pedidos e contratos com fornecedores) e <b>Realizado</b> (notas e medições) entram aqui por etapa quando a obra estiver
              andando.
              {materiais.length ? ` A lista de materiais (${plural(materiais.length, "insumo", "insumos")}, ${fmtReais(totalMateriais)}) fica no Almoxarifado.` : ""}
            </span>
          </p>
        </>
      ) : null}

      {modal === "importar" ? <ImportarOrcamento obra={obra} fechar={() => setModal(null)} /> : null}
      {modal === "dados" ? <ModalDadosObra obra={obra} fechar={() => setModal(null)} /> : null}
      {modal === "aprovar" ? (
        <Confirmar titulo="Aprovar o orçamento?" confirmar="Aprovar orçamento" fechar={() => setModal(null)} aoConfirmar={aprovar}>
          <div className="prev-resumo">
            <div>
              <span className="prev-n">{fmtReais(temContrato ? (t?.atual ?? 0) : totalMateriais)}</span>
              <span>{temContrato ? "orçado atual" : "na lista de materiais"}</span>
            </div>
            <div>
              <span className="prev-n">{(temContrato ? (t?.n_itens ?? 0) : materiais.length).toLocaleString("pt-BR")}</span>
              <span>{temContrato ? ((t?.n_itens ?? 0) === 1 ? "item" : "itens") : materiais.length === 1 ? "insumo" : "insumos"}</span>
            </div>
          </div>
          <p className="mut" style={{ margin: "4px 0 0" }}>
            {obra.nome} sai de em orçamento e passa para em andamento. Dá para desfazer pelo Histórico enquanto nada mudar depois.
          </p>
        </Confirmar>
      ) : null}
    </div>
  );
}

function kpisDoOrcamento(t: DadosOrcamento["totais"], obra: Obra): Kpi[] {
  const pct = t.contratado ? (t.aditivos / t.contratado) * 100 : 0;
  const verba = tagVerba(t.atual, obra.verba);
  const ks: Kpi[] = [
    { icone: "calc", n: fmtReais(t.contratado), r: "contratado" },
    t.aditivos
      ? {
          icone: "plus",
          n: comSinal(t.aditivos),
          r: "em aditivos",
          tag: `${pct < 0 ? "−" : "+"}${Math.abs(pct).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
          tom: Math.abs(pct) > 25 ? "acima" : "info",
        }
      : { icone: "plus", n: "—", r: "nenhum aditivo" },
    { icone: "planilha", n: fmtReais(t.atual), r: `orçado atual · ${plural(t.n_itens, "item", "itens")}`, tag: verba?.texto, tom: verba?.tom },
  ];
  // O valor do contrato da obra só ganha número próprio quando não bate com o contrato importado. Centavos de
  // arredondamento entre a planilha e o contrato assinado não são diferença: ficam só no texto.
  const dif = obra.verba - t.contratado;
  if (obra.verba && Math.abs(dif) >= MARGEM_CENTAVOS)
    ks.push({ icone: "predio", n: fmtReais(obra.verba), r: `valor do contrato · ${fmtReais(Math.abs(dif))} ${dif > 0 ? "acima" : "abaixo"} do contratado` });
  else if (obra.verba && dif) ks[0]!.r = `contratado · diferença de ${fmtReais(Math.abs(dif))} do valor do contrato`;
  return ks;
}

/* ---------------- versões: o contrato e os aditivos, com Desfazer ---------------- */

function Versoes({ versoes }: { versoes: VersaoOrcamento[] }) {
  const { podeOperar, mudou, avisar } = useCasca();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const situacao = (v: VersaoOrcamento) =>
    v.ativa ? "vigente" : versoes.some((o) => o.substitui === v.id && o.ativa) ? "substituída" : "desfeita";

  const desfazer = async (v: VersaoOrcamento, regId: string) => {
    setOcupado(v.id);
    try {
      await api.desfazerRegistro(regId);
      mudou();
      avisar(`${nomeVersao(v)} desfeito.`);
    } catch (e) {
      avisar(mensagemDe(e), true);
    } finally {
      setOcupado(null);
    }
  };

  return (
    <section aria-label="Versões do orçamento">
      <h3 className="sectit">Versões</h3>
      <ul className="card lista orc-versoes">
        {versoes.map((v) => {
          const st = situacao(v);
          return (
            <li key={v.id} className={`orc-v${v.ativa ? "" : " desfeito"}`}>
              <div className="orc-v-t">
                <div>
                  <b>{nomeVersao(v)}</b>
                  {v.descricao ? <span>: {v.descricao}</span> : null}
                  <span className={`pill ${st === "vigente" ? "st-ok" : "st-orc"}`}>{st}</span>
                </div>
                <div className="mut sm">
                  {[fmtData(v.data), plural(v.itens, "item", "itens"), plural(v.etapas, "etapa", "etapas"), v.arquivo].filter(Boolean).join(" · ")}
                </div>
              </div>
              <span className="num orc-v-n">{v.tipo === "aditivo" ? comSinal(v.total) : fmtReais(v.total)}</span>
              {podeOperar && v.ativa && v.registro_id ? (
                <button
                  type="button"
                  className="btn hist-b"
                  disabled={ocupado === v.id}
                  aria-busy={ocupado === v.id}
                  onClick={() => desfazer(v, v.registro_id!)}
                  aria-label={`Desfazer ${nomeVersao(v)}`}
                >
                  {ocupado === v.id ? <Icone nome="loader" className="spin" tam={14} /> : <Icone nome="undo" tam={14} />}
                  Desfazer
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ---------------- árvore etapa → itens ---------------- */

interface Grupo {
  etapa: string;
  descricao: string;
  contratado: number;
  aditivos: number;
  atual: number;
  linhas: ItemComCurva[];
}

function agrupar(orc: DadosOrcamento): Grupo[] {
  const grupos = new Map<string, Grupo>();
  for (const e of orc.etapas) grupos.set(e.etapa, { ...e, linhas: [] });
  for (const i of orc.itens) {
    // A linha de etapa raiz é o próprio cabeçalho do grupo; sub-etapas viram linha de título dentro dele.
    if (i.tipo === "etapa" && i.nivel <= 1) continue;
    let g = grupos.get(i.etapa);
    if (!g) {
      g = { etapa: i.etapa, descricao: i.etapa ? `Etapa ${i.etapa}` : "Sem etapa", contratado: 0, aditivos: 0, atual: 0, linhas: [] };
      grupos.set(i.etapa, g);
    }
    g.linhas.push(i);
  }
  return [...grupos.values()];
}

const CURVAS: { k: CurvaABC | null; rotulo: string }[] = [
  { k: null, rotulo: "Todas" },
  { k: "A", rotulo: "Curva A" },
  { k: "B", rotulo: "B" },
  { k: "C", rotulo: "C" },
];

function Arvore({ orc }: { orc: DadosOrcamento }) {
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set());
  const [busca, setBusca] = useState("");
  const [curva, setCurva] = useState<CurvaABC | null>(null);
  const grupos = useMemo(() => agrupar(orc), [orc]);
  const versoes = useMemo(() => new Map(orc.versoes.map((v) => [v.id, v])), [orc.versoes]);
  const temAditivo = orc.etapas.some((e) => e.aditivos);
  const q = semAcento(busca.trim());
  const filtrando = !!q || !!curva;

  const visiveis = filtrando
    ? grupos
        .map((g) => ({
          ...g,
          linhas: g.linhas.filter(
            (i) =>
              i.tipo === "item" &&
              (!curva || i.curva === curva) &&
              (!q || semAcento(`${i.descricao} ${i.codigo} ${i.numero} ${i.fonte}`).includes(q)),
          ),
        }))
        .filter((g) => g.linhas.length)
    : grupos;
  const achados = visiveis.reduce((n, g) => n + g.linhas.length, 0);

  const alternar = (k: string) =>
    setAbertas((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const todasAbertas = grupos.length > 0 && grupos.every((g) => abertas.has(g.etapa));

  return (
    <section aria-label="Orçamento por etapa">
      <h3 className="sectit">Por etapa</h3>
      <div className="barra-acoes">
        <label className="busca">
          <Icone nome="busca" tam={16} />
          <span className="sr-only">Buscar item do orçamento</span>
          <input type="search" placeholder="Buscar por descrição, código ou nº" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <div className="seg seg-pq" role="radiogroup" aria-label="Filtrar por curva ABC">
          {CURVAS.map((c) => (
            <button key={c.rotulo} type="button" role="radio" aria-checked={curva === c.k} className={curva === c.k ? "on" : ""} onClick={() => setCurva(c.k)}>
              {c.rotulo}
            </button>
          ))}
        </div>
        {!filtrando ? (
          <button type="button" className="btn sm" onClick={() => setAbertas(todasAbertas ? new Set() : new Set(grupos.map((g) => g.etapa)))}>
            {todasAbertas ? "Recolher etapas" : "Abrir todas"}
          </button>
        ) : (
          <span className="mut sm" role="status">
            {achados ? `${plural(achados, "item", "itens")} em ${plural(visiveis.length, "etapa", "etapas")}` : "Nenhum item encontrado."}
          </span>
        )}
      </div>
      <div className="card eap">
        {visiveis.map((g) => {
          const aberta = filtrando || abertas.has(g.etapa);
          const id = `eap-${g.etapa || "sem"}`;
          return (
            <div key={g.etapa} className={`eap-et${aberta ? " aberta" : ""}`}>
              <button type="button" className="eap-cab" aria-expanded={aberta} aria-controls={id} disabled={filtrando} onClick={() => alternar(g.etapa)}>
                <Icone nome="chevRight" tam={15} className="eap-seta" />
                <span className="eap-num">{g.etapa}</span>
                <span className="eap-desc">{g.descricao}</span>
                {temAditivo && g.aditivos ? (
                  <span className="eap-tot mut sm">
                    {fmtReais(g.contratado)} contratado · {comSinal(g.aditivos)} aditivo
                  </span>
                ) : null}
                <span className="eap-tot num">{fmtReais(g.atual)}</span>
              </button>
              {aberta ? (
                <div className="eap-rola" id={id}>
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
                      {g.linhas.map((i) => {
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
                              {fmtQtd(i.quantidade)}
                              {/* no celular a coluna da unidade some: a quantidade carrega a unidade */}
                              <span className="eap-un"> {i.unidade}</span>
                            </td>
                            <td className="num">{fmtReais(i.valor_unitario)}</td>
                            <td className="num">
                              <b>{fmtReais(i.total)}</b>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          );
        })}
        {!visiveis.length && !filtrando ? <p className="mut sm" style={{ padding: "14px 20px", margin: 0 }}>Nenhum item vigente.</p> : null}
      </div>
    </section>
  );
}
