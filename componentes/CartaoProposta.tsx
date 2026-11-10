"use client";
/**
 * Linha de decisão de uma proposta do agente: prazo | título · conta · fonte | valor | [Recusar…] [Aprovar] ⋯ (Ajustar).
 * Depois de decidir, o cartão fica no lugar ("Aprovado 10:32 por Rizzi · Desfazer") em vez de sumir e fazer a lista
 * pular. Aprovar é o único caminho de execução do que o agente propôs. Recusar fica à vista, ao lado: num cartão de
 * dinheiro, dizer não pesa tanto quanto dizer sim, e no "⋯" o testador não o achava.
 */
import { useEffect, useRef, useState } from "react";
import type { Proposta, StatusPedido } from "@/lib/contrato";
import { fmtHora, fmtQtd, fmtReais } from "@/lib/formato";
import { mensagemDe, useCasca } from "./contexto";
import { Modal } from "./Dialogo";
import { Icone } from "./Icone";
import { MenuMais } from "./MenuMais";
import { ModalAjustar } from "./formularios/ModalAjustar";

export const ROTULO_STATUS: Record<StatusPedido, string> = {
  em_cotacao: "Em cotação",
  aprovado: "Aprovado",
  enviado: "Enviado",
  em_transito: "Em trânsito",
  parcial: "Parcial",
  // `recebido` é o status antigo (chegou, falta conferir); `conferido` é o que a tela chama de recebido.
  recebido: "Chegou",
  conferido: "Recebido",
  cancelado: "Cancelado",
};

const NOME_CAMPO: Record<string, string> = {
  quantidade: "quantidade",
  quantidade_recebida: "chegou",
  valor: "valor",
  fornecedor: "fornecedor",
  previsao: "previsão",
  nf: "NF",
  nf_numero: "NF",
  nf_data: "data da NF",
  nf_valor: "valor da NF",
  motivo: "motivo",
};

const DINHEIRO = new Set(["valor", "nf_valor"]);

/** "quantidade 34 → 30 · valor R$ 1.326,00 → R$ 1.170,00": o que mudou entre o que o agente propôs e o que foi feito. */
export function descreverAjuste(p: Proposta) {
  const antes = p.dados_originais ?? {};
  const fmt = (k: string, v: unknown) => (v == null || v === "" ? "—" : typeof v === "number" ? (DINHEIRO.has(k) ? fmtReais(v) : fmtQtd(v)) : String(v));
  return Object.keys(NOME_CAMPO)
    .filter((k) => k in p.dados && antes[k] !== p.dados[k])
    .map((k) => `${NOME_CAMPO[k]} ${fmt(k, antes[k])} → ${fmt(k, p.dados[k])}`)
    .join(" · ");
}

const valorDe = (p: Proposta) => (p.tipo === "criar_pedido" && typeof p.dados.valor === "number" ? p.dados.valor : null);

/**
 * O que aprovar faz. A API manda `efeito` desde que "conferido" passou a ter dois sentidos à vista de quem aprova: num
 * pedido parcial ele ENCERRA o resto sem entrada (o teste com o agente mostrou "Aprovar entrada" num encerramento).
 * Proposta antiga, sem o campo: só é entrada se trouxer quantidade ou NF; sem eles não dá para saber, e o botão não
 * promete o que não sabe.
 */
export function efeitoDe(p: Proposta): string | null {
  if (p.efeito) return p.efeito;
  if (p.tipo === "registrar_entrega") return "entrada";
  if (p.tipo === "criar_pedido") return "compra";
  if (p.tipo === "ajuste_estoque") return "ajuste";
  if (p.tipo === "avancar_pedido" && p.dados.para === "conferido") return p.dados.quantidade_recebida != null || p.dados.nf ? "entrada" : null;
  if (p.tipo === "avancar_pedido" && p.dados.para === "cancelado") return "cancelamento";
  return null;
}

/**
 * A API ajusta a conferência que dá entrada (quanto chegou, NF); encerramento e os outros avanços não têm o que mudar.
 * A entrega proposta (linhas e NF) ainda não tem formulário de ajuste: aprova ou recusa.
 */
const podeAjustar = (p: Proposta) =>
  p.tipo === "criar_pedido" || p.tipo === "ajuste_estoque" || (p.tipo === "avancar_pedido" && p.dados.para === "conferido" && efeitoDe(p) !== "encerramento");

/** Botão nomeado pela consequência, como no protótipo ("Aprovar R$ 1.326,00"), nunca um "OK" genérico. */
export function rotuloAprovar(p: Proposta) {
  const v = valorDe(p);
  if (v !== null) return `Aprovar ${fmtReais(v)}`;
  switch (efeitoDe(p)) {
    case "entrada":
      return "Aprovar entrada";
    case "encerramento":
      return "Aprovar encerramento";
    case "cancelamento":
      return "Aprovar cancelamento";
    case "ajuste":
      return "Aprovar ajuste";
    default:
      return "Aprovar";
  }
}

/** "NF 4410 · 05/11/2026 · R$ 910,00": a nota da entrega proposta, para conferir com o papel antes de aprovar. */
export function notaDaEntrega(p: Proposta): string | null {
  if (p.tipo !== "registrar_entrega") return null;
  const d = p.dados;
  const partes = [
    typeof d.nf_numero === "string" && d.nf_numero ? `NF ${d.nf_numero}` : null,
    typeof d.nf_data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.nf_data) ? d.nf_data.split("-").reverse().join("/") : null,
    typeof d.nf_valor === "number" ? fmtReais(d.nf_valor) : null,
  ].filter(Boolean);
  return partes.length ? partes.join(" · ") : "Sem nota fiscal informada";
}

export function CartaoProposta({ id, foco = true, obraNome }: { id: string; foco?: boolean; obraNome?: string }) {
  const { cartoes, usuario, podeOperar, aprovar, recusar, desfazer, avisar } = useCasca();
  const c = cartoes[id];
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recusando, setRecusando] = useState(false);
  const [ajustando, setAjustando] = useState(false);
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
        <button type="button" className="btn" disabled={ocupado} onClick={() => setRecusando(true)}>
          Recusar…
        </button>
        <button type="button" className={`btn${foco ? " amb" : ""}`} disabled={ocupado} aria-busy={ocupado} onClick={() => executar(() => aprovar(p.id))}>
          {ocupado ? <Icone nome="loader" className="spin" tam={15} /> : null}
          {rotuloAprovar(p)}
        </button>
        {podeAjustar(p) ? <MenuMais itens={[{ rotulo: "Ajustar e aprovar…", acao: () => setAjustando(true) }]} /> : null}
      </>
    ) : (
      <span className="pill warn">Espera um admin aprovar</span>
    );
  } else if (p.status === "aprovada") {
    acoes = (
      <div className="ld-feito" ref={feito} tabIndex={-1}>
        <Icone nome="check" tam={14} />
        <span>
          {p.ajustada ? "Aprovado com ajuste" : "Aprovado"} {hora}
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
      className={`ld${p.status !== "pendente" ? " feito" : ""}${p.status === "pendente" && v !== null ? " valor-no-botao" : ""}${c.anim ? ` mv-${c.anim}` : ""}`}
      role="group"
      aria-label={`Proposta: ${p.titulo}`}
    >
      <div className={`ld-prazo t-${tom}`}>{prazo}</div>
      <div className="ld-txt">
        {obraNome ? <div className="ld-obra">{obraNome}</div> : null}
        <div className="ld-tit">{p.titulo}</div>
        {p.justificativa ? <div className="ld-just">{p.justificativa}</div> : null}
        {p.conta ? <div className="ld-conta">{p.conta}</div> : null}
        {notaDaEntrega(p) ? <div className="ld-just">{notaDaEntrega(p)}</div> : null}
        {p.ajustada && p.dados_originais ? <div className="ld-ajuste">Ajustado na aprovação: {descreverAjuste(p)}</div> : null}
        {p.fonte ? (
          <div className="ld-fonte">
            <Icone nome="spark" tam={13} />
            <span>
              mestre de obras · {p.fonte}
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
      {ajustando ? <ModalAjustar proposta={p} fechar={() => setAjustando(false)} /> : null}
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
      setErro("Diga o motivo: o mestre de obras usa para não propor a mesma coisa de novo.");
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
