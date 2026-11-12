"use client";
/**
 * Aba Cronograma (Fase 4): o físico-financeiro (etapas × meses em %), as medições mensais e o prazo. A API calcula o
 * mensal, o medido e o término projetado (GET /obras/{id}/cronograma); a tela mostra, desenha a curva S e edita. O
 * topo diz numa linha quando termina, se está em dia e quanto foi medido; embaixo, uma vista por vez (Etapas, Curva S,
 * Desembolso), como no protótipo. As medições, a tabela, editar e o aditivo ficam no "⋯". Sem cronograma, o estado
 * vazio leva ao editor; na demonstração, que não tem cronograma, entra o fictício de lib/simulado. O aditivo de prazo
 * muda o prazo da obra (PATCH, com Desfazer) e abre o editor com os meses a mais, vazios, para redistribuir.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Cronograma as DadosCronograma, Obra, PrazoCronograma, Proposta } from "@/lib/contrato";
import { api, conversar as conversarComAgente } from "@/lib/cliente";
import { fmtMes, fmtMesLongo, fmtPct, indiceDoMes, listaMeses, situacaoEtapa } from "@/lib/cronograma";
import { AVISO_PREVIA, cronogramaSimulado } from "@/lib/simulado/cronograma";
import { mensagemDe, useCasca } from "../contexto";
import { CartaoProposta } from "../CartaoProposta";
import { BaseOrcamento } from "./BaseOrcamento";
import { Drawer, Modal } from "../Dialogo";
import { BotaoPlumo } from "../BotaoPlumo";
import { Icone } from "../Icone";
import { MenuMais, type ItemMenu } from "../MenuMais";
import { useCelular } from "../midia";
import { useCarregar } from "../useCarregar";
import { Campo, ErroApi, useEnvio } from "../formularios/Campos";
import { CurvaS } from "./CurvaS";
import { Desembolso } from "./Desembolso";
import { Gantt, type FiltroGantt } from "./Gantt";
import c from "./cronograma.module.css";
import { TabelaFisicoFinanceira } from "./Tabela";
import { EditorCronograma } from "./Editor";
import { ListaMedicoes, ModalMedicao } from "./Medicao";

/** "3 meses de atraso" · "1,4 mês de atraso" · "em dia" · "adiantada 0,5 mês", a partir dos décimos de mês. */
export function situacaoAtraso(decimos: number | null | undefined, meses: number | null | undefined): { texto: string; tom: "ok" | "acima" | "info" } | null {
  if (meses === null || meses === undefined) return null;
  const dec = decimos ?? meses * 10;
  if (dec === 0) return { texto: "em dia", tom: "ok" };
  const abs = Math.abs(dec);
  const n = abs % 10 ? (abs / 10).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : String(abs / 10);
  // "1,4 mês" e "0,5 mês": abaixo de 2 o substantivo fica no singular, como se fala.
  const txt = `${n} ${abs < 20 ? "mês" : "meses"}`;
  return dec > 0 ? { texto: `${txt} de atraso`, tom: "acima" } : { texto: `adiantada ${txt}`, tom: "ok" };
}

export const situacaoPrazo = (p: PrazoCronograma) => situacaoAtraso(p.atraso_decimos, p.atraso_meses);


/**
 * O topo numa linha: "Termina set/2027 · em dia · 7,65% medido". O projetado só aparece quando difere do contratual,
 * e o atraso contra o cronograma original só depois de reprogramar.
 */
export function textoPrazo(c: DadosCronograma): { termina: string; contrato: string | null; sit: { texto: string; tom: string } | null; medido: string | null; base: string | null } {
  const p = c.prazo;
  const sit = situacaoPrazo(p);
  const projetado = sit && p.termino_projetado && p.termino_projetado !== p.termino_contratual;
  const sb = c.revisoes && p.termino_base ? situacaoAtraso(p.atraso_base_decimos, p.atraso_base_meses) : null;
  return {
    termina: fmtMesLongo(projetado ? p.termino_projetado : p.termino_contratual),
    contrato: projetado ? fmtMesLongo(p.termino_contratual) : null,
    sit,
    medido: p.pct_medido !== null ? `${fmtPct(p.pct_medido)} medido` : null,
    base: sb && sb.texto !== "em dia" ? `${sb.texto} contra o original` : null,
  };
}

/**
 * A linha de contexto do cabeçalho, como no protótipo: "Termina em set/2027 · em dia · 7,65% medido". O contrato e o
 * atraso contra o original só aparecem quando dizem algo (projetado ≠ contratual; depois de reprogramar).
 */
function LinhaPrazo({ crono }: { crono: DadosCronograma }) {
  const t = textoPrazo(crono);
  const atrasada = t.sit?.tom === "acima";
  return (
    <>
      <span>Termina em {t.termina}</span> · <span className={atrasada ? c.atraso : undefined}>{t.sit ? t.sit.texto : "sem medição ainda"}</span>
      {t.medido ? (
        <>
          {" · "}
          <span>{t.medido}</span>
        </>
      ) : null}
      {t.contrato ? <> · contrato: {t.contrato}</> : null}
      {t.base ? (
        <>
          {" · "}
          <span className={c.atraso}>{t.base}</span>
        </>
      ) : null}
    </>
  );
}

/** "semana 2 de 44": a semana de hoje na obra, contando do 1º dia do mês de início até o fim do último mês. */
export function semanaDaObra(inicio: string, meses: number, agora = new Date()): { atual: number; total: number } {
  const [a, m] = inicio.split("-").map(Number) as [number, number];
  const de = Date.UTC(a, m - 1, 1);
  const ate = Date.UTC(a, m - 1 + meses, 1);
  const hoje = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora) + "T00:00:00Z").getTime();
  const total = Math.ceil((ate - de) / (7 * 864e5));
  return { atual: Math.min(total, Math.max(1, Math.floor((hoje - de) / (7 * 864e5)) + 1)), total };
}

/** O prazo no celular, num cartão: término e situação em destaque, o medido e a semana da obra embaixo. */
function PrazoCelular({ crono }: { crono: DadosCronograma }) {
  const t = textoPrazo(crono);
  const sem = semanaDaObra(crono.inicio!, crono.meses);
  return (
    <section className={c.celPrazo} aria-label="Prazo">
      <span className={c.meta}>Termina em</span>
      <b>
        {t.termina} · <span className={t.sit?.tom === "acima" ? c.atraso : undefined}>{t.sit?.texto ?? "sem medição ainda"}</span>
      </b>
      <span className={c.meta}>
        {t.medido ? `${t.medido} · ` : ""}semana {sem.atual} de {sem.total}
      </span>
    </section>
  );
}

/**
 * No modo real a API não gera cronograma: quem propõe é o agente (Claude). Pedimos pela conversa e devolvemos a
 * Proposta de cronograma que ele criar (POST /propostas). A conversa abre uma sessão própria; a Proposta é a mesma que
 * apareceria no chat do mestre de obras.
 */
const PEDIDO_AO_AGENTE =
  "Monte o cronograma desta obra a partir do orçamento e proponha para a minha aprovação agora. Sequencie as etapas na " +
  "ordem das fases de obra e defina a equipe de cada uma (a duração o sistema calcula pela quantidade e produtividade). " +
  "Proponha com as etapas que o orçamento já tiver, mesmo que seja uma só — não peça para eu cadastrar mais etapas antes.";

async function proporCronogramaPeloAgente(obraId: string): Promise<Proposta> {
  let proposta: Proposta | null = null;
  let erro: string | null = null;
  let texto = "";
  for await (const ev of conversarComAgente({ obra_id: obraId, texto: PEDIDO_AO_AGENTE })) {
    if (ev.tipo === "proposta" && ev.proposta.tipo === "cronograma") proposta = ev.proposta;
    else if (ev.tipo === "texto") texto += ev.delta;
    else if (ev.tipo === "erro") erro = ev.mensagem;
  }
  if (proposta) return proposta;
  // o agente respondeu sem propor (ex.: orçamento ralo): mostra o que ele disse, não um erro genérico
  const recado = texto.trim();
  throw new Error(erro ?? (recado ? recado : "O mestre de obras não chegou a propor o cronograma. Tente de novo."));
}

type Vista = "etapas" | "curva" | "desembolso";
const VISTAS: { k: Vista; rotulo: string }[] = [
  { k: "etapas", rotulo: "Etapas" },
  { k: "curva", rotulo: "Curva S" },
  { k: "desembolso", rotulo: "Desembolso" },
];

export function Cronograma({ obra }: { obra: Obra }) {
  const { versao, podeOperar, demo, avisar, irParaTela, receberPropostas, lerFiltroTela, limparFiltroTela } = useCasca();
  const celular = useCelular();
  const { dado: daApi, erro, carregando } = useCarregar(() => api.cronograma(obra.id), [obra.id, versao]);
  // a demonstração não tem cronograma: no lugar do vazio, o fictício de lib/simulado (nunca com dado real)
  const simulado = useMemo(() => (demo && daApi && !(daApi.inicio && daApi.meses > 0) ? cronogramaSimulado(undefined, daApi.etapas) : null), [demo, daApi]);
  const dado = simulado ?? daApi;
  const [modo, setModo] = useState<{ k: "ver" } | { k: "editar"; meses?: number; aditivoPrazo?: boolean; proposta?: DadosCronograma }>({ k: "ver" });
  const [modal, setModal] = useState<"medicao" | "prazo" | null>(null);
  const [gaveta, setGaveta] = useState<"tabela" | "medicoes" | null>(null);
  const [iaProp, setIaProp] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erroIA, setErroIA] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("etapas");
  const [filtro, setFiltro] = useState<FiltroGantt>("todas");
  const tem = !!dado?.inicio && dado.meses > 0;
  const editando = modo.k === "editar" && dado;
  const ver = tem && !editando;
  // a mesma situação que o Gantt pinta (no mês da última medição); etapa sem % nunca está atrasada
  const nAtrasadas = ver
    ? dado.etapas.filter((e) => situacaoEtapa(e.percentuais, e.medido_acumulado, indiceDoMes(dado.inicio, dado.prazo.mes_referencia)).situacao === "atrasada").length
    : 0;
  const conversar = () => irParaTela("conversa");
  // no simulado nada grava: a ação só avisa que é prévia
  const previa = () => avisar(AVISO_PREVIA);
  const lancarMedicao = () => (simulado ? previa() : setModal("medicao"));

  const menu: ItemMenu[] = ver
    ? [
        ...(celular && podeOperar ? [{ rotulo: "Lançar medição", acao: lancarMedicao }] : []),
        { rotulo: "Ver medições", acao: () => setGaveta("medicoes") },
        { rotulo: "Ver tabela físico-financeira", acao: () => setGaveta("tabela") },
        ...(podeOperar
          ? [
              { rotulo: "Editar cronograma", acao: () => (simulado ? previa() : setModo({ k: "editar" })) },
              { rotulo: "Aditivo de prazo", acao: () => (simulado ? previa() : setModal("prazo")) },
            ]
          : []),
      ]
    : [];
  const maisAcoes = menu.length ? <MenuMais rotulo="Mais ações do cronograma" itens={menu} /> : null;

  const cabecalho = celular ? (
    <>
      <header className={c.celCab}>
        <h1>Cronograma</h1>
        {maisAcoes}
      </header>
      {ver ? <PrazoCelular crono={dado} /> : null}
    </>
  ) : (
    <>
      <header className={c.cab}>
        <div className={c.cabTxt}>
          <h1>Cronograma</h1>
          {ver ? (
            <p>
              <LinhaPrazo crono={dado} />
            </p>
          ) : null}
        </div>
        {ver ? (
          <div className={c.cabAcoes}>
            <BotaoPlumo rotulo="Atualizar o andamento conversando" />
            {podeOperar ? (
              <button type="button" className="btn" onClick={lancarMedicao}>
                Lançar medição
              </button>
            ) : null}
            {maisAcoes}
          </div>
        ) : null}
      </header>
      {ver ? (
        <div className={c.barra}>
          <div className="seg" role="tablist" aria-label="Vista do cronograma">
            {VISTAS.map((x) => (
              <button key={x.k} type="button" role="tab" aria-selected={vista === x.k} className={vista === x.k ? "on" : ""} onClick={() => setVista(x.k)}>
                {x.rotulo}
              </button>
            ))}
          </div>
          {vista === "etapas" ? (
            <div className="seg" role="group" aria-label="Mostrar">
              {(
                [
                  ["todas", "Todas"],
                  ["andamento", "Em andamento"],
                  ["atrasadas", "Atrasadas"],
                  ["proximas", "Próximas"],
                ] as const
              ).map(([k, r]) => (
                <button key={k} type="button" aria-pressed={filtro === k} className={filtro === k ? "on" : ""} onClick={() => setFiltro(k)}>
                  {r}
                  {k === "atrasadas" ? <small className={c.cont}>{nAtrasadas}</small> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );

  // A IA intermediária: propõe o cronograma a partir do orçamento (sequência por fase de obra, duração pelo valor) e
  // vira uma Proposta pendente. A pessoa aprova — como qualquer escrita do agente — e aí o cronograma é criado.
  const gerarComIA = useCallback(async () => {
    setGerando(true);
    setErroIA(null);
    try {
      // Só propõe: não chama organizar-fases antes. Aquilo reescreve o orçamento (fases e estimativas novas) sem
      // aprovação, e um orçamento aprovado não pode mudar por um clique no cronograma. Prever a obra completa continua
      // no Orçamento, como ação explícita.
      const prop = demo ? await api.proporCronograma(obra.id) : await proporCronogramaPeloAgente(obra.id);
      receberPropostas([prop]);
      setIaProp(prop.id);
    } catch (e) {
      setErroIA(mensagemDe(e));
    } finally {
      setGerando(false);
    }
  }, [demo, obra.id, receberPropostas]);

  // Veio do "Gerar cronograma" do Projeto: ao chegar (orçamento já carregado, sem cronograma ainda), dispara a geração
  // sozinho — a página já abre na geração. Só uma vez; depois limpa a intenção para não repetir ao voltar à tela.
  const autoGerou = useRef(false);
  useEffect(() => {
    if (autoGerou.current || carregando) return;
    if (!lerFiltroTela("cronograma")?.gerar) return;
    autoGerou.current = true;
    limparFiltroTela();
    if (podeOperar && !tem && !gerando && !iaProp) void gerarComIA();
  }, [carregando, tem, podeOperar, gerando, iaProp, gerarComIA, lerFiltroTela, limparFiltroTela]);

  return (
    <div className={`page ${c.tela}`}>
      {cabecalho}
      {erro ? (
        <div className="aviso-erro" role="alert">
          <Icone nome="alert" tam={15} />
          {erro}
        </div>
      ) : null}
      {carregando && !dado ? (
        <div className="carregando" role="status">
          <Icone nome="loader" className="spin" tam={15} />
          Carregando o cronograma…
        </div>
      ) : !dado ? null : editando ? (
        <EditorCronograma obra={obra} crono={modo.k === "editar" && modo.proposta ? modo.proposta : dado} meses={modo.meses} aditivoPrazo={modo.aditivoPrazo} fechar={() => setModo({ k: "ver" })} />
      ) : !tem ? (
        iaProp ? (
          <section aria-label="Proposta de cronograma da IA">
            <p className="mut sm" style={{ margin: "4px 2px 12px" }}>
              A IA preparou o cronograma a partir do orçamento. Revise e <b>aprove</b> — ou recuse e peça outro.
            </p>
            <div className="ld-lista">
              <CartaoProposta id={iaProp} />
            </div>
            {/* a base: o que cada etapa executa (do orçamento). Aberto aqui para conferir a proposta sem voltar. */}
            <BaseOrcamento obraId={obra.id} aberto />
          </section>
        ) : (
          <div className="card vazio">
            <Icone nome="calendario" tam={24} />
            <h3>Sem cronograma ainda</h3>
            {dado.etapas.length ? (
              <p>
                O <b>Gerar com IA</b> lê o orçamento e propõe a sequência das etapas por fase de obra (fundação → estrutura → acabamento), com a <b>duração de cada etapa calculada pela quantidade de serviço e a produtividade</b> (homem-hora), respeitando as dependências e a cura do concreto. Você <b>revisa e aprova</b> — como qualquer proposta do agente. Com o cronograma, cada medição mostra o previsto × executado e projeta o término.
              </p>
            ) : (
              <p>Importe o orçamento da obra primeiro: o cronograma distribui as etapas dele pelos meses.</p>
            )}
            {podeOperar && dado.etapas.length ? (
              <>
                <div className="row" style={{ marginTop: 16, gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                  <button type="button" className="btn amb" disabled={gerando} aria-busy={gerando} onClick={() => void gerarComIA()}>
                    <Icone nome={gerando ? "loader" : "spark"} tam={15} className={gerando ? "spin" : undefined} />
                    Gerar com IA
                  </button>
                  <button type="button" className="btn" onClick={() => setModo({ k: "editar" })}>
                    Montar à mão
                  </button>
                </div>
                {erroIA ? (
                  <div className="aviso-erro" role="alert" style={{ marginTop: 12 }}>
                    <Icone nome="alert" tam={15} />
                    <span>{erroIA}</span>
                  </div>
                ) : null}
                {/* o que vai ser sequenciado, já visível antes de gerar — sem ter de abrir o Orçamento */}
                <BaseOrcamento obraId={obra.id} />
              </>
            ) : null}
          </div>
        )
      ) : celular ? (
        <Gantt crono={dado} conversar={conversar} />
      ) : (
        <>
          <div role="tabpanel" aria-label={VISTAS.find((x) => x.k === vista)!.rotulo}>
            {vista === "etapas" ? (
              <Gantt crono={dado} filtro={filtro} />
            ) : vista === "curva" ? (
              <CurvaS mensal={dado.mensal} comBase={!!dado.revisoes} />
            ) : (
              <Desembolso obra={obra} />
            )}
          </div>
          <BaseOrcamento obraId={obra.id} />
          {vista === "etapas" ? (
            <p className={c.legenda}>
              A linha ocre é hoje. Amarelo dentro da barra = medido; azul = previsto.{simulado ? " Valores fictícios." : ""}
            </p>
          ) : null}
        </>
      )}
      {gaveta === "tabela" && dado ? <TabelaFisicoFinanceira crono={dado} fechar={() => setGaveta(null)} /> : null}
      {gaveta === "medicoes" && dado ? (
        <Drawer titulo="Medições" fechar={() => setGaveta(null)}>
          <ListaMedicoes obra={obra} medicoes={dado.medicoes} somenteLeitura={!!simulado} />
        </Drawer>
      ) : null}
      {modal === "medicao" && dado ? <ModalMedicao obra={obra} crono={dado} fechar={() => setModal(null)} /> : null}
      {modal === "prazo" && dado ? (
        <ModalAditivoPrazo
          obra={obra}
          crono={dado}
          fechar={() => setModal(null)}
          feito={(meses) => {
            setModal(null);
            setModo({ k: "editar", meses, aditivoPrazo: true });
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Aditivo de prazo: escolhe o novo prazo e abre o editor com os meses a mais, vazios. Nada é gravado aqui: o PUT do
 * cronograma leva `atualizar_prazo_da_obra` e grava o prazo da obra junto, numa operação só (o Desfazer volta os dois).
 * Antes eram duas escritas, e desfazer uma só deixava "obra 11 meses × cronograma 10".
 */
function ModalAditivoPrazo({ obra, crono, fechar, feito }: { obra: Obra; crono: DadosCronograma; fechar: () => void; feito: (meses: number) => void }) {
  const atual = Math.max(obra.prazo_meses || 0, crono.meses);
  const [meses, setMeses] = useState(String(atual + 1));
  const n = /^\d+$/.test(meses.trim()) ? Number(meses) : NaN;
  const { erros, enviar } = useEnvio(
    () => ({ meses: !Number.isInteger(n) || n < 1 || n > 60 ? "Prazo de 1 a 60 meses." : n <= crono.meses ? `Maior que os ${crono.meses} meses do cronograma.` : null }),
    async () => feito(n),
  );
  const novoFim = crono.inicio && Number.isInteger(n) && n > 0 ? listaMeses(crono.inicio, n).at(-1)! : null;
  return (
    <Modal
      titulo="Aditivo de prazo"
      fechar={fechar}
      rodape={
        <>
          <button type="button" className="btn" onClick={fechar}>
            Voltar
          </button>
          <button type="submit" form="form-prazo" className="btn amb">
            Redistribuir no cronograma
          </button>
        </>
      }
    >
      <form id="form-prazo" onSubmit={enviar} noValidate>
        <p className="mut" style={{ margin: "0 0 8px" }}>
          Hoje: {crono.meses} meses, término em {fmtMesLongo(crono.prazo.termino_contratual)}. O cronograma abre com os meses novos vazios; ao salvar, o prazo da
          obra muda junto.
        </p>
        <Campo rotulo="Novo prazo (meses)" erro={erros.meses} dica={novoFim ? `Novo término contratual: ${fmtMesLongo(novoFim)} (+${n - crono.meses} ${n - crono.meses === 1 ? "mês" : "meses"}).` : undefined}>
          {(a) => <input {...a} className="f" inputMode="numeric" autoComplete="off" value={meses} onChange={(e) => setMeses(e.target.value)} />}
        </Campo>
      </form>
    </Modal>
  );
}
