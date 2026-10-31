"use client";
/**
 * Escolher o insumo digitando, como se fala no canteiro ("cal", "brita"). A lista filtra sem ligar para acento e
 * maiúscula. Quando o que foi digitado não existe e `permitirNovo` está ligado, a última opção cadastra o insumo:
 * material que chegou ou foi comprado fora da planilha do orçamento é rotina, não exceção.
 * Combobox do ARIA 1.2: ↑↓ navegam, Enter escolhe, Esc fecha; o foco fica no campo o tempo todo.
 */
import { useId, useRef, useState } from "react";
import type { ItemInsumo } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { fmtQtdUn } from "@/lib/formato";

export type EscolhaInsumo = { tipo: "existente"; id: string } | { tipo: "novo"; nome: string } | null;

const normal = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export function CampoInsumo(props: {
  itens: ItemInsumo[];
  valor: EscolhaInsumo;
  mudar: (v: EscolhaInsumo) => void;
  permitirNovo: boolean;
  /** Quando não dá para cadastrar aqui: o que dizer se o nome digitado não existe (ex.: "use Entrada"). */
  dicaSemNovo?: string;
  /** Atributos de acessibilidade vindos do <Campo> (id, aria-invalid, aria-describedby). */
  a: { id: string; "aria-invalid": boolean; "aria-describedby"?: string };
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const { itens, valor, mudar, permitirNovo, a } = props;
  const escolhido = valor?.tipo === "existente" ? itens.find((i) => i.insumo.id === valor.id) : undefined;
  const [texto, setTexto] = useState(escolhido?.insumo.nome ?? (valor?.tipo === "novo" ? valor.nome : ""));
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const lista = useId();
  const caixa = useRef<HTMLDivElement>(null);

  const q = normal(texto);
  const achados = q ? itens.filter((i) => normal(i.insumo.nome).includes(q)) : itens;
  const exato = itens.some((i) => normal(i.insumo.nome) === q);
  const opcoes: ({ tipo: "existente"; item: ItemInsumo } | { tipo: "novo"; nome: string })[] = [
    ...achados.map((item) => ({ tipo: "existente" as const, item })),
    ...(permitirNovo && q && !exato ? [{ tipo: "novo" as const, nome: texto.replace(/\s+/g, " ").trim() }] : []),
  ];

  const escolher = (i: number) => {
    const o = opcoes[i];
    if (!o) return;
    if (o.tipo === "existente") {
      setTexto(o.item.insumo.nome);
      mudar({ tipo: "existente", id: o.item.insumo.id });
    } else {
      setTexto(o.nome);
      mudar({ tipo: "novo", nome: o.nome });
    }
    setAberto(false);
  };

  const digitar = (t: string) => {
    setTexto(t);
    setAberto(true);
    setAtivo(0);
    // O nome digitado igual a um insumo existente já é a escolha dele: ninguém precisa clicar na lista para confirmar.
    const igual = itens.find((i) => normal(i.insumo.nome) === normal(t));
    mudar(igual ? { tipo: "existente", id: igual.insumo.id } : null);
  };

  return (
    <div
      className="cbx"
      ref={caixa}
      onBlur={(e) => {
        if (!caixa.current?.contains(e.relatedTarget as Node)) setAberto(false);
      }}
    >
      <input
        {...a}
        ref={props.inputRef}
        className="f"
        role="combobox"
        aria-expanded={aberto && opcoes.length > 0}
        aria-controls={lista}
        aria-autocomplete="list"
        aria-activedescendant={aberto && opcoes[ativo] ? `${lista}-${ativo}` : undefined}
        autoComplete="off"
        placeholder="Digite o nome, ex.: cimento"
        value={texto}
        onChange={(e) => digitar(e.target.value)}
        onFocus={() => !valor && setAberto(true)}
        onClick={() => setAberto(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAberto(true);
            setAtivo((x) => Math.min(opcoes.length - 1, x + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setAtivo((x) => Math.max(0, x - 1));
          } else if (e.key === "Enter" && aberto && opcoes.length) {
            e.preventDefault();
            escolher(ativo);
          } else if (e.key === "Escape" && aberto) {
            // Esc fecha a lista, não o modal inteiro
            e.preventDefault();
            e.stopPropagation();
            setAberto(false);
          }
        }}
      />
      {aberto && !opcoes.length && q && props.dicaSemNovo ? (
        <div className="cbx-lista cbx-vazio" role="status">
          Nenhum insumo «{texto.trim()}» nesta obra. {props.dicaSemNovo}
        </div>
      ) : null}
      {aberto && opcoes.length ? (
        <ul className="cbx-lista" id={lista} role="listbox">
          {opcoes.map((o, i) => (
            <li
              key={o.tipo === "existente" ? o.item.insumo.id : "novo"}
              id={`${lista}-${i}`}
              role="option"
              aria-selected={i === ativo}
              className={`${i === ativo ? "on" : ""}${o.tipo === "novo" ? " novo" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setAtivo(i)}
              onClick={() => escolher(i)}
            >
              {o.tipo === "existente" ? (
                <>
                  <span>{o.item.insumo.nome}</span>
                  <small>
                    tem {fmtQtdUn(o.item.conta.saldo, o.item.insumo.unidade)}
                    {o.item.conta.falta > 0 ? ` · falta ${fmtQtdUn(o.item.conta.falta, o.item.insumo.unidade)}` : ""}
                  </small>
                </>
              ) : (
                <span>
                  + Cadastrar <b>«{o.nome}»</b> como insumo novo
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Unidades mais comuns no canteiro, para o cadastro rápido não virar campo de texto livre ("saco", "sc", "Sc."…). */
export const UNIDADES = ["un", "sc", "kg", "m³", "m²", "m", "l", "cx", "barra", "rolo", "lata", "pç"];

/**
 * Cadastro do insumo novo no envio do formulário. Guarda o que já criou: se o lançamento falhar depois do cadastro,
 * o reenvio usa o insumo criado em vez de tentar cadastrar de novo (que daria 409 por nome repetido).
 */
export function useInsumoNovo(obraId: string) {
  const [unidade, setUnidade] = useState("");
  const [curva, setCurva] = useState<"A" | "B" | "C">("C");
  const criados = useRef(new Map<string, { id: string; unidade: string }>());
  const garantir = async (escolha: EscolhaInsumo, itens: ItemInsumo[]) => {
    if (!escolha) throw new Error("Escolha o insumo.");
    if (escolha.tipo === "existente") {
      const i = itens.find((x) => x.insumo.id === escolha.id)!;
      return { id: escolha.id, nome: i.insumo.nome, unidade: i.insumo.unidade };
    }
    const ja = criados.current.get(escolha.nome);
    if (ja) return { id: ja.id, nome: escolha.nome, unidade: ja.unidade };
    const ins = await api.criarInsumo(obraId, { nome: escolha.nome, unidade, curva });
    criados.current.set(escolha.nome, { id: ins.id, unidade: ins.unidade });
    return { id: ins.id, nome: ins.nome, unidade: ins.unidade };
  };
  return { unidade, setUnidade, curva, setCurva, garantir };
}

export function CamposInsumoNovo({ nome, novo, erroUnidade }: { nome: string; novo: ReturnType<typeof useInsumoNovo>; erroUnidade?: string | null }) {
  const idU = useId();
  const idC = useId();
  return (
    <div className="ins-novo">
      <p className="ins-novo-t">
        <b>«{nome}»</b> não está no orçamento desta obra e vai ser cadastrado. Ele aparece no almoxarifado, mas fica fora da conta de falta.
      </p>
      <div className="campos2">
        <div className="campo">
          <label className="l" htmlFor={idU}>
            Unidade
          </label>
          <select
            id={idU}
            className="f"
            value={novo.unidade}
            aria-invalid={!!erroUnidade}
            aria-describedby={erroUnidade ? `${idU}-e` : undefined}
            onChange={(e) => novo.setUnidade(e.target.value)}
          >
            <option value="">Escolha…</option>
            {UNIDADES.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          {erroUnidade ? (
            <div id={`${idU}-e`} className="campo-erro" role="alert">
              {erroUnidade}
            </div>
          ) : null}
        </div>
        <div className="campo">
          <label className="l" htmlFor={idC}>
            Curva ABC
          </label>
          <select id={idC} className="f" value={novo.curva} onChange={(e) => novo.setCurva(e.target.value as "A" | "B" | "C")}>
            <option value="A">A · caro ou crítico (saída pede a frente)</option>
            <option value="B">B · intermediário</option>
            <option value="C">C · miúdo</option>
          </select>
        </div>
      </div>
    </div>
  );
}
