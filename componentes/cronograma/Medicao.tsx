"use client";
/**
 * Boletim de medição mensal: o % executado ACUMULADO de cada etapa até o mês (é como o fiscal mede: "a fundação está
 * em 60%"), já preenchido com o da última medição. A tela mostra ao vivo quanto isso vale no período (orçado × avanço)
 * e no total; a API grava e devolve o oficial. O acumulado não volta para trás: para corrigir, desfaz-se a última.
 */
import { useRef, useState } from "react";
import type { Cronograma, Medicao, Obra } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { CEM, fmtMes, fmtMesLongo, fmtPct, somarMes, valorDe } from "@/lib/cronograma";
import { fmtDiaHora, fmtReais } from "@/lib/formato";
import { uuid7 } from "@/lib/ids";
import { useCasca } from "../contexto";
import { Confirmar, Modal } from "../Dialogo";
import { Icone } from "../Icone";
import { Campo, ErroApi, useEnvio } from "../formularios/Campos";
import { lerMesAno, lerPct, pctParaCampo } from "../obra/CamposObra";

const ultimaDe = (ms: Medicao[]) => ms.reduce<Medicao | null>((u, m) => (!u || m.numero > u.numero ? m : u), null);
const paraCampoMes = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;

export function ModalMedicao({ obra, crono, fechar }: { obra: Obra; crono: Cronograma; fechar: () => void }) {
  const { avisarFeito, mudou } = useCasca();
  const ultima = ultimaDe(crono.medicoes);
  const mesPadrao = ultima ? somarMes(ultima.mes, 1) : crono.inicio!;
  const [mes, setMes] = useState(paraCampoMes(mesPadrao));
  const [obs, setObs] = useState("");
  const etapas = crono.etapas.filter((e) => e.atual > 0);
  const [acum, setAcum] = useState<Record<string, string>>(() => Object.fromEntries(etapas.map((e) => [e.etapa, e.medido_acumulado ? pctParaCampo(e.medido_acumulado) : ""])));
  const chave = useRef(uuid7());
  const primeiro = useRef<HTMLInputElement>(null);
  const mesIso = lerMesAno(mes);

  const linhas = etapas.map((e) => {
    const t = acum[e.etapa] ?? "";
    const novo = t.trim() ? lerPct(t) : 0;
    const periodo = novo === null ? 0 : novo - e.medido_acumulado;
    return { ...e, novo, periodo, valor: novo === null ? 0 : valorDe(e.atual, periodo), erro: novo === null ? "inválido" : novo < e.medido_acumulado ? "menor que o anterior" : null };
  });
  const total = linhas.reduce((t, l) => t + l.valor, 0);
  const orcado = etapas.reduce((t, e) => t + e.atual, 0);
  const pctObra = orcado ? Math.round((linhas.reduce((t, l) => t + valorDe(l.atual, l.novo ?? l.medido_acumulado), 0) / orcado) * CEM) : 0;
  const mudaram = linhas.filter((l) => l.novo !== null && l.novo !== l.medido_acumulado);

  const { erros, erroApi, ocupado, enviar } = useEnvio(
    () => ({
      mes: !mesIso ? "Mês e ano, ex.: 12/2026." : ultima && mesIso <= ultima.mes ? `Depois da última medição (${fmtMesLongo(ultima.mes)}).` : null,
      linhas: linhas.some((l) => l.erro) ? "Corrija as etapas marcadas: o acumulado vai de 0 a 100% e não diminui (para corrigir, desfaça a última medição)." : !mudaram.length ? "Nenhuma etapa avançou." : null,
      obs: obs.length > 500 ? "Observação até 500 letras." : null,
    }),
    async () => {
      const r = await api
        .criarMedicao(obra.id, {
          mes: mesIso!,
          etapas: mudaram.map((l) => ({ etapa: l.etapa, pct_acumulado: l.novo! })),
          ...(obs.trim() ? { observacao: obs.trim() } : {}),
          chave_idempotencia: chave.current,
        })
        .catch((x) => {
          chave.current = uuid7();
          throw x;
        });
      mudou();
      fechar();
      avisarFeito(
        `${r.medicao.numero}ª medição (${fmtMes(r.medicao.mes)}): ${fmtReais(r.medicao.valor)}, ${fmtPct(r.medicao.pct_obra_acumulado)} da obra.`,
        r.registro_id ?? r.medicao.registro_id ?? null,
      );
    },
  );

  return (
    <Modal
      titulo={ultima ? `${ultima.numero + 1}ª medição` : "1ª medição"}
      fechar={fechar}
      focoInicial={primeiro}
      largo
      rodape={
        <>
          <span className="ped-total">
            No período <b>{fmtReais(total)}</b> · obra em <b>{fmtPct(pctObra)}</b>
          </span>
          <button type="button" className="btn" onClick={fechar}>
            Voltar
          </button>
          <button type="submit" form="form-medicao" className="btn amb" disabled={ocupado} aria-busy={ocupado}>
            Registrar medição
          </button>
        </>
      }
    >
      <form id="form-medicao" onSubmit={enviar} noValidate>
        <div className="campos2">
          <Campo rotulo="Mês da medição" erro={erros.mes} dica={ultima ? `A última foi em ${fmtMesLongo(ultima.mes)}.` : "A primeira medição da obra."}>
            {(a) => <input {...a} ref={primeiro} className="f" inputMode="numeric" placeholder="MM/AAAA" maxLength={7} value={mes} onChange={(e) => setMes(e.target.value)} />}
          </Campo>
          <Campo rotulo="Observação (opcional)" erro={erros.obs}>
            {(a) => <input {...a} className="f" autoComplete="off" maxLength={500} value={obs} onChange={(e) => setObs(e.target.value)} />}
          </Campo>
        </div>
        <div className="tbl-rola">
          <table className="tbl-med">
            <thead>
              <tr>
                <th scope="col">Etapa</th>
                <th scope="col" className="num">
                  Orçado
                </th>
                <th scope="col" className="num">
                  Acumulado anterior
                </th>
                <th scope="col" className="num">
                  Acumulado agora
                </th>
                <th scope="col" className="num">
                  No período
                </th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.etapa} className={l.erro ? "crono-ruim" : l.periodo > 0 ? "med-andou" : ""}>
                  <td>
                    <span className="eap-num">{l.etapa}</span> {l.descricao}
                  </td>
                  <td className="num">{fmtReais(l.atual)}</td>
                  <td className="num mut">{l.medido_acumulado ? fmtPct(l.medido_acumulado) : "—"}</td>
                  <td className="num">
                    <span className="ent-q">
                      <input
                        className="f"
                        inputMode="decimal"
                        aria-label={`${l.descricao}: % executado acumulado`}
                        aria-invalid={!!l.erro}
                        value={acum[l.etapa] ?? ""}
                        onChange={(e) => setAcum((a) => ({ ...a, [l.etapa]: e.target.value }))}
                      />
                      <small>%</small>
                    </span>
                    {l.erro ? <div className="ent-acima t-neg">{l.erro}</div> : null}
                  </td>
                  <td className="num">
                    {l.periodo > 0 ? (
                      <>
                        {fmtReais(l.valor)}
                        <small className="mut"> +{fmtPct(l.periodo)}</small>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {erros.linhas ? (
          <div className="campo-erro" role="alert">
            {erros.linhas}
          </div>
        ) : null}
        <ErroApi texto={erroApi} />
      </form>
    </Modal>
  );
}

/** As medições da obra, a mais nova em cima; só a última pode ser desfeita (a API recusa as outras). */
export function ListaMedicoes({ obra, medicoes }: { obra: Obra; medicoes: Medicao[] }) {
  const { podeOperar, mudou, avisarFeito } = useCasca();
  const [confirmando, setConfirmando] = useState<Medicao | null>(null);
  const ultima = ultimaDe(medicoes);
  if (!medicoes.length) return <p className="mut sm">Nenhuma medição ainda. A primeira compara o executado com o previsto e projeta o término.</p>;

  /** O registro da medição: vem na medição quando a API manda; senão, procura a entrada da medição no registro da obra. */
  const registroDe = async (m: Medicao) => {
    if (m.registro_id) return m.registro_id;
    const rs = await api.listarRegistro(obra.id, 200);
    const r = rs.find((x) => !x.desfeito && x.desfazer && (x.desfazer.medicao_id === m.id || x.texto.startsWith(`${m.numero}ª medição (${m.mes})`)));
    if (!r) throw new Error("Não achei o registro desta medição para desfazer. Use o Histórico.");
    return r.id;
  };

  return (
    <>
      <ul className="card lista med-lista">
        {[...medicoes]
          .sort((a, b) => b.numero - a.numero)
          .map((m) => (
            <li key={m.id}>
              <div className="med-t">
                <b>
                  {m.numero}ª medição · {fmtMesLongo(m.mes)}
                </b>
                <div className="mut sm">
                  {fmtPct(m.pct_obra_acumulado)} da obra acumulado · {m.quem} · {fmtDiaHora(m.criado_em)}
                  {m.observacao ? ` · ${m.observacao}` : ""}
                </div>
              </div>
              <span className="num">{fmtReais(m.valor)}</span>
              {podeOperar && m.id === ultima?.id ? (
                <button type="button" className="btn hist-b" onClick={() => setConfirmando(m)} aria-label={`Desfazer a ${m.numero}ª medição`}>
                  <Icone nome="undo" tam={14} />
                  Desfazer
                </button>
              ) : null}
            </li>
          ))}
      </ul>
      {confirmando ? (
        <Confirmar
          titulo={`Desfazer a ${confirmando.numero}ª medição?`}
          confirmar="Desfazer"
          fechar={() => setConfirmando(null)}
          aoConfirmar={async () => {
            await api.desfazerRegistro(await registroDe(confirmando));
            setConfirmando(null);
            mudou();
            avisarFeito(`${confirmando.numero}ª medição desfeita.`, null);
          }}
        >
          <p style={{ margin: "4px 0 0" }}>
            Os acumulados voltam aos da medição anterior e o término projetado é recalculado. O valor de {fmtReais(confirmando.valor)} sai do medido.
          </p>
        </Confirmar>
      ) : null}
    </>
  );
}
