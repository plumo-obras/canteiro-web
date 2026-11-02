/**
 * Cabeçalho das telas: o título grande e, ao lado, os poucos números que respondem "como está isto agora?", cada um
 * com um ícone num círculo e uma frase curta embaixo. A ação principal da tela fica na linha de baixo (`acoes`).
 */
import type { ReactNode } from "react";
import { Icone, type NomeIcone } from "./Icone";

export interface Kpi {
  icone: NomeIcone;
  n: ReactNode;
  r: ReactNode;
  /** Pílula ao lado do número (ex.: "8% acima do contrato"). */
  tag?: ReactNode;
  tom?: "ok" | "atencao" | "acima" | "info";
}

const TOM = { ok: "ok", atencao: "warn", acima: "bad", info: "" } as const;

export function CabecalhoPagina({ titulo, sub, kpis = [], acoes }: { titulo: string; sub?: ReactNode; kpis?: Kpi[]; acoes?: ReactNode }) {
  return (
    <>
      <header className="cab-pagina">
        <div className="cab-pagina-t">
          <h1 className="titulo-pagina">{titulo}</h1>
          {sub ? <div className="cab-pagina-sub">{sub}</div> : null}
        </div>
        {kpis.length ? (
          <div className={`kpis${kpis.length >= 4 ? " k4" : ""}`}>
            {kpis.map((k, i) => (
              <div className="kpi" key={i}>
                <span className="kpi-ic" aria-hidden="true">
                  <Icone nome={k.icone} tam={18} />
                </span>
                <div>
                  <div className="kpi-n">
                    {k.n}
                    {k.tag ? <span className={`kpi-tag${k.tom ? ` ${TOM[k.tom]}` : ""}`}>{k.tag}</span> : null}
                  </div>
                  <div className="kpi-r">{k.r}</div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </header>
      {acoes ? <div className="barra-acoes">{acoes}</div> : null}
    </>
  );
}
