"use client";
/**
 * Etapas e tópicos onde os gastos da obra entram. As etapas fixas são iguais em toda obra (não se renomeiam nem se
 * apagam); a obra cria as extras e os tópicos dentro de qualquer etapa. Apagar é arquivar: o gasto antigo continua lá.
 */
import { useState } from "react";
import type { EtapaNaArvore, Obra } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { mensagemDe, useCasca } from "../contexto";
import { Modal } from "../Dialogo";
import { Icone } from "../Icone";
import s from "./gastos.module.css";

type Editando =
  | { k: "etapa" }
  | { k: "topico"; etapa: EtapaNaArvore }
  | { k: "renomearEtapa"; etapa: EtapaNaArvore }
  | { k: "renomearTopico"; id: string; nome: string };

export function Arvore({ obra, arvore }: { obra: Obra; arvore: EtapaNaArvore[] }) {
  const { podeOperar, mudou, avisar, avisarFeito } = useCasca();
  const [editando, setEditando] = useState<Editando | null>(null);

  const arquivar = async (tipo: "etapa" | "topico", id: string, nome: string) => {
    try {
      const r = tipo === "etapa" ? await api.editarEtapaExtra(id, { arquivado: true }) : await api.editarTopico(id, { arquivado: true });
      mudou();
      avisarFeito(`${nome} arquivado. Os gastos que já estão nele continuam.`, r.registro_id);
    } catch (e) {
      avisar(mensagemDe(e), true);
    }
  };

  return (
    <>
      <div className={s.arvoreTopo}>
        <p className="mut sm">
          As etapas fixas são iguais em toda obra. Crie tópicos dentro delas (ex.: “Bloco B”, “Mão de obra”) e etapas extras para o que for
          só desta obra.
        </p>
        {podeOperar ? (
          <button type="button" className="btn sm" onClick={() => setEditando({ k: "etapa" })}>
            <Icone nome="plus" tam={14} />
            Nova etapa
          </button>
        ) : null}
      </div>
      <ul className={`card lista ${s.arvore}`} role="list">
        {arvore.map((e) => (
          <li key={e.chave} className={s.arvoreEtapa}>
            <div className={s.arvoreLinha}>
              <div>
                <strong>{e.nome}</strong> {e.fixa ? null : <span className="pill info">desta obra</span>}
                {e.inclui ? <div className="mut sm">{e.inclui}</div> : null}
              </div>
              {podeOperar ? (
                <div className={s.arvoreAcoes}>
                  <button type="button" className="btn sm" onClick={() => setEditando({ k: "topico", etapa: e })}>
                    <Icone nome="plus" tam={13} />
                    Tópico
                  </button>
                  {!e.fixa ? (
                    <>
                      <button type="button" className="btn sm" onClick={() => setEditando({ k: "renomearEtapa", etapa: e })}>
                        Renomear
                      </button>
                      <button type="button" className="btn sm" onClick={() => arquivar("etapa", e.chave.slice(2), e.nome)}>
                        Arquivar
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
            {e.topicos.length ? (
              <ul className={s.topicos} role="list" aria-label={`Tópicos de ${e.nome}`}>
                {e.topicos.map((t) => (
                  <li key={t.id} className={s.topico}>
                    {podeOperar ? (
                      <button type="button" className={s.topicoNome} onClick={() => setEditando({ k: "renomearTopico", id: t.id, nome: t.nome })} title="Renomear">
                        {t.nome}
                      </button>
                    ) : (
                      <span className={s.topicoNome}>{t.nome}</span>
                    )}
                    {podeOperar ? (
                      <button type="button" className={s.topicoX} aria-label={`Arquivar ${t.nome}`} onClick={() => arquivar("topico", t.id, t.nome)}>
                        <Icone nome="x" tam={12} />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
      {editando ? <ModalNome obra={obra} editando={editando} fechar={() => setEditando(null)} /> : null}
    </>
  );
}

function ModalNome({ obra, editando, fechar }: { obra: Obra; editando: Editando; fechar: () => void }) {
  const { mudou, avisarFeito } = useCasca();
  const inicial = editando.k === "renomearEtapa" ? editando.etapa.nome : editando.k === "renomearTopico" ? editando.nome : "";
  const [nome, setNome] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const titulo =
    editando.k === "etapa"
      ? "Nova etapa desta obra"
      : editando.k === "topico"
        ? `Novo tópico em ${editando.etapa.nome}`
        : editando.k === "renomearEtapa"
          ? "Renomear etapa"
          : "Renomear tópico";

  const salvar = async (ev?: React.FormEvent) => {
    ev?.preventDefault();
    if (!nome.trim()) return setErro("Dê um nome.");
    setOcupado(true);
    setErro(null);
    try {
      const r =
        editando.k === "etapa"
          ? await api.criarEtapaExtra(obra.id, nome)
          : editando.k === "topico"
            ? await api.criarTopico(obra.id, editando.etapa.chave, nome)
            : editando.k === "renomearEtapa"
              ? await api.editarEtapaExtra(editando.etapa.chave.slice(2), { nome })
              : await api.editarTopico(editando.id, { nome });
      mudou();
      avisarFeito(editando.k === "etapa" || editando.k === "topico" ? `${r.nome} criado.` : `Agora se chama ${r.nome}.`, r.registro_id);
      fechar();
    } catch (e) {
      setErro(mensagemDe(e));
      setOcupado(false);
    }
  };

  return (
    <Modal
      titulo={titulo}
      fechar={fechar}
      rodape={
        <>
          <button type="button" className="btn" onClick={fechar}>
            Cancelar
          </button>
          <button type="button" className="btn amb" disabled={ocupado} aria-busy={ocupado} onClick={() => salvar()}>
            {ocupado ? <Icone nome="loader" className="spin" tam={14} /> : null}
            Salvar
          </button>
        </>
      }
    >
      <form onSubmit={salvar}>
        <label className="l" htmlFor="nome-arvore">
          Nome
        </label>
        <input id="nome-arvore" className="f" maxLength={60} autoFocus value={nome} onChange={(e) => setNome(e.target.value)} aria-invalid={!!erro} />
        {erro ? (
          <div className="campo-erro" role="alert">
            {erro}
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
