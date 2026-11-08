"use client";
/**
 * Os dados fiscais da obra em passos curtos, como o cadastro da obra: quem é o dono, o que está sendo construído, o
 * VAU da Receita, se vai ser vendida, e a conferência. Grava uma vez só, no fim, pelo mesmo PATCH dos dados da obra e
 * só com o que mudou: o Histórico ganha uma linha e um Desfazer. `leitura`: o viewer abre direto na conferência.
 */
import { useEffect, useRef, useState } from "react";
import type { Obra } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { fmtReais, lerReais } from "@/lib/formato";
import { useCasca } from "../contexto";
import { Modal } from "../Dialogo";
import { Campo, ErroApi, useEnvio } from "../formularios/Campos";
import { Icone } from "../Icone";
import { Escolha } from "../obra/CamposObra";
import { CATEGORIAS, DESTINACOES, FINALIDADES, MATERIAIS, PROPRIETARIOS, SIM_NAO, dadosFiscaisDe, formFiscalDe, validarFiscal, type FormFiscal } from "./rotulos";
import s from "./tributos.module.css";

const PASSOS = [
  { k: "dono", curto: "Dono", titulo: "Quem é o dono da obra", sub: "Pessoa física ou empresa muda a conta: o fator social só reduz o INSS de obra de pessoa física.", campos: ["proprietario", "cno", "dctfweb"] },
  { k: "obra", curto: "A obra", titulo: "O que está sendo construído", sub: "A destinação, o tipo e a categoria dizem quanto da obra a Receita presume que é mão de obra.", campos: ["destinacao", "material", "categoria", "area_complementar", "area_descoberta"] },
  { k: "vau", curto: "VAU", titulo: "O valor do m² da Receita", sub: "O VAU sai todo mês na tabela do SERO, por UF e destinação. A Plumo usa a tabela oficial sozinha.", campos: ["vau", "vau_referencia"] },
  { k: "venda", curto: "Venda", titulo: "A obra vai ser vendida?", sub: "É o que define se há IBS/CBS sobre a obra e quais redutores valem.", campos: ["finalidade", "valor_terreno", "unidades"] },
  { k: "conferir", curto: "Conferir", titulo: "Confira antes de salvar", sub: "A estimativa dos tributos é refeita com estes dados assim que você salvar.", campos: [] },
] as const satisfies readonly { k: string; curto: string; titulo: string; sub: string; campos: readonly (keyof FormFiscal)[] }[];

const DICA_PROPRIETARIO = {
  pf: "O dono é uma pessoa: casa própria, sobrado. Tem fator social pela área.",
  pj: "Construtora ou incorporadora. Sem fator social; a folha e as notas comprovam a mão de obra.",
} as const;
const DICA_FINALIDADE = {
  uso_proprio: "Obra para morar ou usar: não há IBS/CBS sobre ela.",
  venda: "Imóvel novo à venda: paga IBS/CBS com redução de 50%, menos o terreno e o redutor social por unidade.",
  prestacao_servico: "Você constrói para um cliente (empreitada): o IBS/CBS incide sobre o valor do contrato.",
} as const;

// o resumo mostra o valor como a tela mostra dinheiro ("R$ 2.150,00"), não como foi digitado ("2150,00")
const reais = (t: string) => {
  const c = t.trim() ? lerReais(t) : null;
  return c === null ? null : fmtReais(c);
};
const MODOS_VAU = [
  { k: "tabela", rotulo: "Tabela da Receita (automático)" },
  { k: "manual", rotulo: "Informar outro valor" },
] as const;

const rotulo = (opcoes: { k: string; rotulo: string }[], k: string) => opcoes.find((o) => o.k === k)?.rotulo;

export function ModalDadosFiscais({ obra, fechar, leitura = false }: { obra: Obra; fechar: () => void; leitura?: boolean }) {
  const { avisar, avisarFeito, mudou } = useCasca();
  const ultimo = PASSOS.length - 1;
  const [passo, setPasso] = useState(leitura ? ultimo : 0);
  const [f, setF] = useState<FormFiscal>(() => formFiscalDe(obra));
  // VAU à mão só quando a obra já tinha um, ou a pessoa escolhe: o normal é a tabela do mês, que muda sozinha
  const [vauManual, setVauManual] = useState(() => !!obra.vau);
  const caixa = useRef<HTMLDivElement>(null);
  const mudar = (p: Partial<FormFiscal>) => setF((x) => ({ ...x, ...p }));
  const atual = PASSOS[passo]!;
  const ir = setPasso;
  // A cada troca de passo o foco vai para o título dele: quem navega por teclado não fica num botão que sumiu, e o
  // leitor de tela anuncia o passo novo. Na abertura quem põe o foco é o Modal.
  const abriu = useRef(false);
  useEffect(() => {
    if (abriu.current) caixa.current?.focus();
    abriu.current = true;
  }, [passo]);

  const { erros, erroApi, ocupado, enviar } = useEnvio(
    () => {
      const e = validarFiscal(f) as Record<string, string | null>;
      const doPasso = atual.k === "conferir" ? Object.keys(e) : (atual.campos as readonly string[]);
      return Object.fromEntries(doPasso.map((k) => [k, e[k] ?? null]));
    },
    async () => {
      if (passo < ultimo) return ir(passo + 1);
      const dados = dadosFiscaisDe(f, obra);
      if (!Object.keys(dados).length) {
        fechar();
        avisar("Nada mudou.");
        return;
      }
      const r = await api.editarObra(obra.id, dados);
      mudou();
      fechar();
      if (r.registro_id) avisarFeito("Dados fiscais atualizados.", r.registro_id);
      else avisar("Nada mudou.");
    },
  );

  const texto = (k: keyof FormFiscal, rot: string, props: { dica?: string; placeholder?: string; modo?: "decimal" | "numeric" } = {}) => (
    <Campo rotulo={rot} dica={props.dica} erro={erros[k]}>
      {(a) => (
        <input
          {...a}
          className="f"
          autoComplete="off"
          inputMode={props.modo}
          placeholder={props.placeholder}
          value={f[k]}
          onChange={(e) => mudar({ [k]: e.target.value } as Partial<FormFiscal>)}
        />
      )}
    </Campo>
  );

  const vazio = "Não informado";
  const resumo: { passo: number; itens: [string, string][] }[] = [
    {
      passo: 0,
      itens: [
        ["Dono", rotulo(PROPRIETARIOS, f.proprietario) ?? vazio],
        ["CNO", f.cno || vazio],
        ...(f.proprietario === "pf" ? [["DCTFWeb todo mês", f.dctfweb === "sim" ? "Sim" : f.dctfweb === "nao" ? "Não" : vazio] as [string, string]] : []),
      ],
    },
    {
      passo: 1,
      itens: [
        ["Destinação", rotulo(DESTINACOES, f.destinacao) ?? "A do tipo de obra"],
        ["Material", rotulo(MATERIAIS, f.material) ?? "Alvenaria"],
        ["Categoria", rotulo(CATEGORIAS, f.categoria) ?? "A do tipo de obra"],
        ["Complementar coberta", f.area_complementar ? `${f.area_complementar} m²` : "—"],
        ["Complementar descoberta", f.area_descoberta ? `${f.area_descoberta} m²` : "—"],
      ],
    },
    {
      passo: 2,
      itens: vauManual
        ? [
            ["VAU", reais(f.vau) ? `${reais(f.vau)}/m²` : vazio],
            ["Mês do VAU", f.vau_referencia || vazio],
          ]
        : [["VAU", "Tabela da Receita (automático)"]],
    },
    {
      passo: 3,
      itens: [
        ["Finalidade", rotulo(FINALIDADES, f.finalidade) ?? vazio],
        ...(f.finalidade === "venda"
          ? ([
              ["Valor do terreno", reais(f.valor_terreno) ?? "—"],
              ["Imóveis vendidos", f.unidades || "—"],
            ] as [string, string][])
          : []),
      ],
    },
  ];

  const rodape = leitura ? (
    <button type="button" className="btn" onClick={fechar}>
      Fechar
    </button>
  ) : (
    <>
      <button type="button" className="btn" onClick={passo === 0 ? fechar : () => ir(passo - 1)}>
        {passo === 0 ? "Cancelar" : "Voltar"}
      </button>
      <button type="submit" form="form-fiscal" className="btn amb" disabled={ocupado} aria-busy={ocupado}>
        {passo === ultimo ? "Salvar" : "Continuar"}
      </button>
    </>
  );

  return (
    <Modal titulo="Dados fiscais da obra" fechar={fechar} rodape={rodape} classe={s.assistente}>
      {leitura ? null : (
        <ol className="passos" aria-label="Passos dos dados fiscais">
          {PASSOS.map((p, i) => (
            <li key={p.k} className={i === passo ? "on" : i < passo ? "feito" : ""} aria-current={i === passo ? "step" : undefined}>
              <span className="passo-n" aria-hidden="true">
                {i < passo ? <Icone nome="check" tam={13} /> : i + 1}
              </span>
              <span className="passo-t">{p.curto}</span>
            </li>
          ))}
        </ol>
      )}
      <div ref={caixa} tabIndex={-1} className={s.passo} aria-live="polite">
        <h3 className={s.passoTitulo}>{atual.titulo}</h3>
        <p className="mut sm">{leitura ? "Seu papel é de leitura: só um admin pode mudar estes dados." : atual.sub}</p>
      </div>
      <form id="form-fiscal" onSubmit={leitura ? (e) => e.preventDefault() : enviar} noValidate>
        {atual.k === "dono" ? (
          <>
            <div className="campo">
              <span className="l">Dono da obra</span>
              <Escolha rotulo="Dono da obra" grade opcoes={PROPRIETARIOS} valor={f.proprietario || null} mudar={(k) => mudar({ proprietario: k ?? "" })} />
              {f.proprietario ? <p className="mut sm seg-dica">{DICA_PROPRIETARIO[f.proprietario]}</p> : null}
            </div>
            {texto("cno", "CNO (opcional)", { placeholder: "90.012.34567/89", modo: "numeric", dica: "A matrícula da obra no Cadastro Nacional de Obras. Pode ficar para depois." })}
            {f.proprietario === "pf" ? (
              <div className="campo">
                <span className="l">A DCTFWeb da obra foi entregue todo mês?</span>
                <Escolha rotulo="DCTFWeb entregue todo mês" opcoes={[...SIM_NAO]} valor={f.dctfweb || null} mudar={(k) => mudar({ dctfweb: k ?? "" })} />
                <p className="mut sm seg-dica">
                  Com a DCTFWeb em dia e a remuneração declarada passando de 50% da mão de obra presumida (70% acima de 350 m²), o INSS da
                  aferição vai a zero: é o fator de ajuste.
                </p>
              </div>
            ) : null}
          </>
        ) : null}

        {atual.k === "obra" ? (
          <>
            <div className="campo">
              <span className="l">Destinação</span>
              <Escolha rotulo="Destinação" grade opcoes={DESTINACOES} valor={f.destinacao || null} mudar={(k) => mudar({ destinacao: k ?? "" })} />
              {!f.destinacao ? <p className="mut sm seg-dica">Sem escolher, vale a do tipo de obra (casa e sobrado são unifamiliar).</p> : null}
            </div>
            <div className="campo">
              <span className="l">Material predominante</span>
              <Escolha rotulo="Material predominante" opcoes={MATERIAIS} valor={f.material || null} mudar={(k) => mudar({ material: k ?? "" })} />
            </div>
            <div className="campo">
              <span className="l">Categoria</span>
              <Escolha rotulo="Categoria" grade opcoes={CATEGORIAS} valor={f.categoria || null} mudar={(k) => mudar({ categoria: k ?? "" })} />
              <p className="mut sm seg-dica">Reforma conta 35% da mão de obra; demolição, 10%. Sem escolher, vale a do tipo de obra.</p>
            </div>
            <div className="campos2">
              {texto("area_complementar", "Complementar coberta (m²)", { modo: "decimal", placeholder: "Ex.: 30", dica: "Piscina ou quadra cobertas, garagem fora da casa: conta pela metade." })}
              {texto("area_descoberta", "Complementar descoberta (m²)", { modo: "decimal", placeholder: "Ex.: 40", dica: "Piscina, quadra descobertas: conta 25%. Varanda e churrasqueira entram na área da casa." })}
            </div>
          </>
        ) : null}

        {atual.k === "vau" ? (
          <>
            <div className="campo">
              <span className="l">De onde vem o VAU</span>
              <Escolha
                rotulo="De onde vem o VAU"
                opcoes={[...MODOS_VAU]}
                valor={vauManual ? "manual" : "tabela"}
                mudar={(k) => {
                  const manual = k === "manual";
                  setVauManual(manual);
                  // voltar para a tabela apaga o valor à mão: é o que diz à API "use a tabela"
                  if (!manual) mudar({ vau: "", vau_referencia: "" });
                }}
              />
            </div>
            {vauManual ? (
              <div className="campos2">
                {texto("vau", "VAU (R$ por m²)", { modo: "decimal", placeholder: "2.725,32" })}
                {texto("vau_referencia", "Mês do VAU", { placeholder: "11/2026" })}
              </div>
            ) : (
              <p className={s.nota}>
                <Icone nome="info" tam={15} />
                <span>
                  A conta usa o VAU do mês da tabela oficial do SERO, para a UF e a destinação desta obra, e se atualiza quando sai o
                  mês novo. Informe outro valor só se o contador pedir.
                </span>
              </p>
            )}
          </>
        ) : null}

        {atual.k === "venda" ? (
          <>
            <div className="campo">
              <span className="l">Finalidade</span>
              <Escolha rotulo="Finalidade" grade opcoes={FINALIDADES} valor={f.finalidade || null} mudar={(k) => mudar({ finalidade: k ?? "" })} />
              {f.finalidade ? <p className="mut sm seg-dica">{DICA_FINALIDADE[f.finalidade]}</p> : null}
            </div>
            {f.finalidade === "venda" ? (
              <div className="campos2">
                {texto("valor_terreno", "Valor do terreno (R$)", { modo: "decimal", placeholder: "Ex.: 200.000", dica: "Sai da base: é o redutor de ajuste." })}
                {texto("unidades", "Imóveis residenciais vendidos", { modo: "numeric", placeholder: "Ex.: 1", dica: "Cada um tira R$ 100.000 da base." })}
              </div>
            ) : null}
            {f.finalidade === "prestacao_servico" ? <p className="mut sm">A base é o valor do contrato da obra, que já está nos dados da obra.</p> : null}
          </>
        ) : null}

        {atual.k === "conferir" ? (
          <div className={s.conferir}>
            {resumo.map((b) => (
              <section key={b.passo} className={s.bloco} aria-label={PASSOS[b.passo]!.curto}>
                <div className={s.blocoTopo}>
                  <h4>{PASSOS[b.passo]!.titulo}</h4>
                  {leitura ? null : (
                    <button type="button" className="btn sm" onClick={() => ir(b.passo)} aria-label={`Alterar: ${PASSOS[b.passo]!.titulo}`}>
                      Alterar
                    </button>
                  )}
                </div>
                <dl className={s.kv}>
                  {b.itens.map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd className={v === vazio ? "mut" : undefined}>{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        ) : null}
        <ErroApi texto={erroApi} />
      </form>
    </Modal>
  );
}
