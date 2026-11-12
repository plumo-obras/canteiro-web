"use client";
/**
 * Aba Projeto: o pacote do projeto estrutural da obra. Cada parte do pacote (locação, formas, fundações, pilares,
 * vigas, lajes, cortes) é responsável por um pedaço do modelo; a pessoa envia as pranchas (por parte ou várias de uma
 * vez) e o tradutor reconhece o que cada uma traz — uma prancha costuma cobrir várias partes. Com locação e formas, a
 * estrutura aparece em 3D; as outras partes completam o modelo (sapata com a medida real, armação) e as contas.
 * Nada é calculado aqui: o checklist, as conferências e os totais vêm prontos do tradutor.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Obra } from "@/lib/contrato";
import { tradutor, type Elemento3D, type Projeto as ProjetoT } from "@/lib/tradutor";
import { CabecalhoPagina } from "./CabecalhoPagina";
import { useCasca } from "./contexto";
import { Confirmar } from "./Dialogo";
import { Icone } from "./Icone";
import { useCelular } from "./midia";
import { EditorCad, type Foco } from "./projeto/EditorCad";
import { CartaoMateriais, Materiais, useMateriais } from "./projeto/Materiais";
import { Vista3D } from "./projeto/Vista3D";
import s from "./projeto/projeto.module.css";

/** Uma prancha enviada nesta obra. Quem decide o que ela é (locação, formas...) é o tradutor, não a pessoa. */
interface Folha {
  id: string;
  nome: string;
}

// as folhas do pacote ficam neste navegador (o tradutor guarda cada leitura por 72 h); gravar na obra é da API, depois
const chave = (obraId: string) => `canteiro:projeto:${obraId}:folhas`;
function lerFolhas(obraId: string): Folha[] {
  try {
    const v = JSON.parse(localStorage.getItem(chave(obraId)) ?? "[]") as unknown;
    return Array.isArray(v) ? (v as Folha[]) : [];
  } catch {
    return [];
  }
}
function gravarFolhas(obraId: string, f: Folha[]) {
  try {
    localStorage.setItem(chave(obraId), JSON.stringify(f));
  } catch {
    // navegador sem armazenamento: o pacote vale só enquanto a aba estiver aberta
  }
}

/** Maior prancha aceita por envio (o limite de corpo das funções da Vercel é 4,5 MB). */
const LIMITE_ENVIO = 4 * 1024 * 1024;

const ROTULO_SITUACAO = { coberto: "Coberto", parcial: "Parcial", faltando: "Falta" } as const;

export function Projeto({ obra }: { obra: Obra }) {
  const [folhas, setFolhas] = useState<Folha[]>([]);
  const [projeto, setProjeto] = useState<ProjetoT | null>(null);
  const [enviando, setEnviando] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const [sobre, setSobre] = useState(false);
  const [baixando, setBaixando] = useState(false);
  // 3D, o CAD sozinho ou os dois lado a lado (o clique no 3D leva o CAD ao elemento na hora)
  const [vista, setVista] = useState<"3d" | "cad" | "lado">("3d");
  const [cadMontado, setCadMontado] = useState(false);
  const [foco, setFoco] = useState<Foco | null>(null);
  const [aba, setAba] = useState<"pacote" | "materiais" | "conferencias" | "folhas">("pacote");
  // com o CAD à vista ele precisa da largura toda (tem os próprios painéis): a coluna da estrutura recolhe e volta por um botão
  const [pacoteNo2d, setPacoteNo2d] = useState(false);
  const [apagando, setApagando] = useState(false);
  const { podeOperar, avisar } = useCasca();
  // o CAD (CADCraft num iframe) pede mouse e tela larga: no celular a vista é só o 3D
  const celular = useCelular();
  const modo = celular ? "3d" : vista;
  const vivo = useRef(true);
  const obraIdRef = useRef(obra.id);
  obraIdRef.current = obra.id;

  const atualizar = useCallback(async (lista: Folha[]) => {
    if (!lista.length) return setProjeto(null);
    try {
      const p = await tradutor.projeto(lista.map((f) => f.id));
      if (!vivo.current) return p;
      if (p.nao_encontradas?.length) {
        // o tradutor já descartou essas leituras: some do pacote, e a pessoa vê o que precisa mandar de novo
        const resto = lista.filter((f) => !p.nao_encontradas.includes(f.id));
        setFolhas(resto);
        gravarFolhas(obraIdRef.current, resto);
      }
      setProjeto(p);
      return p;
    } catch (e) {
      // leitura que o tradutor já descartou (mais de 72 h): some do pacote em vez de travar a tela
      if (vivo.current) setErro((e as Error).message);
    }
  }, []);

  useEffect(() => {
    vivo.current = true;
    const f = lerFolhas(obra.id);
    setFolhas(f);
    void atualizar(f);
    return () => {
      vivo.current = false;
    };
  }, [obra.id, atualizar]);

  // enquanto houver folha sendo lida (imagem leva minutos), o pacote se atualiza sozinho
  const lendo = (projeto?.em_andamento.length ?? 0) > 0;
  useEffect(() => {
    if (!lendo) return;
    const t = setInterval(() => void atualizar(folhas), 4000);
    return () => clearInterval(t);
  }, [lendo, folhas, atualizar]);

  async function enviar(arquivos: File[]) {
    setErro(null);
    setEnviando((v) => [...v, ...arquivos.map((a) => a.name)]);
    let lista = folhas;
    for (const a of arquivos) {
      if (a.size > LIMITE_ENVIO) {
        // o repasse roda numa função da Vercel, que recusa corpo acima de ~4,5 MB com um erro genérico
        setErro(`${a.name}: passa de 4 MB. Exporte a prancha em PDF pelo CAD (fica bem menor) ou reduza a resolução da imagem.`);
        setEnviando((v) => v.filter((n) => n !== a.name));
        continue;
      }
      try {
        const r = await tradutor.enviar(a);
        // a mesma prancha mandada de novo (mesmo nome) substitui a anterior, em vez de entrar duas vezes no pacote
        lista = [...lista.filter((f) => f.id !== r.id && f.nome !== a.name), { id: r.id, nome: a.name }];
        setFolhas(lista);
        gravarFolhas(obra.id, lista);
      } catch (e) {
        setErro(`${a.name}: ${(e as Error).message}`);
      } finally {
        setEnviando((v) => v.filter((n) => n !== a.name));
      }
    }
    return await atualizar(lista);
  }

  /** O DXF salvo no CAD embutido entra no pacote como qualquer prancha; devolve o resumo do que mudou. */
  const aoSalvarNoCad = useCallback(async (arquivo: File) => {
    const p = await enviar([arquivo]);
    const n = p?.edicoes_cad?.mudancas.length ?? 0;
    return n ? `${n} mudança${n === 1 ? "" : "s"} aplicada${n === 1 ? "" : "s"} no modelo. Volte ao 3D para ver.` : "nenhuma mudança em relação ao modelo.";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folhas]);

  const baixarEspelho = useCallback(() => tradutor.espelho(folhas.map((f) => f.id)), [folhas]);

  /** 3D -> 2D: o elemento clicado no 3D vira o foco do CAD (zoom e seleção nele). */
  const escolher3d = useCallback((e: Elemento3D | null) => {
    if (!e) return setFoco(null);
    const g = e.geometria;
    const pts: [number, number][] = g.forma === "caixa"
      ? [[g.centro[0] - g.dimensoes[0] / 2, g.centro[1] - g.dimensoes[1] / 2], [g.centro[0] + g.dimensoes[0] / 2, g.centro[1] + g.dimensoes[1] / 2]]
      : g.poligono;
    const xs = pts.map(([x]) => x);
    const ys = pts.map(([, y]) => y);
    setFoco({ id: e.id, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
  }, []);

  async function abrirNoCad() {
    setBaixando(true);
    setErro(null);
    try {
      const { arquivo, nome } = await tradutor.espelho(folhas.map((f) => f.id));
      const url = URL.createObjectURL(arquivo);
      const a = document.createElement("a");
      a.href = url;
      a.download = nome;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBaixando(false);
    }
  }

  function tirar(id: string) {
    const lista = folhas.filter((f) => f.id !== id);
    setFolhas(lista);
    gravarFolhas(obra.id, lista);
    void atualizar(lista);
  }


  const escolherArquivos = () => entrada.current?.click();
  const soltarAqui = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setSobre(true);
    },
    onDragLeave: () => setSobre(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setSobre(false);
      const arqs = Array.from(e.dataTransfer.files);
      if (arqs.length) void enviar(arqs);
    },
  };

  const cobertas = projeto?.pacote.filter((p) => p.situacao === "coberto").length ?? 0;
  // com folha ainda sendo lida, os materiais e a conta do pacote vão mudar: nada de sugerir o passo seguinte
  const pranchasLidas = cobertas > 0 && !enviando.length && !projeto?.em_andamento.some((a) => a.status !== "falhou");

  const acao = (
    <>
      <input
        ref={entrada}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,.dxf"
        multiple
        hidden
        aria-label="Pranchas do projeto estrutural"
        onChange={(e) => {
          const arqs = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (arqs.length) void enviar(arqs);
        }}
      />
      {podeOperar ? (
      <button type="button" className={pranchasLidas ? "btn" : "btn amb"} disabled={enviando.length > 0} aria-busy={enviando.length > 0} onClick={escolherArquivos}>
        <Icone nome={enviando.length ? "loader" : "arrowUp"} tam={15} className={enviando.length ? "spin" : undefined} />
        Enviar pranchas
      </button>
      ) : null}
    </>
  );
  const menu = [
    ...(projeto?.modelo3d ? [{ rotulo: baixando ? "Gerando o DXF…" : "Baixar o modelo em DXF (para outro CAD)", acao: () => void abrirNoCad() }] : []),
    ...(podeOperar && folhas.length ? [{ rotulo: "Apagar o projeto", acao: () => setApagando(true) }] : []),
  ];

  /** Apaga cada leitura no tradutor e esvazia o pacote desta obra. Não volta: as pranchas precisam ser enviadas de novo. */
  async function apagarProjeto() {
    const n = folhas.length;
    for (const f of folhas) await tradutor.apagar(f.id);
    gravarFolhas(obra.id, []);
    setFolhas([]);
    setProjeto(null);
    setFoco(null);
    setVista("3d");
    setCadMontado(false);
    setPacoteNo2d(false);
    setAba("pacote");
    setApagando(false);
    avisar(`Projeto apagado: ${n} prancha${n === 1 ? "" : "s"} removida${n === 1 ? "" : "s"}.`);
  }

  const idsLidos = (projeto?.traducoes ?? []).filter((id) => folhas.some((f) => f.id === id));
  const materiais = useMateriais(idsLidos, obra.uf || "SP");

  const q = projeto?.quantitativos;
  const o = projeto?.obra;
  const sub = o?.cliente ? [o.cliente, o.responsavel && `cálculo: ${o.responsavel}`].filter(Boolean).join(" · ") : undefined;

  const nomeFolha = (id: string) => folhas.find((f) => f.id === id)?.nome ?? id.slice(0, 8);
  const faltamObrig = projeto?.pacote.filter((p) => p.obrigatorio_para_3d && p.situacao === "faltando") ?? [];
  // o que falta, na ordem do pacote: primeiro o que impede o 3D, depois o que completa o modelo e as contas
  const pendentes = [...(projeto?.pacote ?? [])]
    .filter((p) => p.situacao !== "coberto" && p.papel !== "cortes")
    .sort((a, b) => Number(b.obrigatorio_para_3d) - Number(a.obrigatorio_para_3d));
  const lendoNomes = [...enviando, ...(projeto?.em_andamento ?? []).filter((a) => a.status !== "falhou").map((a) => a.nome ?? nomeFolha(a.id))];
  const verificar = (projeto?.conferencias.filter((c) => !c.ok).length ?? 0) + (projeto?.modelo3d?.avisos.length ?? 0);
  const temModelo = Boolean(projeto?.modelo3d);
  const painelVisivel = !temModelo || modo === "3d" || pacoteNo2d;

  function abrirCad(m: "cad" | "lado" = "cad") {
    setCadMontado(true);
    setVista(m);
  }
  const MODOS = [
    { k: "3d", rotulo: "3D" },
    { k: "cad", rotulo: "CAD" },
    { k: "lado", rotulo: "Lado a lado" },
  ] as const;

  // o selo da disciplina: o que a pessoa precisa saber dela num relance
  const seloEstrutura = lendoNomes.length
    ? { tom: "info", t: "Lendo" }
    : !projeto
      ? { tom: "neutro", t: "Sem pranchas" }
      : cobertas === projeto.pacote.length
        ? { tom: "ok", t: "Completa" }
        : projeto.pronto_para_3d
          ? { tom: "atencao", t: "Em 3D, incompleta" }
          : { tom: "atencao", t: "Falta para o 3D" };
  const resumoEstrutura = [
    `${folhas.length} prancha${folhas.length === 1 ? "" : "s"}`,
    `pacote ${cobertas}/${(projeto?.pacote ?? PACOTE_VAZIO).length}`,
    verificar ? `${verificar} para verificar` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const abas = [
    { k: "pacote", rotulo: "Pacote", n: projeto ? `${cobertas}/${projeto.pacote.length}` : null, dica: `${cobertas} de ${projeto?.pacote.length ?? 0} partes cobertas` },
    { k: "materiais", rotulo: "Materiais", n: null, dica: "" },
    { k: "conferencias", rotulo: "Conferências", n: verificar || null, dica: `${verificar} para verificar` },
    { k: "folhas", rotulo: "Folhas", n: folhas.length || null, dica: `${folhas.length} enviadas` },
  ] as const;

  const soltar = (
    <button type="button" className={`${s.soltar} ${sobre ? s.soltarSobre : ""} ${temModelo ? s.soltarPq : ""}`} disabled={enviando.length > 0} onClick={escolherArquivos} {...soltarAqui}>
      <Icone nome="arrowUp" tam={temModelo ? 16 : 22} />
      <b>{temModelo ? "Arraste mais pranchas ou o DXF editado" : "Arraste aqui as pranchas do projeto estrutural"}</b>
      <span>{temModelo ? "ou clique para escolher" : "PDF do CAD ou imagem, uma ou várias de uma vez. O sistema identifica o que cada prancha traz e mostra o que falta."}</span>
    </button>
  );

  const painelPacote = (
    <>
      {projeto && (q?.aco_total_kg || q?.concreto_total_m3 || projeto.modelo3d) ? (
        <dl className={s.resumo}>
          {q?.aco_total_kg ? (
            <div>
              <dt>Aço</dt>
              <dd>{q.aco_total_kg.toLocaleString("pt-BR")} kg</dd>
              <small>com 10% de perda</small>
            </div>
          ) : null}
          {q?.concreto_total_m3 ? (
            <div>
              <dt>Concreto</dt>
              <dd>{q.concreto_total_m3.toLocaleString("pt-BR")} m³</dd>
              <small>{Object.keys(q.concreto_m3).join(" · ")}</small>
            </div>
          ) : null}
          {projeto.modelo3d ? (
            <div>
              <dt>Elementos</dt>
              <dd>
                {projeto.modelo3d.resumo.pilar ?? 0} pilares · {projeto.modelo3d.resumo.laje ?? 0} lajes
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {projeto && pendentes.length ? (
        <div className={s.faltaResumo}>
          <b>{projeto.pronto_para_3d ? "Para completar o modelo, falta:" : "Para montar o 3D, falta:"}</b>
          <ul>
            {pendentes.map((p) => (
              <li key={p.papel}>
                {p.nome}
                {p.faltam_pavimentos.length ? ` (${p.faltam_pavimentos.join(", ")})` : ""}
                {p.obrigatorio_para_3d ? <span className={s.obrig}> · necessária para o 3D</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ul className={s.pacote} aria-label="Partes do pacote">
        {(projeto?.pacote ?? PACOTE_VAZIO).map((p) => {
          const situacao = p.situacao === "faltando" && !p.obrigatorio_para_3d ? "opcional" : p.situacao;
          return (
            <li key={p.papel} className={s.parte}>
              <span className={s[`sit_${situacao}`]}>{situacao === "opcional" ? "Opcional" : ROTULO_SITUACAO[p.situacao]}</span>
              <div className={s.parteTexto}>
                <b>{p.nome}</b>
                {p.arquivos.length ? (
                  <span className={s.deonde}>
                    {p.arquivos.map((a) => `${a.folha ? `Folha ${a.folha}` : "Folha"} · ${a.arquivo ?? nomeFolha(a.id)}${a.detalhes.length ? ` (${a.detalhes.join(", ")})` : ""}`).join(" · ")}
                  </span>
                ) : (
                  <span className={s.resp}>Traz {p.responsavel_por}</span>
                )}
                {p.faltam_pavimentos.length ? <span className={s.falta}>Falta: {p.faltam_pavimentos.join(", ")}</span> : null}
              </div>
            </li>
          );
        })}
      </ul>
      {projeto?.nao_lidos_ainda.length ? <p className={s.explica}>Ainda não lidas, se o projeto tiver: {projeto.nao_lidos_ainda.join(", ")}.</p> : null}
    </>
  );

  const painelConferencias = (
    <>
      {projeto?.edicoes_cad?.mudancas.length ? (
        <section className={s.bloco}>
          <h3>Editado no CAD</h3>
          <p className={s.explica}>{projeto.edicoes_cad.arquivo}: estas mudanças já estão no modelo.</p>
          <ul className={s.provas}>
              {projeto.edicoes_cad.mudancas.map((m) => (
                <li key={`${m.id}-${m.mudanca}`}>
                  <span className={m.mudanca === "removido" ? s.seloAtencao : s.selo}>
                    {{ movido: "Movido", redimensionado: "Medida", novo: "Novo", removido: "Removido" }[m.mudanca]}
                  </span>
                  {m.texto}
                </li>
              ))}
          </ul>
        </section>
      ) : null}
      {projeto?.conferencias.length || projeto?.modelo3d?.avisos.length ? (
        <section className={s.bloco}>
          <h3>Entre as folhas</h3>
          <ul className={s.provas}>
            {[...(projeto?.conferencias ?? [])]
              .sort((a, b) => Number(a.ok) - Number(b.ok))
              .map((c) => (
                <li key={c.texto}>
                  <span className={c.ok ? s.seloOk : s.seloAtencao}>{c.ok ? "Confere" : "Verificar"}</span>
                  {c.texto}
                </li>
              ))}
            {projeto?.modelo3d?.avisos.map((a) => (
              <li key={a}>
                <span className={s.seloAtencao}>Atenção</span>
                {a}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className={s.explica}>As conferências entre as folhas (mesmo projeto, pilares e sapatas detalhados, níveis) aparecem quando houver pranchas lidas.</p>
      )}
    </>
  );

  const painelFolhas = folhas.length ? (
    <ul className={s.folhas}>
      {folhas.map((f) => {
        const partes = projeto?.pacote.filter((p) => p.arquivos.some((a) => a.id === f.id)).map((p) => p.nome) ?? [];
        const andamento = projeto?.em_andamento.find((a) => a.id === f.id);
        return (
          <li key={f.id}>
            <span className={andamento?.status === "falhou" ? s.seloAtencao : s.selo}>
              {andamento ? (andamento.status === "falhou" ? "Falhou" : "Lendo") : `${partes.length} parte${partes.length === 1 ? "" : "s"}`}
            </span>
            <span className={s.folhaNome}>
              <b>{f.nome}</b>
              <small>{andamento?.erro ?? (partes.length ? partes.join(", ") : "nenhuma parte do pacote")}</small>
            </span>
            {podeOperar ? (
              <button type="button" className="link" onClick={() => tirar(f.id)} aria-label={`Tirar ${f.nome} do pacote`}>
                Tirar
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  ) : (
    <p className={s.explica}>Nenhuma prancha enviada nesta obra ainda.</p>
  );

  return (
    <div className={s.tela}>
      <CabecalhoPagina
        titulo="Projeto"
        sub={sub ?? "As pranchas viram o modelo 3D da obra e a lista de materiais que vai para o orçamento."}
        acao={acao}
        menu={menu}
        rotuloMenu="Mais ações do Projeto"
      />

      {erro ? (
        <div className="aviso-erro" role="alert">
          <Icone nome="alert" tam={15} />
          <span>{erro}</span>
        </div>
      ) : null}

      {/* No topo: abaixo da mesa (uma tela inteira de altura) a pessoa não via o próximo passo. */}
      {pranchasLidas ? <CartaoMateriais obra={obra} dados={materiais.dados} erro={materiais.erro} /> : null}

      <div className={`${s.mesa} ${painelVisivel ? "" : s.mesaCheia}`}>
        {/* À esquerda, as disciplinas do projeto; por enquanto só a estrutura existe de fato. */}
        <div className={s.lado} hidden={!painelVisivel}>
          <aside id="painel-pacote" className={`card ${s.painel}`} aria-label="Pacote do projeto" {...soltarAqui}>
            <div className={s.discCab}>
              <h2 className={s.discT}>Estrutura</h2>
              <span className={s.discSelo} data-tom={seloEstrutura.tom}>
                {seloEstrutura.t}
              </span>
            </div>
            <p className={s.discResumo}>{resumoEstrutura}</p>
            {lendoNomes.length ? (
              <div className={s.lendo} role="status">
                <Icone nome="loader" tam={16} className="spin" />
                <span>
                  <b>Lendo {lendoNomes.join(", ")}</b>
                  <small>PDF leva uns 20 s; imagem, alguns minutos. Pode trocar de aba.</small>
                </span>
              </div>
            ) : null}
            <div className={`seg seg-pq ${s.abas}`} role="tablist" aria-label="Seções do pacote">
              {abas.map((a) => (
                <button key={a.k} type="button" role="tab" id={`aba-${a.k}`} aria-selected={aba === a.k} aria-controls="aba-painel" className={aba === a.k ? "on" : ""} onClick={() => setAba(a.k)} aria-label={a.n ? `${a.rotulo} (${a.dica})` : a.rotulo}>
                  {a.rotulo}
                  {a.n ? <small className="seg-n">{a.n}</small> : null}
                </button>
              ))}
            </div>
            <div id="aba-painel" role="tabpanel" aria-labelledby={`aba-${aba}`} className={s.painelCorpo}>
              {aba === "pacote" ? (
                painelPacote
              ) : aba === "materiais" ? (
                <Materiais {...materiais} />
              ) : aba === "conferencias" ? (
                painelConferencias
              ) : (
                painelFolhas
              )}
            </div>
            {/* o envio fica sempre à mão no pé da coluna, qualquer que seja a aba: mais pranchas ou o DXF editado */}
            {temModelo && podeOperar ? <div className={s.peEnvio}>{soltar}</div> : null}
          </aside>
          {/* Hidráulica, elétrica e incêndio ainda não existem na API: só o aviso, sem botão nem estado de mentira. */}
          <p className={s.outras}>
            <Icone nome="plus" tam={14} />
            <span>Hidráulica, elétrica e incêndio</span>
            <span className={s.breve}>em breve</span>
          </p>
        </div>

        <section className={s.visor} aria-label="Modelo da obra">
          {projeto?.modelo3d ? (
            <>
              <div className={s.visorCab}>
                <b className={s.visorT}>Modelo da obra</b>
                {celular ? (
                  <span className={s.soComputador}>Editar no CAD: só no computador</span>
                ) : (
                  <div className="seg seg-pq" role="tablist" aria-label="Vista da estrutura">
                    {MODOS.map((m) => (
                      <button
                        key={m.k}
                        type="button"
                        role="tab"
                        id={`vista-${m.k}`}
                        aria-selected={modo === m.k}
                        aria-controls="vista-painel"
                        className={modo === m.k ? "on" : ""}
                        onClick={() => (m.k === "3d" ? setVista("3d") : abrirCad(m.k))}
                      >
                        {m.rotulo}
                      </button>
                    ))}
                  </div>
                )}
                {celular ? null : foco ? (
                  <span className={s.selecao} role="status">
                    <b>{foco.id}</b>
                    {modo === "3d" ? (
                      <button type="button" className="btn sm" onClick={() => abrirCad()}>
                        Editar {foco.id} no CAD
                      </button>
                    ) : (
                      <span>selecionado no CAD</span>
                    )}
                  </span>
                ) : (
                  <span className={s.dicaVista}>
                    {modo === "3d"
                      ? "Clique num elemento para vê-lo e editá-lo no CAD."
                      : modo === "lado"
                        ? "Clique no 3D e o CAD vai ao elemento. Salve no CAD (Ctrl+S) para levar a edição ao 3D."
                        : "Salve no CAD (Ctrl+S) para levar a edição ao 3D."}
                  </span>
                )}
                {modo !== "3d" ? (
                  <button type="button" className={`btn sm ${s.mostrarPacote}`} aria-expanded={pacoteNo2d} aria-controls="painel-pacote" onClick={() => setPacoteNo2d((v) => !v)}>
                    <Icone nome="planilha" tam={14} />
                    {pacoteNo2d ? "Esconder o pacote" : "Mostrar o pacote"}
                  </button>
                ) : null}
              </div>
              <div id="vista-painel" role="tabpanel" aria-labelledby={celular ? undefined : `vista-${modo}`} className={`${s.visorCorpo} ${modo === "lado" ? s.visorLado : ""}`}>
                {modo !== "cad" ? <Vista3D modelo={projeto.modelo3d} aoEscolher={escolher3d} /> : null}
                {cadMontado && !celular ? <EditorCad espelho={baixarEspelho} aoSalvar={aoSalvarNoCad} foco={foco} visivel={modo !== "3d"} /> : null}
              </div>
            </>
          ) : (
            <div className={s.visorVazio}>
              {projeto && faltamObrig.length ? (
                <div className={s.vazioTexto}>
                  <Icone nome="predio" tam={28} />
                  <h3>Falta {faltamObrig.map((p) => p.nome.toLowerCase()).join(" e ")} para o 3D</h3>
                  <p>É dela que saem a posição dos pilares e o traçado de vigas e lajes.</p>
                </div>
              ) : null}
              {podeOperar ? soltar : <p className={s.explica}>Nenhuma prancha do projeto estrutural nesta obra ainda.</p>}
            </div>
          )}
        </section>
      </div>

      {apagando ? (
        <Confirmar titulo="Apagar o projeto desta obra?" confirmar={`Apagar ${folhas.length} prancha${folhas.length === 1 ? "" : "s"}`} fechar={() => setApagando(false)} aoConfirmar={apagarProjeto}>
          <p>
            Saem do pacote e do tradutor as {folhas.length} pranchas enviadas, o modelo 3D e as edições feitas no CAD. Não dá para desfazer: para
            ter o projeto de volta, envie as pranchas de novo.
          </p>
        </Confirmar>
      ) : null}
    </div>
  );
}

/** As partes antes de qualquer envio: a mesma lista do tradutor, para a pessoa ver o que o pacote pede. */
const PACOTE_VAZIO: ProjetoT["pacote"] = (
  [
    ["locacao", "Locação de pilares e fundações", "posição de cada pilar, eixos e profundidade das sapatas", true],
    ["formas", "Formas dos pavimentos", "vigas, lajes e níveis de cada pavimento", true],
    ["fundacoes", "Detalhamento das fundações", "medida real das sapatas e o aço delas", false],
    ["pilares", "Armação dos pilares", "o aço de cada pilar e os lances", false],
    ["vigas", "Armação das vigas", "o aço das vigas de cada pavimento", false],
    ["lajes", "Armação das lajes / vigotas", "o aço das lajes e as vigotas", false],
    ["cortes", "Cortes", "níveis e pé-direito, para conferência", false],
  ] as const
).map(([papel, nome, responsavel_por, obrigatorio_para_3d]) => ({
  papel,
  nome,
  responsavel_por,
  obrigatorio_para_3d,
  situacao: "faltando" as const,
  arquivos: [],
  faltam_pavimentos: [],
}));
