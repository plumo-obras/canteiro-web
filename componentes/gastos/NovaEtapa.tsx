"use client";
/** "+ criar etapa" no próprio seletor: o gasto de algo que a obra não previa não pode parar por falta de etapa. */
import { useState } from "react";
import type { EtapaNaArvore } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { mensagemDe, useCasca } from "../contexto";
import { Icone } from "../Icone";
import s from "./gastos.module.css";

export function NovaEtapa({ obraId, criada }: { obraId: string; criada: (e: EtapaNaArvore) => void }) {
  const { avisarFeito, mudou } = useCasca();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  if (!aberto) {
    return (
      <button type="button" className={`link ${s.criarEtapa}`} onClick={() => setAberto(true)}>
        + criar etapa
      </button>
    );
  }
  const criar = async () => {
    if (ocupado) return; // Enter duas vezes criaria duas etapas
    const limpo = nome.trim();
    if (!limpo) return setErro("Dê um nome para a etapa.");
    setOcupado(true);
    setErro(null);
    try {
      const r = await api.criarEtapaExtra(obraId, limpo);
      mudou();
      avisarFeito(`Etapa ${r.nome} criada.`, r.registro_id);
      criada({ chave: r.chave, nome: r.nome, inclui: "", fixa: false, topicos: [] });
      setAberto(false);
      setNome("");
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setOcupado(false);
    }
  };
  return (
    <span className={s.novaEtapa}>
      <input
        className="f"
        aria-label="Nome da etapa nova"
        autoComplete="off"
        maxLength={80}
        autoFocus
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => {
          // dentro do formulário da revisão, o Enter criaria o gasto em vez da etapa
          if (e.key === "Enter") {
            e.preventDefault();
            void criar();
          }
        }}
      />
      <button type="button" className="btn sm" disabled={ocupado} aria-busy={ocupado} onClick={() => void criar()}>
        {ocupado ? <Icone nome="loader" className="spin" tam={14} /> : null}
        Criar etapa
      </button>
      <button type="button" className="btn sm" onClick={() => setAberto(false)}>
        Voltar
      </button>
      {erro ? (
        <span className="campo-erro" role="alert">
          {erro}
        </span>
      ) : null}
    </span>
  );
}
