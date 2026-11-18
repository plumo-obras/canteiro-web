"use client";
/**
 * Os quadros Dinheiro e Prazo do Resumo, ao lado do "Pede você": cada um responde a uma pergunta da obra com um
 * veredito (cor e palavra), um número grande, um medidor e dois ou três valores de apoio. No Resumo eles fazem o papel do
 * Placar (que fica escondido nesta tela), então cada número aparece uma vez só na página.
 *
 * Nenhuma conta de dinheiro aqui: gasto, orçado, falta gastar, % e o saldo das etapas vêm prontos da API. A tela só
 * escolhe o veredito e situa o mês de hoje no cronograma.
 */
import type { Cronograma, Obra, Orcamento, ResumoDaObra } from "@/lib/contrato";
import { fmtMesLongo } from "@/lib/cronograma";
import { fmtReais } from "@/lib/formato";
import { useCasca } from "../contexto";
import { Icone, type NomeIcone } from "../Icone";
import { BarraConsumo } from "../orcamento/BarraConsumo";
import { reaisInteiros } from "../orcamento/Andamento";
import type { AbaAtiva } from "../sessoes";
import { indiceDoMes, mesDeHoje } from "./dia";
import s from "./quadros.module.css";

type Tom = "ok" | "ruim" | "neutro";
interface Veredito {
  tom: Tom;
  texto: string;
}

/** Acima disso o medidor de meses vira uma barra contínua: blocos finos demais não se leem. */
const MAX_BLOCOS = 36;

function Quadro({
  id,
  nome,
  icone,
  tela,
  veredito,
  children,
}: {
  id: string;
  nome: string;
  icone: NomeIcone;
  tela: AbaAtiva;
  veredito: Veredito;
  children: React.ReactNode;
}) {
  const { irParaTela } = useCasca();
  return (
    <section className={`card ${s.quadro}`} aria-labelledby={id}>
      <header className={s.cab}>
        <span className={s.ico} aria-hidden="true">
          <Icone nome={icone} tam={16} />
        </span>
        <h2 id={id} className={s.nome}>
          {/* o botão cobre o quadro todo (::after): o clique em qualquer ponto leva ao detalhe */}
          <button type="button" className={s.abrir} onClick={() => irParaTela(tela)}>
            {nome}
          </button>
        </h2>
        <Icone nome="chevRight" tam={16} className={s.seta} />
      </header>
      <p className={`${s.estado} ${s[veredito.tom]}`}>
        <span className={s.bola} aria-hidden="true" />
        {veredito.texto}
      </p>
      {children}
    </section>
  );
}

/** O veredito do dinheiro: a etapa que passou do orçado (o saldo negativo vem pronto da API) ou "dentro do orçado". */
export function vereditoDinheiro(orc: Orcamento | null, r: ResumoDaObra): Veredito {
  const passaram = orc ? orc.etapas.filter((e) => e.estourou) : null;
  const n = passaram ? passaram.length : (r.financeiro.etapas_estouradas?.length ?? 0);
  if (!n) return { tom: "ok", texto: "Dentro do orçado" };
  if (n === 1 && passaram?.[0]) return { tom: "ruim", texto: `${passaram[0].descricao} passou ${reaisInteiros(-passaram[0].saldo)}` };
  return { tom: "ruim", texto: n === 1 ? "1 etapa passou do orçado" : `${n} etapas passaram do orçado` };
}

export function QuadroDinheiro({ obra, resumo, orc }: { obra: Obra; resumo: ResumoDaObra; orc: Orcamento | null }) {
  const f = resumo.financeiro;
  const pct = f.realizado_pct != null ? `${(f.realizado_pct / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : null;
  return (
    <Quadro id="quadro-dinheiro" nome="Dinheiro" icone="carteira" tela="orcamento" veredito={vereditoDinheiro(orc, resumo)}>
      <p className={s.numero}>
        {reaisInteiros(f.realizado)}
        <span>{f.realizado ? "gastos até hoje" : "nenhum gasto lançado"}</span>
      </p>
      <div className={s.medidor}>
        <BarraConsumo orcado={f.orcado_atual} gasto={f.realizado} saldo={f.saldo} frase={false} alta />
        {pct ? <b aria-hidden="true">{pct}</b> : null}
      </div>
      <dl className={s.pares}>
        <div>
          <dt>Orçado</dt>
          <dd>{reaisInteiros(f.orcado_atual)}</dd>
        </div>
        {f.falta_gastar != null ? (
          <div>
            <dt>Falta gastar</dt>
            <dd>{reaisInteiros(f.falta_gastar)}</dd>
          </div>
        ) : null}
        {/* o Placar mostrava o valor fechado com o cliente; no Resumo ele mora aqui */}
        {obra.verba ? (
          <div>
            <dt>Valor fechado</dt>
            <dd title={fmtReais(obra.verba)}>{reaisInteiros(obra.verba)}</dd>
          </div>
        ) : null}
      </dl>
    </Quadro>
  );
}

/** Sem medição, ninguém sabe se a obra está no prazo: dizer "Em dia" seria afirmar o que não foi medido. */
export function vereditoPrazo(c: ResumoDaObra["cronograma"]): Veredito {
  if (!c.cadastrado) return { tom: "neutro", texto: "Sem cronograma" };
  if (c.atraso_decimos === null) return { tom: "neutro", texto: "Sem medição lançada" };
  if (c.atraso_decimos <= 0) return { tom: "ok", texto: "Em dia" };
  const meses = (c.atraso_decimos / 10).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return { tom: "ruim", texto: `Atrasada ${meses} ${c.atraso_decimos < 20 ? "mês" : "meses"}` };
}

export function QuadroPrazo({ resumo, crono }: { resumo: ResumoDaObra; crono: Cronograma | null }) {
  const c = resumo.cronograma;
  const total = crono?.inicio ? crono.meses : 0;
  const mes = total ? Math.min(total, Math.max(1, indiceDoMes(crono!.inicio!, mesDeHoje()) + 1)) : null;
  const entrega = c.termino_projetado ?? c.termino_contratual;
  return (
    <Quadro id="quadro-prazo" nome="Prazo" icone="calendario" tela="cronograma" veredito={vereditoPrazo(c)}>
      {mes ? (
        <>
          <p className={s.numero}>
            Mês {mes}
            <span>de {total} do cronograma</span>
          </p>
          <div className={s.medidor}>
            {total <= MAX_BLOCOS ? (
              <span className={s.meses} role="img" aria-label={`Mês ${mes} de ${total} do cronograma`} style={{ gridTemplateColumns: `repeat(${total},minmax(0,1fr))` }}>
                {Array.from({ length: total }, (_, i) => (
                  <span key={i} className={i + 1 < mes ? s.passou : i + 1 === mes ? s.agora : undefined} />
                ))}
              </span>
            ) : (
              <span className={s.tempo} role="img" aria-label={`Mês ${mes} de ${total} do cronograma`}>
                <span style={{ width: `${(mes / total) * 100}%` }} />
              </span>
            )}
            <b aria-hidden="true">
              {mes}/{total}
            </b>
          </div>
        </>
      ) : (
        <p className={s.numero}>
          —<span>{c.cadastrado ? "o cronograma ainda não tem início" : "monte em Cronograma"}</span>
        </p>
      )}
      <dl className={s.pares}>
        <div>
          <dt>Início</dt>
          <dd>{crono?.inicio ? fmtMesLongo(crono.inicio) : "—"}</dd>
        </div>
        <div>
          {/* com atraso medido, a data é a projetada: "previsão", não a combinada */}
          <dt>{c.atraso_decimos && c.atraso_decimos > 0 ? "Previsão" : "Entrega"}</dt>
          <dd>{entrega ? fmtMesLongo(entrega) : "—"}</dd>
        </div>
      </dl>
    </Quadro>
  );
}
