"use client";
/**
 * O Resumo da obra, a primeira aba, feito para ler de relance: enquanto a obra está sendo montada, os passos que faltam
 * (Montando a obra); depois a saudação e três quadros (o que pede você, o dinheiro, o prazo); embaixo, os blocos de
 * detalhe (Painel.tsx). Cada dado aparece uma vez só na página: por isso o Placar do topo fica escondido aqui (Casca.tsx)
 * e os quadros fazem o papel dele.
 */
import type { GastoObra, Obra, ResumoDaObra } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { useCasca } from "../contexto";
import { Icone } from "../Icone";
import { telaNoModo } from "../sessoes";
import { useCarregar } from "../useCarregar";
import { diaPorExtenso, hojeNaObra, saudacao } from "./dia";
import { etapasDaObra, montando, type Etapa, type TelaEtapa } from "./etapas";
import { Painel } from "./Painel";
import { PedeVoce } from "./PedeVoce";
import { QuadroDinheiro, QuadroPrazo } from "./Quadros";
import q from "./quadros.module.css";
import s from "./resumo.module.css";

const ESTADO_LIDO: Record<Etapa["estado"], string> = { feita: "feito", atual: "passo atual", atencao: "pede atenção", depois: "ainda não começou" };
const VER: Record<TelaEtapa, string> = { projeto: "Ver o projeto", orcamento: "Ver o orçamento", cronograma: "Ver o cronograma" };

const chegou = (e: Etapa) => e.estado !== "depois";

function MontandoObra({ etapas }: { etapas: Etapa[] }) {
  const { irParaTela, podeOperar } = useCasca();
  const faltam = etapas.filter((e) => e.estado !== "feita").length;
  return (
    <nav className={s.montagem} aria-labelledby="resumo-montando">
      <p className={s.montagemCab}>
        <b id="resumo-montando">Montando a obra</b>
        <span>{faltam === 1 ? "falta 1 de 3 passos" : `faltam ${faltam} de 3 passos`}</span>
      </p>
      <ol className={s.linha}>
        {etapas.map((e, i) => (
          // cada passo pinta o meio traço que chega nele e o que sai para o próximo: verde até onde a obra já chegou
          <li key={e.tela} className={`${s.etapa} ${s[e.estado]}${chegou(e) ? ` ${s.entra}` : ""}${etapas[i + 1] && chegou(etapas[i + 1]!) ? ` ${s.sai}` : ""}`}>
            <span className={s.marca} aria-hidden="true">
              {e.estado === "feita" ? <Icone nome="check" tam={12} /> : null}
            </span>
            <span className={s.texto}>
              <span className={s.rotulo}>{e.rotulo}</span>
              <span className="sr-only">: {ESTADO_LIDO[e.estado]}</span>
              {e.detalhe ? <span className={s.detalhe}>{e.detalhe}</span> : null}
            </span>
            {e.acao ? (
              <button type="button" className={`btn sm${podeOperar && e.estado === "atual" ? " amb" : ""} ${s.acao}`} onClick={() => irParaTela(e.tela)}>
                {podeOperar ? e.acao : VER[e.tela]}
              </button>
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Resumo({ obra, resumo }: { obra: Obra; resumo: ResumoDaObra | null }) {
  const { versao, modo } = useCasca();
  const comGastos = telaNoModo("gastos", modo);
  const hoje = useCarregar(() => api.hojeNaObra(obra.id), [obra.id, versao]);
  const { dado } = useCarregar(
    () =>
      Promise.all([
        api.orcamento(obra.id).catch(() => null),
        api.cronograma(obra.id).catch(() => null),
        api.desembolso(obra.id).catch(() => null),
        comGastos ? api.listarGastos(obra.id, { limite: 4 }).catch(() => [] as GastoObra[]) : Promise.resolve(null),
      ]),
    [obra.id, versao, comGastos],
  );
  const [orc, crono, desemb, gastos] = dado ?? [null, null, null, null];
  const etapas = etapasDaObra(obra, resumo);
  // os números da obra só existem com orçamento; sem ele o Resumo fica com os passos e o que pede você
  const comNumeros = !!resumo && resumo.obra.id === obra.id && resumo.financeiro.tem_orcamento;
  const comPassos = montando(etapas);
  return (
    <div className={`page ${s.resumo}`}>
      <h1 className="sr-only">Resumo da obra</h1>
      {comPassos ? <MontandoObra etapas={etapas} /> : null}
      <p className={s.saudacao}>
        <b>{saudacao()}</b>
        <span>Plumo · {diaPorExtenso(hoje.dado?.hoje ?? hojeNaObra())}</span>
      </p>
      <div className={`${q.quadros}${comNumeros ? "" : ` ${q.so}`}`}>
        <PedeVoce obra={obra} hoje={hoje.dado} erro={hoje.erro} carregando={hoje.carregando} comDinheiro={comNumeros} montando={comPassos} />
        {comNumeros ? (
          <>
            <QuadroDinheiro obra={obra} resumo={resumo} orc={orc} />
            <QuadroPrazo resumo={resumo} crono={crono} />
          </>
        ) : null}
      </div>
      {comNumeros ? <Painel orc={orc} crono={crono} desemb={desemb} gastos={gastos} semana={hoje.dado ? hoje.dado.semana : null} /> : null}
    </div>
  );
}
