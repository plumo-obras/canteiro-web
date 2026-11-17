"use client";
/**
 * O Resumo da obra, a primeira aba: onde a obra está (a linha do tempo, na ordem das abas) e o que pede a pessoa hoje
 * (a casa da obra, que antes só aparecia na conversa vazia). Dinheiro e prazo já estão no Placar logo acima.
 */
import type { Obra, ResumoDaObra } from "@/lib/contrato";
import { useCasca } from "../contexto";
import { HojeNaObra } from "../hoje/HojeNaObra";
import { Icone } from "../Icone";
import { etapasDaObra, type Etapa } from "./etapas";
import s from "./resumo.module.css";

const ESTADO_LIDO: Record<Etapa["estado"], string> = { feita: "feita", atual: "etapa atual", atencao: "pede atenção", depois: "ainda não começou" };

const chegou = (e: Etapa) => e.estado !== "depois";

function LinhaDoTempo({ etapas }: { etapas: Etapa[] }) {
  const { irParaTela } = useCasca();
  return (
    <nav aria-label="Etapas da obra">
      <ol className={s.linha}>
        {etapas.map((e, i) => (
          // cada etapa pinta o meio traço que chega nela e o que sai para a próxima: verde até onde a obra já chegou
          <li key={e.tela} className={`${s.etapa} ${s[e.estado]}${chegou(e) ? ` ${s.entra}` : ""}${etapas[i + 1] && chegou(etapas[i + 1]!) ? ` ${s.sai}` : ""}`}>
            <button type="button" className={s.botao} aria-current={e.estado === "atual" || e.estado === "atencao" ? "step" : undefined} onClick={() => irParaTela(e.tela)}>
              <span className={s.marca} aria-hidden="true">
                {e.estado === "feita" ? <Icone nome="check" tam={12} /> : null}
              </span>
              <span className={s.texto}>
                <span className={s.rotulo}>{e.rotulo}</span>
                <span className="sr-only">: {ESTADO_LIDO[e.estado]}</span>
                {e.detalhe ? <span className={s.detalhe}>{e.detalhe}</span> : null}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Resumo({ obra, resumo }: { obra: Obra; resumo: ResumoDaObra | null }) {
  const { modo } = useCasca();
  const etapas = etapasDaObra(obra, resumo, modo);
  return (
    <div className={`page ${s.resumo}`}>
      <h1 className="sr-only">Resumo da obra</h1>
      {/* sem o resumo ainda, a linha guarda o lugar (sem pular a página quando ele chega) e não afirma etapa nenhuma */}
      {etapas ? <LinhaDoTempo etapas={etapas} /> : <div className={s.reserva} aria-hidden="true" />}
      <HojeNaObra
        obra={obra}
        alternativa={
          <p className={`card ${s.semHoje}`}>
            <Icone nome="info" tam={15} />O resumo do dia ainda não está disponível neste servidor. As etapas acima levam a cada tela.
          </p>
        }
      />
    </div>
  );
}
