"use client";
/**
 * Linha de decisão de uma proposta do agente: prazo | título · conta · fonte | valor | [Aprovar] ⋯ (Recusar).
 * Depois de decidir, o cartão fica no lugar ("Aprovado 10:32 por Rizzi · Desfazer") em vez de sumir e fazer a lista
 * pular. Aprovar é o único caminho de execução do que o agente propôs.
 */
import { useEffect, useRef, useState } from "react";
import type { Proposta, StatusPedido } from "@/lib/contrato";
import { fmtHora, fmtReais } from "@/lib/formato";
import { mensagemDe, useCasca } from "./contexto";
import { Modal } from "./Dialogo";
import { Icone } from "./Icone";
import { MenuMais } from "./MenuMais";

export const ROTULO_STATUS: Record<StatusPedido, string> = {
  em_cotacao: "Em cotação",
  aprovado: "Aprovado",
  enviado: "Enviado",
  em_transito: "Em trânsito",
  recebido: "Recebido",
  conferido: "Conferido",
  cancelado: "Cancelado",
};

const valorDe = (p: Proposta) => (p.tipo === "criar_pedido" && typeof p.dados.valor === "number" ? p.dados.valor : null);

/** Botão nomeado pela consequência, como no protótipo ("Aprovar R$ 1.326,00"), nunca um "OK" genérico. */
function rotuloAprovar(p: Proposta) {
  const v = valorDe(p);
  if (v !== null) return `Aprovar ${fmtReais(v)}`;
  if (p.tipo === "avancar_pedido" && p.dados.para === "conferido") return "Aprovar entrada";
  if (p.tipo === "ajuste_estoque") return "Aprovar ajuste";
  return "Aprovar";
}

export function CartaoProposta({ id, foco = true }: { id: string; foco?: boolean }) {
  const { cartoes, usuario, podeOperar, aprovar, recusar, desfazer, avisar } = useCasca();
  const c = cartoes[id];
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recusando, setRecusando] = useState(false);
  const feito = useRef<HTMLDivElement>(null);
  const linha = useRef<HTMLDivElement>(null);
  const statusAntes = useRef(c?.proposta.status);

  // Quem clicou em Aprovar perde o botão: o foco vai para o resultado, não para o topo da página.
  useEffect(() => {
    if (!c || statusAntes.current === c.proposta.status) return;
    statusAntes.current = c.proposta.status;
    if (linha.current?.contains(document.activeElement) || document.activeElement === document.body) {
      (feito.current?.querySelector("button") ?? feito.current)?.focus({ preventScroll: true });
    }
  }, [c]);

  if (!c) return null;
  const p = c.proposta;
  const v = valorDe(p);

  const executar = async (f: () => Promise<void>, ok?: string) => {
    setOcupado(true);
    setErro(null);
    try {
      await f();
      if (ok) avisar(ok);
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setOcupado(false);
    }
  };

  const quem = p.decidido_por_nome ?? (p.decidido_por === usuario?.id ? usuario.nome : "");
  const hora = p.decidido_em ? fmtHora(p.decidido_em) : "";

  let acoes: React.ReactNode;
  if (p.status === "pendente") {
    acoes = podeOperar ? (
      <>
        <button type="button" className={`btn${foco ? " amb" : ""}`} disabled={ocupado} aria-busy={ocupado} onClick={() => executar(() => aprovar(p.id))}>
          {ocupado ? <Icone nome="loader" className="spin" tam={15} /> : null}
          {rotuloAprovar(p)}
        </button>
        <MenuMais itens={[{ rotulo: "Recusar…", acao: () => setRecusando(true) }]} />
      </>
    ) : (
      <span className="pill warn">Espera um admin aprovar</span>
    );
  } else if (p.status === "aprovada") {
    acoes = (
      <div className="ld-feito" ref={feito} tabIndex={-1}>
        <Icone nome="check" tam={14} />
        <span>
          Aprovado {hora}
          {quem ? ` por ${quem}` : ""}
        </span>
        {podeOperar && c.registroId ? (
          <>
            <span aria-hidden="true">·</span>
            <button type="button" disabled={ocupado} onClick={() => executar(() => desfazer(p.id), "Desfeito. Nada mais muda até alguém aprovar de novo.")}>
              Desfazer
            </button>
          </>
        ) : null}
      </div>
    );
  } else if (p.status === "recusada") {
    acoes = (
      <div className="ld-feito recusado" ref={feito} tabIndex={-1}>
        <Icone nome="x" tam={14} />
        <span>
          Recusado {hora}
          {quem ? ` por ${quem}` : ""}
          {p.motivo_recusa ? ` · ${p.motivo_recusa}` : ""}
        </span>
      </div>
    );
  } else {
    acoes = (
      <div className="ld-feito desfeito" ref={feito} tabIndex={-1}>
        <Icone nome="info" tam={14} />
        <span>Desfeito{c.desfeitoEm ? ` ${fmtHora(c.desfeitoEm)}` : ""}</span>
      </div>
    );
  }

  const tom = p.status === "pendente" ? "pede" : p.status === "aprovada" ? "ok" : "info";
  const prazo = p.status === "pendente" ? "Pede você" : p.status === "aprovada" ? "Aprovado" : p.status === "recusada" ? "Recusado" : "Desfeito";

  return (
    <div
      ref={linha}
      className={`ld${p.status !== "pendente" ? " feito" : ""}${c.anim ? ` mv-${c.anim}` : ""}`}
      role="group"
      aria-label={`Proposta: ${p.titulo}`}
    >
      <div className={`ld-prazo t-${tom}`}>{prazo}</div>
      <div className="ld-txt">
        <div className="ld-tit">{p.titulo}</div>
        {p.conta ? <div className="ld-conta">{p.conta}</div> : null}
        {p.fonte ? (
          <div className="ld-fonte">
            <Icone nome="spark" tam={13} />
            <span>
              agente · {p.fonte}
            </span>
          </div>
        ) : null}
      </div>
      <div className="ld-valor">{v !== null ? fmtReais(v) : ""}</div>
      <div className="ld-acts">{acoes}</div>
      {erro ? (
        <div className="ld-erro" role="alert">
          {erro}
        </div>
      ) : null}
      {recusando ? <ModalRecusar titulo={p.titulo} fechar={() => setRecusando(false)} confirmar={(m) => recusar(p.id, m)} /> : null}
    </div>
  );
}

function ModalRecusar({ titulo, fechar, confirmar }: { titulo: string; fechar: () => void; confirmar: (motivo: string) => Promise<void> }) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const campo = useRef<HTMLTextAreaElement>(null);
  const enviar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!motivo.trim()) {
      setErro("Diga o motivo: o agente usa para não propor a mesma coisa de novo.");
      campo.current?.focus();
      return;
    }
    setOcupado(true);
    try {
      await confirmar(motivo.trim());
      fechar();
    } catch (x) {
      setErro(mensagemDe(x));
      setOcupado(false);
    }
  };
  return (
    <Modal
      titulo="Recusar a proposta"
      fechar={fechar}
      focoInicial={campo}
      rodape={
        <>
          <button type="button" className="btn" onClick={fechar}>
            Voltar
          </button>
          <button type="submit" form="form-recusar" className="btn pri" disabled={ocupado}>
            Recusar proposta
          </button>
        </>
      }
    >
      <p className="mut" style={{ margin: 0 }}>
        {titulo}
      </p>
      <form id="form-recusar" onSubmit={enviar} noValidate>
        <label className="l" htmlFor="motivo-recusa">
          Motivo
        </label>
        <textarea
          id="motivo-recusa"
          ref={campo}
          className="f"
          rows={3}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          aria-invalid={!!erro}
          aria-describedby={erro ? "motivo-erro" : undefined}
          placeholder="Ex.: já combinei com outro fornecedor"
        />
        {erro ? (
          <div id="motivo-erro" className="campo-erro" role="alert">
            {erro}
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
