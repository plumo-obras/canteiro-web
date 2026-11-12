"use client";
/**
 * Aba Gastos: o dinheiro que saiu da obra. A pessoa envia o comprovante (foto ou PDF), o Plumo lê e sugere, e uma
 * pessoa confere e confirma; só então vira gasto, na etapa (e no tópico) da obra. A tela tem uma coisa principal: o
 * que espera conferência, em destaque no topo, com a revisão à vista. Depois, os gastos lançados (por data ou por
 * etapa) e, numa gaveta, as etapas e tópicos onde eles entram.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Comprovante, GastoObra, Obra, ResumoGastos } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { fmtDiaHora, fmtReais } from "@/lib/formato";
import { CabecalhoPagina, type Numero } from "./CabecalhoPagina";
import { useCasca } from "./contexto";
import { Drawer } from "./Dialogo";
import { Icone } from "./Icone";
import { useCelular } from "./midia";
import { BotaoMais, useMaisAntigos } from "./Paginacao";
import { useCarregar } from "./useCarregar";
import { Arvore } from "./gastos/Arvore";
import { EnviarComprovante } from "./gastos/EnviarComprovante";
import { MudarEtapa } from "./gastos/MudarEtapa";
import { ConferirCompacto, Revisao, RevisaoEmbutida } from "./gastos/Revisao";
import { fmtDia, foraDoOrcamento, lidoNaFila, rotuloEtapa } from "./gastos/escolhas";
import s from "./gastos/gastos.module.css";

type Agrupar = "data" | "etapa";
const AGRUPAR: { k: Agrupar; rotulo: string }[] = [
  { k: "data", rotulo: "Por data" },
  { k: "etapa", rotulo: "Por etapa" },
];

// a leitura leva até um minuto; depois disso, sem leitura e sem erro, ela não está mais acontecendo
const LENDO_MS = 2 * 60 * 1000;

export function Gastos({ obra }: { obra: Obra }) {
  const { versao, podeOperar, lerFiltroTela, limparFiltroTela } = useCasca();
  const celular = useCelular();
  const [mudando, setMudando] = useState<GastoObra | null>(null);
  const [soSemEtapa, setSoSemEtapa] = useState(() => lerFiltroTela("gastos")?.status === "a_definir");
  const [agrupar, setAgrupar] = useState<Agrupar>("data");
  useEffect(limparFiltroTela, [limparFiltroTela]);
  const [enviando, setEnviando] = useState(false);
  const [revisando, setRevisando] = useState<string | null>(null);
  const [verArvore, setVerArvore] = useState(false);
  // o comprovante aberto no bloco "A conferir"; sem escolha, o primeiro da fila
  const [atual, setAtual] = useState<string | null>(null);
  // confirmados ou descartados nesta tela: saem do bloco na hora, sem esperar a fila recarregar
  const [feitos, setFeitos] = useState<string[]>([]);
  const blocoConferir = useRef<HTMLElement>(null);
  const { dado, erro, carregando } = useCarregar(
    () =>
      Promise.all([api.listarComprovantes(obra.id, "a_revisar"), api.resumoGastos(obra.id), api.arvore(obra.id)]),
    [obra.id, versao],
  );
  const [filaToda, resumo, arvore] = dado ?? [[], null, []];
  const fila = filaToda.filter((c) => !feitos.includes(c.id));
  // nomes de etapa e tópico já arquivados: só o resumo ainda os tem
  const nomesResumo = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of resumo?.etapas ?? []) {
      if (e.etapa) m.set(e.etapa, e.nome);
      for (const t of e.topicos) if (t.topico_id) m.set(t.topico_id, t.nome);
    }
    return m;
  }, [resumo]);

  const numeros: Numero[] = [];
  if (resumo) {
    // Sem total aqui: o gasto da obra é um número só, o "Gasto até hoje" do placar. resumo.total é só o avulso.
    if (resumo.a_revisar) numeros.push({ rotulo: "A conferir", valor: `${resumo.a_revisar}`, tag: "não contam ainda", tom: "atencao" });
    if (resumo.pagamentos_de_pedidos) numeros.push({ rotulo: "Pagamentos de pedidos", valor: fmtReais(resumo.pagamentos_de_pedidos), sub: "já contam pela entrega" });
    // sem isto, quem compara com o placar não acha o que foi entregue e não pago ("onde foram parar os 25 mil?")
    if (resumo.entregue_a_pagar) numeros.push({ rotulo: "Entregue, ainda a pagar", valor: fmtReais(resumo.entregue_a_pagar), sub: "já conta no gasto" });
    // só marca: o vidro comprado sem pedido conta na etapa como qualquer gasto, mas não estava no que se orçou
    if (resumo.fora_do_orcado) numeros.push({ rotulo: "Fora de pedido", valor: fmtReais(resumo.fora_do_orcado), sub: "lançado sem pedido de compra" });
  }

  const terminou = (id: string) => {
    setFeitos((f) => [...f, id]);
    setAtual(null);
  };

  return (
    <div className="page">
      <CabecalhoPagina
        titulo="Gastos"
        sub={celular ? undefined : "Mande a foto de uma nota, Pix, boleto ou recibo. O Plumo lê e preenche; você confere e confirma."}
        acao={
          celular ? null : (
            <button type="button" className="btn amb" onClick={() => setEnviando(true)}>
              <Icone nome="plus" tam={15} />
              Enviar comprovante
            </button>
          )
        }
        numeros={numeros}
      />
      {/* no celular a ação vem antes de tudo, grande: é o que se faz na obra, com o comprovante na mão */}
      {celular ? (
        <button type="button" className={s.fotografar} onClick={() => setEnviando(true)}>
          <span className={s.fotografarIc} aria-hidden="true">
            <Icone nome="camera" tam={20} />
          </span>
          <span className={s.fotografarTexto}>
            <b>Fotografar comprovante</b>
            <span className="mut sm">Nota, Pix, boleto ou recibo. O Plumo lê e preenche.</span>
          </span>
        </button>
      ) : null}
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
        <>
          <AConferir
            ref={blocoConferir}
            obra={obra}
            fila={fila}
            atual={atual && !feitos.includes(atual) ? atual : null}
            celular={celular}
            escolher={setAtual}
            abrirModal={setRevisando}
            terminou={terminou}
          />
          <section className={s.lancadosSec} aria-labelledby="gastos-lancados">
            <div className={s.lancadosCab}>
              <h2 className={`sectit ${s.lancadosT}`} id="gastos-lancados">
                Lançados
              </h2>
              <div className="seg seg-pq" role="tablist" aria-label="Agrupar os lançados">
                {AGRUPAR.map((x) => (
                  <button key={x.k} type="button" role="tab" aria-selected={agrupar === x.k} className={agrupar === x.k ? "on" : ""} onClick={() => setAgrupar(x.k)}>
                    {x.rotulo}
                  </button>
                ))}
              </div>
              <span className={s.sp} />
              <button type="button" className="btn sm" aria-haspopup="dialog" onClick={() => setVerArvore(true)}>
                Etapas e tópicos
              </button>
            </div>
            <div role="tabpanel" aria-label={AGRUPAR.find((x) => x.k === agrupar)!.rotulo}>
              {agrupar === "etapa" ? (
                <PorEtapa resumo={resumo} />
              ) : (
                <Lancados
                  obra={obra}
                  semEtapa={(resumo?.etapas ?? []).filter((e) => foraDoOrcamento(arvore, e.etapa)).reduce((t, e) => t + e.total, 0)}
                  etapaDe={(g) => (g.etapa === null ? (g.etapa_nome ?? "Sem etapa") : rotuloEtapa(arvore, g.etapa, g.topico_id, nomesResumo))}
                  aDefinir={resumo?.a_definir ?? 0}
                  soSemEtapa={soSemEtapa}
                  verTodos={() => setSoSemEtapa(false)}
                  fora={(g) => foraDoOrcamento(arvore, g.etapa)}
                  podeMudar={podeOperar}
                  mudar={setMudando}
                  verComprovante={setRevisando}
                />
              )}
            </div>
          </section>
        </>
      ) : null}
      {verArvore ? (
        <Drawer titulo="Etapas e tópicos" fechar={() => setVerArvore(false)}>
          <Arvore obra={obra} arvore={arvore} resumo={resumo} />
        </Drawer>
      ) : null}
      {enviando ? (
        <EnviarComprovante
          obra={obra}
          fechar={() => setEnviando(false)}
          revisar={(id) => {
            setEnviando(false);
            // no computador a revisão abre no próprio bloco; no celular, o compacto não tem os campos: abre o modal
            if (celular) setRevisando(id);
            else {
              setAtual(id);
              blocoConferir.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
            }
          }}
        />
      ) : null}
      {mudando ? <MudarEtapa gasto={mudando} arvore={arvore} fechar={() => setMudando(null)} /> : null}
      {revisando ? <Revisao comprovanteId={revisando} obra={obra} fechar={() => setRevisando(null)} /> : null}
    </div>
  );
}

/**
 * O bloco "A conferir", em destaque: o comprovante aberto (a revisão inteira no computador; o compacto no celular) e,
 * se houver mais de um, a fila logo abaixo para trocar. Sem nada na fila, uma linha só, sem disputar atenção.
 */
function AConferir(p: {
  ref: React.Ref<HTMLElement>;
  obra: Obra;
  fila: Comprovante[];
  atual: string | null;
  celular: boolean;
  escolher: (id: string) => void;
  abrirModal: (id: string) => void;
  terminou: (id: string) => void;
}) {
  const aberto = p.atual ?? p.fila[0]?.id ?? null;
  const n = p.fila.length + (aberto && !p.fila.some((c) => c.id === aberto) ? 1 : 0);
  if (!aberto)
    return (
      <section ref={p.ref} className={`card ${s.conferirVazio}`} aria-label="A conferir">
        <Icone nome="check" tam={16} />
        <span>
          <b>Nada a conferir.</b> <span className="mut">Cada comprovante enviado aparece aqui até alguém confirmar.</span>
        </span>
      </section>
    );
  const c = p.fila.find((x) => x.id === aberto);
  return (
    <section ref={p.ref} className={`card ${s.conferir}`} aria-labelledby="gastos-conferir">
      <div className={s.conferirCab}>
        <h2 className={s.conferirT} id="gastos-conferir">
          A conferir · {n}
        </h2>
        {c ? <SeloLeitura c={c} /> : null}
        {c ? (
          <span className="mut sm">
            {c.quem || "Alguém"} · enviado {fmtDiaHora(c.criado_em)}
          </span>
        ) : null}
      </div>
      {p.celular ? (
        <ConferirCompacto key={aberto} comprovanteId={aberto} obra={p.obra} corrigir={() => p.abrirModal(aberto)} terminou={() => p.terminou(aberto)} />
      ) : (
        <RevisaoEmbutida key={aberto} comprovanteId={aberto} obra={p.obra} terminou={() => p.terminou(aberto)} />
      )}
      {n > 1 ? (
        <>
          <h3 className={s.filaT}>Na fila</h3>
          <Fila fila={p.fila} aberto={aberto} abrir={p.celular ? p.abrirModal : p.escolher} />
        </>
      ) : null}
    </section>
  );
}

function lendoAgora(c: Comprovante) {
  return !c.leitura && !c.erro_leitura && Date.now() - new Date(c.criado_em).getTime() < LENDO_MS;
}

function SeloLeitura({ c }: { c: Comprovante }) {
  if (c.leitura) return <span className="pill info">lido pelo Plumo</span>;
  if (c.erro_leitura) return <span className="pill warn">sem leitura: preencher à mão</span>;
  return <span className="pill">{lendoAgora(c) ? "lendo" : "ainda não lido"}</span>;
}

/** A fila do bloco: uma linha por comprovante com o que o Plumo leu; o aberto fica marcado e não tem botão. */
function Fila({ fila, aberto, abrir }: { fila: Comprovante[]; aberto: string; abrir: (id: string) => void }) {
  return (
    <ul className={`${s.fila}`} role="list" aria-label="Comprovantes na fila">
      {fila.map((c) => {
        const lido = lidoNaFila(c.leitura);
        // sem legenda, o que identifica o comprovante é o que o Plumo leu: o que foi pago, o valor e quem recebeu
        const titulo = c.legenda || lido?.descricao || "Comprovante";
        const lendo = lendoAgora(c);
        const eh = c.id === aberto;
        return (
          <li key={c.id} className={`${s.linha}${eh ? ` ${s.linhaAberta}` : ""}`} aria-current={eh ? "true" : undefined}>
            <div className={s.linhaTopo}>
              <span className={s.filaTitulo}>
                <Icone nome={c.tipo_conteudo === "application/pdf" ? "planilha" : "recibo"} tam={15} /> <strong>{titulo}</strong>
              </span>
              {eh ? (
                <span className="pill info">aberto</span>
              ) : (
                <button type="button" className="btn sm" onClick={() => abrir(c.id)} aria-label={`Revisar ${titulo}${lido?.valor ? `, ${lido.valor}` : ""}`}>
                  Revisar
                </button>
              )}
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
          </li>
        );
      })}
    </ul>
  );
}

/** O gasto confirmado somado por etapa (e tópico), com o entregue a pagar e o fora de pedido de cada uma. */
function PorEtapa({ resumo }: { resumo: ResumoGastos | null }) {
  if (!resumo?.etapas.length) return <Vazio texto="Nenhum gasto confirmado ainda. Envie um comprovante e confirme na revisão." />;
  return (
    <ul className={`card lista ${s.lista}`} role="list">
      {resumo.etapas.map((e) => (
        <li key={e.etapa ?? "sem-etapa"} className={s.linha}>
          <div className={s.linhaTopo}>
            <strong>{e.nome}</strong>
            <span className={s.valor}>{fmtReais(e.total)}</span>
          </div>
          {e.entregue_a_pagar ? <div className="mut sm">+ {fmtReais(e.entregue_a_pagar)} entregue, ainda a pagar</div> : null}
          {e.fora_do_orcado ? <div className="mut sm">{fmtReais(e.fora_do_orcado)} fora de pedido</div> : null}
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
  /** Soma, do resumo, dos gastos em "Ver depois". */
  aDefinir: number;
  /** Veio de "Definir a etapa": a lista abre só com os gastos sem etapa. */
  soSemEtapa: boolean;
  verTodos: () => void;
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
  const visiveis = p.soSemEtapa ? itens.filter((g) => g.etapa === null) : itens;
  return (
    <>
      {p.aDefinir ? (
        <div className={`${s.aviso} ${s.avisoTopo}`} role="status">
          <Icone nome="alert" tam={14} />
          <span>{fmtReais(p.aDefinir)} em gastos sem etapa, para definir.</span>
        </div>
      ) : null}
      {p.semEtapa ? (
        <div className={`${s.aviso} ${s.avisoTopo}`} role="status">
          <Icone nome="alert" tam={14} />
          <span>
            {fmtReais(p.semEtapa)} em gastos sem etapa do orçamento.{" "}
            {p.podeMudar ? "Use “Mudar etapa” para pôr cada um na etapa certa." : "Quem opera a obra escolhe a etapa certa."}
          </span>
        </div>
      ) : null}
      {p.soSemEtapa ? (
        <p className="mut sm">
          Só os gastos sem etapa.{" "}
          <button type="button" className="link" onClick={p.verTodos}>
            Ver todos
          </button>
        </p>
      ) : null}
      <div className={`card ${s.lancados}${p.podeMudar ? "" : ` ${s.semAcao}`}`}>
        {/* os rótulos das colunas só no computador; cada linha já diz o que é para o leitor de tela */}
        <div className={s.lancCab} aria-hidden="true">
          <span>Data</span>
          <span>O que foi pago</span>
          <span>Etapa · origem</span>
          <span className={s.lValor}>Valor</span>
          {p.podeMudar ? <span /> : null}
        </div>
        <ul className={s.lancLista} role="list" aria-label="Gastos lançados">
          {visiveis.map((g) => {
            const fora = p.fora(g);
            return (
              <li key={g.id} className={`${s.lanc}${fora ? ` ${s.linhaFora}` : ""}`}>
                <span className={`mut sm ${s.lData}`}>{fmtDia(g.data_pagamento)}</span>
                <span className={s.lDesc}>
                  <strong>{g.descricao}</strong> <span className="mut sm">{g.favorecido}</span>
                </span>
                <span className={`sm ${s.lEtapa}`}>
                  {g.etapa === null ? (
                    p.podeMudar ? (
                      <button type="button" className={s.link} onClick={() => p.mudar(g)} aria-label={`Definir etapa de ${g.descricao}`}>
                        Sem etapa · definir
                      </button>
                    ) : (
                      <span className="pill warn">Sem etapa</span>
                    )
                  ) : fora ? (
                    <>
                      <span className="pill warn">sem etapa do orçamento</span> <span className={s.etapaVelha}>{p.etapaDe(g)}</span>
                    </>
                  ) : (
                    <span className="mut">{p.etapaDe(g)}</span>
                  )}
                  {g.pedido_id ? (
                    <span className="pill info">pagamento de pedido</span>
                  ) : g.fora_do_orcado ? (
                    <span className="pill">fora de pedido</span>
                  ) : null}
                  {g.comprovante_id ? (
                    <button type="button" className={s.link} onClick={() => p.verComprovante(g.comprovante_id!)}>
                      ver comprovante
                    </button>
                  ) : null}
                </span>
                <span className={`${s.valor} ${s.lValor}`}>{fmtReais(g.valor)}</span>
                {p.podeMudar ? (
                  <span className={s.lAcao}>
                    {g.etapa !== null ? (
                      <button type="button" className={`btn sm${fora ? " amb" : ""}`} onClick={() => p.mudar(g)} aria-label={`Mudar etapa de ${g.descricao}`}>
                        Mudar etapa
                      </button>
                    ) : null}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
      {aviso}
      <BotaoMais acabou={acabou} buscando={buscando} carregarMais={carregarMais} rotulo="Carregar gastos mais antigos" />
    </>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <div className="card vazio sm">{texto}</div>;
}
