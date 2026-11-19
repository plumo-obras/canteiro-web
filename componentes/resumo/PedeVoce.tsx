"use client";
/**
 * O quadro "Pede você" do Resumo: o que espera a pessoa hoje, uma linha por pendência no formato número · coisa ·
 * verbo, para ler de relance. Sai de GET /obras/{id}/hoje (as frases e contas vêm prontas) e das propostas que já estão
 * na casca. As aprovações abrem numa gaveta com os cartões; o resto leva à tela de cada ponto.
 *
 * O estouro de etapa não entra aqui quando o quadro Dinheiro está à vista: ele é o veredito daquele quadro, e o mesmo
 * fato em dois lugares era o que deixava a tela confusa.
 */
import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { HojeNaObra, Obra, PontoHoje } from "@/lib/contrato";
import { DISCIPLINAS_SIMULADAS } from "@/lib/simulado/projeto";
import { CartaoProposta } from "../CartaoProposta";
import { useCasca } from "../contexto";
import { paradasDoTab, proximaParada } from "../foco";
import { Icone } from "../Icone";
import { useMidia } from "../midia";
import { telaDe } from "../sessoes";
import s from "./quadros.module.css";

/** Quantas linhas cabem no quadro; o resto vira "e mais N". */
const MAX_LINHAS = 4;
/** Quantos cartões cabem na gaveta; o resto fica em Aprovações. */
const MAX_CARTOES = 3;

interface Linha {
  chave: string;
  /** O número na frente; null quando o título não começa com um ("A obra ainda não tem orçamento."). */
  n: number | null;
  titulo: string;
  sub: string;
  /** Âmbar = pede você (aprovação, comprovante); o resto fica neutro. */
  pede: boolean;
  rotulo: string | null;
  ir: ((e: MouseEvent<HTMLButtonElement>) => void) | null;
}

const maiuscula = (t: string) => (t ? `${t[0]!.toUpperCase()}${t.slice(1)}` : t);

/** "2 comprovantes para conferir." → 2 e "Comprovantes para conferir": o número vira a caixa da linha. */
export function partirTitulo(titulo: string): { n: number | null; texto: string } {
  const limpo = titulo.trim().replace(/\.$/, "");
  const m = /^(\d+)\s+(.+)$/.exec(limpo);
  return m ? { n: Number(m[1]), texto: maiuscula(m[2]!) } : { n: null, texto: maiuscula(limpo) };
}

/** Só a primeira frase do detalhe: o resto ("Falta você confirmar.") fica na tela do ponto. */
const primeiraFrase = (t: string) => t.split(/(?<=\.)\s+/)[0] ?? "";

type Cartoes = ReturnType<typeof useCasca>["cartoes"];
const pendentesDa = (cartoes: Cartoes, obraId: string) =>
  Object.values(cartoes)
    .filter((c) => c.proposta.obra_id === obraId && c.proposta.status === "pendente")
    .map((c) => c.proposta.id);

export function PedeVoce({
  obra,
  hoje,
  erro,
  carregando,
  comDinheiro,
  montando = false,
}: {
  obra: Obra;
  /** null: a API no ar ainda não tem a rota (o quadro fica só com as aprovações). */
  hoje: HojeNaObra | null;
  erro: string | null;
  carregando: boolean;
  /** O quadro Dinheiro está à vista e já diz o estouro. */
  comDinheiro: boolean;
  /** "Montando a obra" está à vista: o passo atual tem o botão ocre, e "a obra ainda não tem orçamento" já é o passo. */
  montando?: boolean;
}) {
  const { cartoes, irParaTela, podeOperar } = useCasca();
  const [gaveta, setGaveta] = useState(false);
  const caixa = useRef<HTMLElement>(null);
  const quemAbriu = useRef<HTMLElement | null>(null);
  const fechar = () => {
    setGaveta(false);
    quemAbriu.current?.focus({ preventScroll: true });
  };
  // abaixo de 900 px a gaveta é uma folha modal (sobe de baixo, com véu): o Tab fica dentro dela
  const modal = useMidia("(max-width: 899px)");
  useEffect(() => {
    if (!gaveta) return;
    caixa.current?.querySelector<HTMLElement>("button,a,[tabindex]")?.focus({ preventScroll: true });
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") return fechar();
      if (modal && e.key === "Tab" && caixa.current) {
        const prox = proximaParada(paradasDoTab(caixa.current), document.activeElement, e.shiftKey);
        if (prox) {
          e.preventDefault();
          prox.focus();
        }
      }
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [gaveta, modal]);

  const nPendentes = pendentesDa(cartoes, obra.id).length;
  const linhas: Linha[] = [];
  if (nPendentes)
    linhas.push({
      chave: "aprovacoes",
      n: nPendentes,
      titulo: podeOperar ? (nPendentes === 1 ? "Aprovação" : "Aprovações") : "Aguardando aprovação",
      sub: "propostas do Plumo",
      pede: true,
      rotulo: "Ver",
      ir: (e) => {
        if (gaveta) return fechar();
        quemAbriu.current = e.currentTarget;
        setGaveta(true);
      },
    });
  // o que está a caminho não pede ninguém (aparece em "O que vem"); o estouro é do quadro Dinheiro
  const pontos = (hoje?.pontos ?? []).filter(
    (p) => p.prioridade !== "a_caminho" && p.prioridade !== "ok" && !(comDinheiro && p.tipo === "etapas_estouradas") && !(montando && p.tipo === "sem_orcamento"),
  );
  for (const p of pontos) linhas.push(linhaDoPonto(p, podeOperar, irParaTela));
  // a próxima disciplina do projeto é SIMULADA (lib/simulado): só existe enquanto o Projeto não fala com a API
  const proxima = hoje ? DISCIPLINAS_SIMULADAS.find((d) => d.situacao === "proxima") : undefined;
  if (proxima)
    linhas.push({ chave: "disciplina", n: 1, titulo: `Planta da ${proxima.nome}`, sub: "próxima disciplina do projeto", pede: false, rotulo: podeOperar ? "Enviar" : "Ver", ir: () => irParaTela("projeto") });

  const visiveis = linhas.slice(0, MAX_LINHAS);
  const mais = linhas.length - visiveis.length + (hoje?.mais ?? 0);
  const total = linhas.length + (hoje?.mais ?? 0);
  // uma ação ocre na tela: a da primeira linha, para quem pode agir, a menos que o passo da montagem já tenha a dele
  const primeira = podeOperar && !montando ? visiveis.findIndex((l) => l.ir) : -1;

  // a gaveta fica fora do cartão: o vidro (backdrop-filter) do cartão prenderia a posição dela dentro dele
  return (
    <>
      <section className={`card ${s.quadro} ${s.pede}`} aria-labelledby="quadro-pede">
        <header className={s.cab}>
          <span className={`${s.ico}${total ? ` ${s.icoAmb}` : ""}`} aria-hidden="true">
            <Icone nome="sino" tam={16} />
          </span>
          <h2 id="quadro-pede" className={s.nome}>
            {podeOperar ? "Pede você" : "Pendências"}
          </h2>
          {total ? (
            <span className={s.contador} aria-label={total === 1 ? "1 pendência" : `${total} pendências`}>
              {total}
            </span>
          ) : null}
        </header>
        {carregando && !hoje ? (
          <p className={`carregando ${s.aviso}`} role="status">
            <Icone nome="loader" className="spin" tam={15} />
            Olhando a obra…
          </p>
        ) : erro && !hoje ? (
          <p className={`aviso-erro ${s.aviso}`} role="alert">
            <Icone nome="alert" tam={15} />
            {erro}
          </p>
        ) : visiveis.length ? (
          <ul className={s.pendencias}>
            {visiveis.map((l, i) => (
              <li key={l.chave}>
                <span className={`${s.n}${l.pede ? ` ${s.nAmb}` : ""}`} aria-hidden={l.n === null ? true : undefined}>
                  {l.n ?? <Icone nome="alert" tam={15} />}
                </span>
                <span className={s.pTexto}>
                  <b>
                    <span className="sr-only">{l.n !== null ? `${l.n} ` : ""}</span>
                    {l.titulo}
                  </b>
                  {l.sub ? <small>{l.sub}</small> : null}
                </span>
                {l.ir && l.rotulo ? (
                  <button
                    type="button"
                    className={`btn sm${i === primeira ? " amb" : ""} ${s.verbo}`}
                    aria-expanded={l.chave === "aprovacoes" ? gaveta : undefined}
                    aria-controls={l.chave === "aprovacoes" && gaveta ? "hoje-gaveta" : undefined}
                    onClick={l.ir}
                  >
                    {l.rotulo}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : hoje ? (
          <p className={`${s.estado} ${s.ok}`}>
            <Icone nome="check" tam={15} />
            Nada pendente
          </p>
        ) : (
          // sem GET /hoje não dá para dizer "nada pendente": seria afirmar o que não se sabe
          <p className={`mut sm ${s.aviso}`}>O resumo do dia ainda não está disponível neste servidor.</p>
        )}
        {mais > 0 && visiveis.length ? <p className={s.mais}>e mais {mais === 1 ? "1 ponto" : `${mais} pontos`}</p> : null}
      </section>
      {gaveta ? (
        <>
          <div className={s.fundo} aria-hidden="true" onClick={fechar} />
          <aside
            id="hoje-gaveta"
            ref={caixa}
            className={`card ${s.gaveta}`}
            aria-label="Aprovações"
            role={modal ? "dialog" : undefined}
            aria-modal={modal ? true : undefined}
          >
            <button type="button" className={`btn sm ${s.fechar}`} aria-label="Fechar" onClick={fechar}>
              <Icone nome="x" tam={16} />
            </button>
            <Aprovacoes obraId={obra.id} />
          </aside>
        </>
      ) : null}
    </>
  );
}

function linhaDoPonto(p: PontoHoje, podeOperar: boolean, irParaTela: ReturnType<typeof useCasca>["irParaTela"]): Linha {
  const { n, texto } = partirTitulo(p.titulo);
  // "Falta você confirmar" não vale para quem só lê: fica o fato, sem a cobrança
  const sub = p.prioridade === "pede_voce" && !podeOperar ? "" : primeiraFrase(p.detalhe);
  // tela que esta versão da web não conhece: melhor sem botão do que um botão que não leva a lugar nenhum
  const tela = p.acao ? telaDe(p.acao.tela) : undefined;
  return {
    chave: p.tipo,
    n,
    titulo: texto,
    sub,
    pede: p.prioridade === "pede_voce",
    rotulo: tela ? p.acao!.rotulo : null,
    ir: tela ? () => irParaTela(tela, p.acao!.filtro) : null,
  };
}

/** A gaveta: os cartões das propostas desta obra, até 3, e o caminho para o resto. */
function Aprovacoes({ obraId }: { obraId: string }) {
  const { cartoes, irParaTela, podeOperar } = useCasca();
  const pendentes = pendentesDa(cartoes, obraId);
  const chavePendentes = pendentes.join(",");
  // Quem acabou de ser decidido continua aqui, com "Aprovado · Desfazer", até a gaveta fechar.
  const [vistos, setVistos] = useState<string[]>([]);
  useEffect(() => {
    if (chavePendentes) setVistos((v) => [...v, ...chavePendentes.split(",").filter((id) => !v.includes(id))]);
  }, [chavePendentes]);
  const primeira = pendentes[0];
  const lista = vistos.filter((id) => cartoes[id]);
  const aMostra = [...lista.filter((id) => pendentes.includes(id)).slice(0, MAX_CARTOES), ...lista.filter((id) => !pendentes.includes(id))];
  const fora = pendentes.length - Math.min(pendentes.length, MAX_CARTOES);
  return (
    <section aria-labelledby="hoje-aprovacoes">
      <h2 id="hoje-aprovacoes" className={s.tituloGaveta}>
        {podeOperar ? (pendentes.length ? `${pendentes.length} ${pendentes.length === 1 ? "aprovação" : "aprovações"}` : "Esperando você") : "Aguardando aprovação"}
      </h2>
      {aMostra.length ? (
        <div className={s.cartoes}>
          {aMostra.map((id) => (
            <CartaoProposta key={id} id={id} foco={id === primeira} compacto />
          ))}
        </div>
      ) : (
        <p className={`card ${s.nada}`}>{podeOperar ? "Nenhuma proposta para aprovar." : "Nenhuma proposta pendente."}</p>
      )}
      {fora ? (
        <button type="button" className={`link ${s.verTodas}`} onClick={() => irParaTela("aprovacoes")}>
          Ver as outras {fora} em Aprovações
        </button>
      ) : null}
    </section>
  );
}
