"use client";
/**
 * Aba Gastos: o dinheiro que saiu da obra. A pessoa envia o comprovante (foto ou PDF), a IA lê e sugere, e uma pessoa
 * confere e confirma; só então vira gasto, na etapa (e no tópico) da obra. Seções: o que espera revisão, o gasto por
 * etapa, os gastos lançados e as etapas e tópicos onde eles entram.
 */
import { useMemo, useState } from "react";
import type { Comprovante, GastoObra, Obra } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { fmtDiaHora, fmtReais } from "@/lib/formato";
import { CabecalhoPagina, type Numero } from "./CabecalhoPagina";
import { useCasca } from "./contexto";
import { Icone } from "./Icone";
import { BotaoMais, useMaisAntigos } from "./Paginacao";
import { useCarregar } from "./useCarregar";
import { Arvore } from "./gastos/Arvore";
import { EnviarComprovante } from "./gastos/EnviarComprovante";
import { MudarEtapa } from "./gastos/MudarEtapa";
import { Revisao } from "./gastos/Revisao";
import { fmtDia, foraDoOrcamento, lidoNaFila, rotuloEtapa } from "./gastos/escolhas";
import s from "./gastos/gastos.module.css";

type Secao = "revisar" | "etapas" | "lancados" | "arvore";
// `curto` é o rótulo no celular: os quatro inteiros não cabem em 390 px
const SECOES: { k: Secao; rotulo: string; curto: string }[] = [
  { k: "revisar", rotulo: "A revisar", curto: "Revisar" },
  { k: "etapas", rotulo: "Por etapa", curto: "Por etapa" },
  { k: "lancados", rotulo: "Lançados", curto: "Lançados" },
  { k: "arvore", rotulo: "Etapas e tópicos", curto: "Etapas" },
];

// a leitura leva até um minuto; depois disso, sem leitura e sem erro, ela não está mais acontecendo
const LENDO_MS = 2 * 60 * 1000;

export function Gastos({ obra }: { obra: Obra }) {
  const { versao, podeOperar } = useCasca();
  const [mudando, setMudando] = useState<GastoObra | null>(null);
  const [secao, setSecao] = useState<Secao>("revisar");
  const [enviando, setEnviando] = useState(false);
  const [revisando, setRevisando] = useState<string | null>(null);
  const { dado, erro, carregando } = useCarregar(
    () =>
      Promise.all([api.listarComprovantes(obra.id, "a_revisar"), api.resumoGastos(obra.id), api.arvore(obra.id)]),
    [obra.id, versao],
  );
  const [fila, resumo, arvore] = dado ?? [[], null, []];
  // nomes de etapa e tópico já arquivados: só o resumo ainda os tem
  const nomesResumo = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of resumo?.etapas ?? []) {
      m.set(e.etapa, e.nome);
      for (const t of e.topicos) if (t.topico_id) m.set(t.topico_id, t.nome);
    }
    return m;
  }, [resumo]);

  const numeros: Numero[] = [];
  if (resumo) {
    numeros.push({ rotulo: "Gasto na obra", valor: fmtReais(resumo.total), sub: "confirmado, fora pagamento de pedido" });
    if (resumo.a_revisar) numeros.push({ rotulo: "A revisar", valor: `${resumo.a_revisar}`, tag: "não contam ainda", tom: "atencao" });
    if (resumo.pagamentos_de_pedidos) numeros.push({ rotulo: "Pagamentos de pedidos", valor: fmtReais(resumo.pagamentos_de_pedidos), sub: "já contam pela entrega" });
  }

  const abas = (
    <div className={`seg ${s.segGastos}`} role="tablist" aria-label="Seções de Gastos">
      {SECOES.map((x) => (
        <button
          key={x.k}
          type="button"
          role="tab"
          aria-selected={secao === x.k}
          // o nome é sempre o rótulo inteiro: no celular só o curto aparece, e o escondido não daria nome à aba
          aria-label={x.k === "revisar" && fila.length ? `${x.rotulo} (${fila.length})` : x.rotulo}
          className={secao === x.k ? "on" : ""}
          onClick={() => setSecao(x.k)}
        >
          <span className={s.rotuloLongo}>{x.rotulo}</span>
          <span className={s.rotuloCurto}>{x.curto}</span>
          {x.k === "revisar" && fila.length ? <small className="seg-n">{fila.length}</small> : null}
        </button>
      ))}
    </div>
  );

  const acao = (
    <button type="button" className="btn amb" onClick={() => setEnviando(true)}>
      <Icone nome="plus" tam={15} />
      Enviar comprovante
    </button>
  );

  return (
    <div className="page">
      <CabecalhoPagina titulo="Gastos" acao={acao} numeros={numeros} barra={abas} />
      {erro ? (
        <div className="aviso-erro" role="alert">
          <Icone nome="alert" tam={15} />
          {erro}
        </div>
      ) : null}
      {carregando && !dado ? (
        <div className="carregando" role="status">
          <Icone nome="loader" className="spin" tam={15} />
          Carregando gastos…
        </div>
      ) : dado ? (
        <div role="tabpanel" aria-label={SECOES.find((x) => x.k === secao)!.rotulo}>
          {secao === "revisar" ? (
            <Fila fila={fila} abrir={setRevisando} enviar={() => setEnviando(true)} />
          ) : secao === "etapas" ? (
            !resumo?.etapas.length ? (
              <Vazio texto="Nenhum gasto confirmado ainda. Envie um comprovante e confirme na revisão." />
            ) : (
              <ul className={`card lista ${s.lista}`} role="list">
                {resumo.etapas.map((e) => (
                  <li key={e.etapa} className={s.linha}>
                    <div className={s.linhaTopo}>
                      <strong>{e.nome}</strong>
                      <span className={s.valor}>{fmtReais(e.total)}</span>
                    </div>
                    {e.topicos.length > 1 || e.topicos[0]?.topico_id ? (
                      <ul className={s.sublista} role="list">
                        {e.topicos.map((t) => (
                          <li key={t.topico_id ?? "sem"}>
                            <span className="mut">{t.nome}</span>
                            <span className={s.valor}>{fmtReais(t.total)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            )
          ) : secao === "lancados" ? (
            <Lancados
              obra={obra}
              semEtapa={(resumo?.etapas ?? []).filter((e) => foraDoOrcamento(arvore, e.etapa)).reduce((t, e) => t + e.total, 0)}
              etapaDe={(g) => rotuloEtapa(arvore, g.etapa, g.topico_id, nomesResumo)}
              fora={(g) => foraDoOrcamento(arvore, g.etapa)}
              podeMudar={podeOperar}
              mudar={setMudando}
              verComprovante={setRevisando}
            />
          ) : (
            <Arvore obra={obra} arvore={arvore} resumo={resumo} />
          )}
        </div>
      ) : null}
      {enviando ? (
        <EnviarComprovante
          obra={obra}
          fechar={() => setEnviando(false)}
          revisar={(id) => {
            setEnviando(false);
            setSecao("revisar");
            setRevisando(id);
          }}
        />
      ) : null}
      {mudando ? <MudarEtapa gasto={mudando} arvore={arvore} fechar={() => setMudando(null)} /> : null}
      {revisando ? <Revisao comprovanteId={revisando} obra={obra} fechar={() => setRevisando(null)} /> : null}
    </div>
  );
}

function Fila({ fila, abrir, enviar }: { fila: Comprovante[]; abrir: (id: string) => void; enviar: () => void }) {
  if (!fila.length)
    return (
      <div className="card vazio">
        <Icone nome="recibo" tam={26} />
        <h3>Nada esperando revisão</h3>
        <p>Envie a foto de uma nota, Pix, boleto pago ou recibo. A IA lê e preenche; você confere e confirma.</p>
        <button type="button" className="btn amb" style={{ marginTop: 16 }} onClick={enviar}>
          <Icone nome="plus" tam={15} />
          Enviar comprovante
        </button>
      </div>
    );
  return (
    <ul className={`card lista ${s.lista}`} role="list">
      {fila.map((c) => {
        const lido = lidoNaFila(c.leitura);
        // sem legenda, o que identifica o comprovante é o que a IA leu: o que foi pago, o valor e quem recebeu
        const titulo = c.legenda || lido?.descricao || "Comprovante";
        const lendo = !c.leitura && !c.erro_leitura && Date.now() - new Date(c.criado_em).getTime() < LENDO_MS;
        return (
          <li key={c.id} className={s.linha}>
            <div className={s.linhaTopo}>
              <span className={s.filaTitulo}>
                <Icone nome={c.tipo_conteudo === "application/pdf" ? "planilha" : "recibo"} tam={15} /> <strong>{titulo}</strong>
              </span>
              <button type="button" className="btn sm pri" onClick={() => abrir(c.id)} aria-label={`Revisar ${titulo}${lido?.valor ? `, ${lido.valor}` : ""}`}>
                Revisar
              </button>
            </div>
            <div className={s.filaLido}>
              {lido ? (
                <>
                  <span className={s.valor}>{lido.valor ?? "valor não lido"}</span>
                  {lido.favorecido ? <span> · {lido.favorecido}</span> : null}
                  {lido.data ? <span className="mut"> · pago em {lido.data}</span> : null}
                  {lido.duvida ? <span className="pill warn">confira</span> : null}
                </>
              ) : lendo ? (
                <span className="mut">
                  <Icone nome="loader" className="spin" tam={13} /> lendo…
                </span>
              ) : (
                <span className="mut">não lido: valor e favorecido à mão</span>
              )}
            </div>
            <div className="mut sm">
              {c.quem || "Alguém"} · enviado {fmtDiaHora(c.criado_em)} ·{" "}
              {c.leitura ? (
                <span className="pill ok">lido pela IA</span>
              ) : c.erro_leitura ? (
                <span className="pill warn">sem leitura: preencher à mão</span>
              ) : lendo ? (
                <span className="pill">lendo</span>
              ) : (
                <span className="pill">ainda não lido</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const POR_PAGINA = 50;
// o teto de `limite` na API: rebuscar o que já estava carregado (depois de mudar uma etapa) vem em uma chamada só
const MAX_API = 500;

/**
 * Os gastos lançados, mais novos primeiro, em páginas de 50 pelo cursor da API: uma obra de prédio passa de centenas de
 * comprovantes, e a lista não pode parar nos primeiros. Cada um pode mudar de etapa (admin): é o caminho do gasto que
 * ficou "sem etapa do orçamento" quando a obra passou a usar as etapas do orçamento. Mudar não volta à 1ª página: a
 * lista rebusca o que já estava carregado e a pessoa continua onde estava.
 */
function Lancados(p: {
  obra: Obra;
  /** Soma, do resumo, dos gastos sem etapa do orçamento: a lista só tem as páginas carregadas e contaria errado. */
  semEtapa: number;
  etapaDe: (g: GastoObra) => string;
  fora: (g: GastoObra) => boolean;
  podeMudar: boolean;
  mudar: (g: GastoObra) => void;
  verComprovante: (id: string) => void;
}) {
  const { versao } = useCasca();
  const { itens, erro, acabou, buscando, carregarMais } = useMaisAntigos(
    (antes_de, limite = POR_PAGINA) => api.listarGastos(p.obra.id, { limite: Math.min(limite, MAX_API), antes_de }),
    POR_PAGINA,
    [p.obra.id],
    undefined,
    [versao],
  );
  const aviso = erro ? (
    <div className="aviso-erro" role="alert">
      <Icone nome="alert" tam={15} />
      {erro}
    </div>
  ) : null;
  if (!itens) return aviso;
  if (!itens.length) return <Vazio texto="Nenhum gasto lançado ainda." />;
  return (
    <>
      {p.semEtapa ? (
        <div className={`${s.aviso} ${s.avisoTopo}`} role="status">
          <Icone nome="alert" tam={14} />
          <span>
            {fmtReais(p.semEtapa)} em gastos sem etapa do orçamento.{" "}
            {p.podeMudar ? "Use “Mudar etapa” para pôr cada um na etapa certa." : "Quem opera a obra escolhe a etapa certa."}
          </span>
        </div>
      ) : null}
      <ul className={`card lista ${s.lista}`} role="list" aria-label="Gastos lançados">
        {itens.map((g) => {
          const fora = p.fora(g);
          return (
            <li key={g.id} className={`${s.linha}${fora ? ` ${s.linhaFora}` : ""}`}>
              <div className={s.linhaTopo}>
                <span>
                  <strong>{g.descricao}</strong> <span className="mut">· {g.favorecido}</span>
                </span>
                <span className={s.valor}>{fmtReais(g.valor)}</span>
              </div>
              <div className={`mut sm ${s.linhaMeta}`}>
                <span>
                  {fmtDia(g.data_pagamento)} ·{" "}
                  {fora ? (
                    <>
                      <span className="pill warn">sem etapa do orçamento</span> <span className={s.etapaVelha}>{p.etapaDe(g)}</span>
                    </>
                  ) : (
                    p.etapaDe(g)
                  )}
                  {g.pedido_id ? (
                    <>
                      {" "}
                      · <span className="pill info">pagamento de pedido</span>
                    </>
                  ) : null}
                  {g.comprovante_id ? (
                    <>
                      {" "}
                      ·{" "}
                      <button type="button" className={s.link} onClick={() => p.verComprovante(g.comprovante_id!)}>
                        ver comprovante
                      </button>
                    </>
                  ) : null}
                </span>
                {p.podeMudar ? (
                  <button type="button" className={`btn sm${fora ? " amb" : ""}`} onClick={() => p.mudar(g)} aria-label={`Mudar etapa de ${g.descricao}`}>
                    Mudar etapa
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {aviso}
      <BotaoMais acabou={acabou} buscando={buscando} carregarMais={carregarMais} rotulo="Carregar gastos mais antigos" />
    </>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <div className="card vazio sm">{texto}</div>;
}
