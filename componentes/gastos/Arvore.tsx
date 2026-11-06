"use client";
/**
 * Etapas e tópicos onde os gastos da obra entram. Com orçamento, as etapas são as dele (código e descrição); sem, as
 * etapas padrão, iguais em toda obra. Nenhuma das duas se renomeia nem se apaga; a obra cria as extras e os tópicos
 * dentro de qualquer etapa. Apagar é arquivar: o gasto antigo continua lá, e "Mostrar arquivados" traz de volta.
 */
import { useId, useState } from "react";
import type { EtapaNaArvore, Obra, ResumoGastos } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { mensagemDe, useCasca } from "../contexto";
import { Modal } from "../Dialogo";
import { Icone } from "../Icone";
import { arquivadosDoResumo, codigoDaEtapa, origemDaArvore, type Arquivado } from "./escolhas";
import s from "./gastos.module.css";

type Editando =
  | { k: "etapa" }
  | { k: "topico"; etapa: EtapaNaArvore }
  | { k: "renomearEtapa"; etapa: EtapaNaArvore }
  | { k: "renomearTopico"; id: string; nome: string };

export function Arvore({ obra, arvore, resumo }: { obra: Obra; arvore: EtapaNaArvore[]; resumo: ResumoGastos | null }) {
  const { podeOperar, mudou, avisar, avisarFeito } = useCasca();
  const [editando, setEditando] = useState<Editando | null>(null);
  const [verArquivados, setVerArquivados] = useState(false);
  const [reativando, setReativando] = useState<string | null>(null);
  const origem = origemDaArvore(arvore);
  const arquivados = arquivadosDoResumo(arvore, resumo);

  const reativar = async (a: Arquivado) => {
    setReativando(a.id);
    try {
      const r = a.tipo === "etapa" ? await api.editarEtapaExtra(a.id, { arquivado: false }) : await api.editarTopico(a.id, { arquivado: false });
      mudou();
      avisarFeito(`${a.nome} reativado.`, r.registro_id);
    } catch (e) {
      avisar(mensagemDe(e), true);
    } finally {
      setReativando(null);
    }
  };

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
        <div>
          {origem === "padrao" ? (
            <p className={s.nota}>
              <Icone nome="alert" tam={13} /> Obra sem orçamento: etapas padrão.
            </p>
          ) : null}
          <p className="mut sm">
            {origem === "orcamento" ? "As etapas são as do orçamento da obra." : "As etapas padrão são iguais em toda obra."} Crie tópicos
            dentro delas (ex.: “Bloco B”, “Mão de obra”) e etapas extras para o que for só desta obra.
          </p>
        </div>
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
                {codigoDaEtapa(e) ? <span className={s.codigo}>{codigoDaEtapa(e)}</span> : null}
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
      <div className={s.arquivadosTopo}>
        <label className={s.alternar}>
          <input type="checkbox" checked={verArquivados} onChange={(e) => setVerArquivados(e.target.checked)} />
          Mostrar arquivados{arquivados.length ? ` (${arquivados.length})` : ""}
        </label>
      </div>
      {verArquivados ? (
        arquivados.length ? (
          <ul className={`card lista ${s.arvore}`} role="list" aria-label="Arquivados">
            {arquivados.map((a) => (
              <li key={`${a.tipo}-${a.id}`} className={`${s.arvoreEtapa} ${s.arquivado}`}>
                <div className={s.arvoreLinha}>
                  <div>
                    <strong>{a.nome}</strong> <span className="pill">{a.tipo === "etapa" ? "etapa arquivada" : "tópico arquivado"}</span>
                    {a.tipo === "topico" ? <div className="mut sm">em {a.etapaNome}</div> : null}
                  </div>
                  {podeOperar ? (
                    <button type="button" className="btn sm" disabled={reativando === a.id} aria-busy={reativando === a.id} onClick={() => reativar(a)}>
                      {reativando === a.id ? <Icone nome="loader" className="spin" tam={13} /> : null}
                      Reativar
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null
      ) : null}
      {verArquivados ? (
        <p className="mut sm">
          Aqui aparecem os arquivados que já têm gasto. Um arquivado sem nenhum gasto volta pelo Desfazer no Histórico.
        </p>
      ) : null}
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
  const idNome = useId();
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
        <label className="l" htmlFor={idNome}>
          Nome
        </label>
        <input id={idNome} className="f" maxLength={60} autoFocus value={nome} onChange={(e) => setNome(e.target.value)} aria-invalid={!!erro} />
        {erro ? (
          <div className="campo-erro" role="alert">
            {erro}
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
