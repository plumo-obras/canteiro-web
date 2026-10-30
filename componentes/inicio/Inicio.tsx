"use client";
/**
 * Página inicial depois do login: uma visão de todas as obras para decidir onde entrar. Os números vêm prontos de
 * GET /obras/resumo (somados na API); aqui só se escolhe o que destacar. "Abrir obra" entra no workspace na conversa
 * mais recente da obra (ou numa nova), pelo ?obra=&sessao= que a Casca lê.
 */
import Link from "next/link";
import { useState } from "react";
import type { ResumoObra, StatusObra, Usuario } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import type { SessaoApi } from "@/lib/historico";
import { fmtReais } from "@/lib/formato";
import { Icone } from "../Icone";
import { useCarregar } from "../useCarregar";
import s from "./inicio.module.css";
import { haQuanto, primeiroNome } from "./tempo";

const TXT_STATUS: Record<StatusObra, string> = { em_andamento: "Em andamento", em_orcamento: "Em orçamento", concluida: "Concluída" };
const ORDEM_STATUS: Record<StatusObra, number> = { em_andamento: 0, em_orcamento: 1, concluida: 2 };

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Link do workspace para a obra: a sessão mais recente dela (a lista vem das mais novas) ou uma conversa nova. */
export function hrefDaObra(obraId: string, sessoes: SessaoApi[]) {
  const recente = sessoes.find((x) => x.obra_id === obraId);
  const p = new URLSearchParams({ obra: obraId });
  if (recente) p.set("sessao", recente.id);
  return `/?${p}`;
}

export function Inicio({ usuario }: { usuario: Usuario }) {
  const [tentativa, setTentativa] = useState(0);
  const { dado, erro, carregando } = useCarregar(
    // O histórico só escolhe a sessão do link: se falhar, o cartão abre uma conversa nova e a página segue.
    () => Promise.all([api.resumoObras(), api.listarSessoes({ limite: 100 }).catch(() => [] as SessaoApi[])]),
    [tentativa],
  );
  const [resumos, sessoes] = dado ?? [null, []];
  const ordenados = resumos
    ? [...resumos].sort((a, b) => ORDEM_STATUS[a.obra.status] - ORDEM_STATUS[b.obra.status] || a.obra.nome.localeCompare(b.obra.nome, "pt-BR"))
    : null;
  const esperando = (resumos ?? []).reduce((t, r) => t + r.pendencias, 0);

  return (
    <>
      <header className={s.cab}>
        <div>
          <h1 className={s.ola}>Olá, {primeiroNome(usuario.nome)}</h1>
          <p className={s.sub}>
            Gerencie suas obras
            {resumos?.length ? (
              <>
                {" · "}
                {plural(resumos.length, "obra", "obras")}
                {esperando ? (
                  <>
                    {" · "}
                    <b className={s.pede}>{plural(esperando, "aprovação esperando você", "aprovações esperando você")}</b>
                  </>
                ) : null}
              </>
            ) : null}
          </p>
        </div>
        <Link href="/" className={`btn ${s.atalho}`}>
          <Icone nome="message" tam={15} />
          Ir para as conversas
        </Link>
      </header>

      {erro && !resumos ? (
        <div className="aviso-erro" role="alert">
          <Icone nome="alert" tam={15} />
          <span>
            Não consegui carregar as obras: {erro}{" "}
            <button type="button" className={s.denovo} onClick={() => setTentativa((n) => n + 1)}>
              Tentar de novo
            </button>
          </span>
        </div>
      ) : !ordenados ? (
        <div className={s.grade} aria-busy={carregando} aria-label="Carregando obras">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`${s.cartao} ${s.esqueleto}`} aria-hidden="true">
              <span className={s.osso} style={{ width: "34%" }} />
              <span className={s.osso} style={{ width: "62%", height: 22 }} />
              <span className={s.osso} style={{ width: "100%", height: 96 }} />
            </div>
          ))}
        </div>
      ) : !ordenados.length ? (
        <div className="card vazio">
          <Icone nome="info" tam={24} />
          <h3>Nenhuma obra ainda</h3>
          <p>Quando a primeira obra for cadastrada, ela aparece aqui com o resumo do dia.</p>
        </div>
      ) : (
        <ul className={s.grade} aria-label="Obras">
          {ordenados.map((r) => (
            <CartaoObra key={r.obra.id} r={r} href={hrefDaObra(r.obra.id, sessoes)} />
          ))}
        </ul>
      )}
    </>
  );
}

function CartaoObra({ r, href }: { r: ResumoObra; href: string }) {
  const { obra } = r;
  const titulo = `titulo-${obra.id}`;
  return (
    <li className={s.cartao}>
      <div className={s.topo}>
        <span className={s.status} data-st={obra.status}>
          <span className={s.dot} aria-hidden="true" />
          {TXT_STATUS[obra.status]}
        </span>
        <span className={s.cidade}>{obra.cidade}</span>
      </div>
      <h2 className={s.nome} id={titulo}>
        {obra.nome}
      </h2>
      <dl className={s.numeros}>
        <Numero rotulo="Aprovações pendentes" valor={r.pendencias} tom="pede" texto={String(r.pendencias)} zero="nenhuma" />
        <Numero rotulo="Falta comprar" valor={r.falta_comprar} tom="falta" texto={plural(r.falta_comprar, "insumo", "insumos")} zero="nada" />
        <Numero
          rotulo="Pedidos abertos"
          valor={r.pedidos_abertos}
          tom="info"
          texto={String(r.pedidos_abertos)}
          zero="nenhum"
          extra={r.pedidos_abertos ? fmtReais(r.valor_pedidos_abertos) : undefined}
        />
        <Numero rotulo="NF para conferir" valor={r.nf_para_conferir} tom="pede" texto={String(r.nf_para_conferir)} zero="nenhuma" />
      </dl>
      <div className={s.rodape}>
        <span className={s.quando}>{r.ultima_atividade ? `Última atividade ${haQuanto(r.ultima_atividade)}` : "Sem atividade ainda"}</span>
        <Link href={href} className={`btn amb ${s.abrir}`} aria-describedby={titulo}>
          Abrir obra
          <Icone nome="chevRight" tam={15} />
        </Link>
      </div>
    </li>
  );
}

/** Zero fica apagado: o olho vai direto para o que pede ação. */
function Numero(p: { rotulo: string; valor: number; texto: string; zero: string; tom: "pede" | "falta" | "info"; extra?: string }) {
  const { rotulo, valor, texto, zero, tom, extra } = p;
  return (
    <div className={s.num} data-tom={valor ? tom : "zero"}>
      <dt>{rotulo}</dt>
      <dd>
        <span className={s.valor}>{valor ? texto : zero}</span>
        {extra ? <span className={s.extra}>{extra}</span> : null}
      </dd>
    </div>
  );
}
