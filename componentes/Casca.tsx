"use client";
/**
 * A casca do app: topo de vidro com a obra e as telas em pílulas (Agente, Orçamento, Suprimentos…), trilho de
 * atalhos à esquerda e o painel das conversas com o agente, que abre ao lado do trilho. Uma tela por vez no palco;
 * a conversa fica montada (escondida) enquanto outra tela está aberta, para o texto digitado e o "Parar" não se
 * perderem. No celular o trilho some: o painel vira gaveta e as pílulas rolam na horizontal.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Obra, Usuario } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { formatarHistorico } from "@/lib/historico";
import { sair } from "@/lib/sessao";
import { Aprovacoes } from "./Aprovacoes";
import { ProvedorCasca, mensagemDe, useCasca } from "./contexto";
import { Conversa } from "./Conversa";
import { Icone, Logo, type NomeIcone } from "./Icone";
import { Suprimentos } from "./Suprimentos";
import { Cronograma } from "./cronograma/Cronograma";
import { Historico } from "./Historico";
import { Orcamento } from "./Orcamento";
import { ModalDadosObra } from "./obra/ModalDadosObra";
import { trocarTema, useTema } from "./tema";
import { useCelular, useMidia } from "./midia";
import { useSessaoGarantida } from "./useSessaoGarantida";
import { telaDe, novaSessao, redutorSessoes, type AbaAtiva } from "./sessoes";

const NAV: { k: AbaAtiva; rotulo: string; icone: NomeIcone }[] = [
  { k: "conversa", rotulo: "Agente", icone: "message" },
  { k: "orcamento", rotulo: "Orçamento", icone: "calc" },
  { k: "cronograma", rotulo: "Cronograma", icone: "calendario" },
  { k: "suprimentos", rotulo: "Compras", icone: "package" },
  { k: "aprovacoes", rotulo: "Aprovações", icone: "checkCircle" },
  { k: "historico", rotulo: "Histórico", icone: "history" },
];

const COR_STATUS: Record<Obra["status"], string> = { em_andamento: "var(--green)", em_orcamento: "var(--gray)", concluida: "var(--blue)" };
const TXT_STATUS: Record<Obra["status"], string> = { em_andamento: "em andamento", em_orcamento: "em orçamento", concluida: "concluída" };
const iniciais = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

/** Entrada da casca: garante a sessão de login (renovando pelo cookie depois de recarregar) antes de montar o app. */
export function Casca({ demo }: { demo: boolean }) {
  const usuario = useSessaoGarantida();

  if (!usuario) {
    return (
      <div className="abrindo" role="status">
        Abrindo o Plumo…
      </div>
    );
  }
  return (
    <ProvedorCasca usuario={usuario} demo={demo}>
      <App usuario={usuario} />
    </ProvedorCasca>
  );
}

/** Abaixo disto o trilho some e o painel das conversas vira gaveta. */
const MOVEL = "(max-width: 899px)";
const CHAVE_PAINEL = "plumo.painel";
// Última obra aberta neste navegador: uma aba nova em "/" volta nela, não na 1ª em andamento da lista.
const CHAVE_OBRA = "plumo.obra";
const LIMITE_CONVERSAS = 30;
function useMovel() {
  return useMidia(MOVEL);
}
function lerPainel() {
  try {
    return localStorage.getItem(CHAVE_PAINEL) !== "fechado";
  } catch {
    return true;
  }
}

/** Fecha o menu ao clicar fora ou apertar Esc (devolvendo o foco ao botão que abriu); setas andam entre os itens. */
function useMenu() {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    caixa.current?.querySelector<HTMLElement>("[data-foco], [role=menuitem]")?.focus();
    const fora = (e: PointerEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false);
    document.addEventListener("pointerdown", fora, true);
    return () => document.removeEventListener("pointerdown", fora, true);
  }, [aberto]);
  const tecla = (e: React.KeyboardEvent) => {
    if (!aberto) return;
    const its = [...(caixa.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const i = its.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      setAberto(false);
      caixa.current?.querySelector<HTMLElement>("[aria-haspopup]")?.focus();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      its[(i + (e.key === "ArrowDown" ? 1 : -1) + its.length) % its.length]?.focus();
    } else if (e.key === "Tab") setAberto(false);
  };
  return { aberto, setAberto, caixa, tecla };
}

function App({ usuario }: { usuario: Usuario }) {
  const { demo, versao, cartoes, receberPropostas } = useCasca();
  const router = useRouter();
  const [obras, setObras] = useState<Obra[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sessoes, despachar] = useReducer(redutorSessoes, []);
  const [atual, setAtual] = useState<string | null>(null);
  const [tela, setTela] = useState<AbaAtiva>("conversa");
  const movel = useMovel();
  const barraCelular = useCelular();
  const [painelDesk, setPainelDesk] = useState(lerPainel);
  const [gaveta, setGaveta] = useState(false);
  const painel = useRef<HTMLElement>(null);
  const quemAbriu = useRef<HTMLElement | null>(null);
  // No desktop o painel acompanha o Agente: nas outras telas o espaço é delas (o trilho reabre e leva ao Agente).
  const painelAberto = movel ? gaveta : painelDesk && tela === "conversa";
  // Conversas mais antigas, por obra. A 1ª lista é global (as 30 mais recentes de todas as obras): tudo o que é mais
  // novo que a última dela já está aqui, então o cursor de TODAS as obras começa nessa data.
  const [cursorGlobal, setCursorGlobal] = useState<string | null>(null);
  const [maisConversas, setMaisConversas] = useState<Record<string, { antes: string | null; buscando?: boolean }>>({});

  const iniciou = useRef(false);
  useEffect(() => {
    // Uma vez só (o StrictMode do dev roda o efeito duas vezes e abriria duas conversas vazias).
    if (iniciou.current) return;
    iniciou.current = true;
    // A página inicial abre uma obra (e a conversa mais recente dela) por ?obra=&sessao=; ?tela= abre uma tela junto
    // (a obra recém-criada cai direto no Orçamento). A obra, a conversa e a tela ficam na URL (o efeito abaixo as
    // reescreve), para o recarregar voltar no mesmo lugar: abrir outra obra em silêncio leva a lançar na obra errada.
    const qs = new URLSearchParams(window.location.search);
    let ultima: string | null = null;
    try {
      ultima = localStorage.getItem(CHAVE_OBRA);
    } catch {
      // navegador sem armazenamento: vale a URL
    }
    const querObra = qs.get("obra") ?? ultima;
    const querSessao = qs.get("sessao");
    const querTela = telaDe(qs.get("tela"));
    if (querTela) setTela(querTela);
    api
      .listarObras()
      .then((os) => {
        setObras(os);
        // sem obra pedida, abre uma em andamento (a lista vem por nome, e a 1ª pode ser uma obra parada)
        const o = os.find((x) => x.id === querObra) ?? os.find((x) => x.status === "em_andamento") ?? os[0];
        if (!o) return;
        const abrirNovaEm = (obraId: string) => {
          const s = novaSessao(obraId);
          despachar({ tipo: "nova", sessao: s });
          setAtual(s.id);
        };
        if (!querSessao) abrirNovaEm(o.id);
        // Histórico das conversas: falha aqui não impede de conversar, só some a lista antiga.
        api
          .listarSessoes({ limite: LIMITE_CONVERSAS })
          .then((ss) => {
            despachar({ tipo: "listadas", sessoes: ss, obraPadrao: o.id });
            setCursorGlobal(ss.length < LIMITE_CONVERSAS ? null : ss.at(-1)!.atualizado_em);
            if (querSessao) ss.some((x) => x.id === querSessao) ? setAtual(querSessao) : abrirNovaEm(o.id);
          })
          .catch(() => querSessao && abrirNovaEm(o.id));
      })
      .catch((e) => setErro(mensagemDe(e)));
  }, []);

  // Sessão antiga aberta pela 1ª vez: busca as mensagens e o estado atual das propostas que ficaram nela.
  const carregando = useRef(new Set<string>());
  useEffect(() => {
    const s = sessoes.find((x) => x.id === atual);
    if (!s || s.carregada || s.erroCarga || !s.servidorId || carregando.current.has(s.id)) return;
    carregando.current.add(s.id);
    (async () => {
      const { mensagens, propostaIds } = formatarHistorico(await api.mensagensSessao(s.servidorId!));
      if (propostaIds.length) {
        const ps = await api.listarPropostas({ obra_id: s.obraId });
        receberPropostas(ps.filter((p) => propostaIds.includes(p.id)));
      }
      despachar({ tipo: "carregou", sessaoId: s.id, mensagens });
    })()
      .catch((e) => despachar({ tipo: "falhouCarga", sessaoId: s.id, erro: mensagemDe(e) }))
      .finally(() => carregando.current.delete(s.id));
  }, [atual, sessoes, receberPropostas]);

  // Dados e status da obra mudam pelas telas (editar, aprovar o orçamento): relê a lista a cada escrita.
  const primeiraVersao = useRef(versao);
  useEffect(() => {
    if (versao === primeiraVersao.current) return;
    api
      .listarObras()
      .then(setObras)
      .catch(() => undefined);
  }, [versao]);

  // O contador de Aprovações vem do servidor (e de quem mais aprovou), não só do que esta aba viu.
  useEffect(() => {
    api
      .listarPropostas({ status: "pendente" })
      .then(receberPropostas)
      .catch(() => undefined);
  }, [versao, receberPropostas]);

  const fecharGaveta = (devolverFoco = true) => {
    setGaveta(false);
    if (devolverFoco) quemAbriu.current?.focus({ preventScroll: true });
  };
  const alternarPainel = () => {
    if (movel) {
      if (gaveta) fecharGaveta();
      else {
        quemAbriu.current = document.activeElement as HTMLElement | null;
        setGaveta(true);
      }
      return;
    }
    if (tela !== "conversa") {
      setTela("conversa");
      if (painelDesk) return;
    }
    const novo = !painelDesk;
    setPainelDesk(novo);
    try {
      localStorage.setItem(CHAVE_PAINEL, novo ? "aberto" : "fechado");
    } catch {
      // navegador sem armazenamento: a escolha vale só nesta aba
    }
  };
  useEffect(() => {
    if (!gaveta || !movel) return;
    painel.current?.querySelector<HTMLElement>("button,a")?.focus({ preventScroll: true });
    const esc = (e: KeyboardEvent) => e.key === "Escape" && fecharGaveta();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [gaveta, movel]);

  const sessaoAberta = sessoes.find((s) => s.id === atual);
  const obraAberta = obras?.find((o) => o.id === sessaoAberta?.obraId)?.id;
  // A conversa também vai para a URL: recarregar (o portal recarrega a página ao trocar desktop ↔ celular) voltava em
  // "Nova conversa". Só a que já tem mensagem: a vazia ainda não existe no servidor e não teria como ser reaberta.
  const sessaoNaUrl = sessaoAberta && (sessaoAberta.mensagens.length || !sessaoAberta.carregada) ? sessaoAberta.servidorId : null;
  useEffect(() => {
    if (!obraAberta) return;
    const qs = new URLSearchParams({ obra: obraAberta });
    if (sessaoNaUrl) qs.set("sessao", sessaoNaUrl);
    if (tela !== "conversa") qs.set("tela", tela);
    window.history.replaceState(null, "", `${window.location.pathname}?${qs}`);
    try {
      localStorage.setItem(CHAVE_OBRA, obraAberta);
    } catch {
      // navegador sem armazenamento: vale a URL
    }
  }, [obraAberta, sessaoNaUrl, tela]);

  const pendentes = (obraId: string) => Object.values(cartoes).filter((c) => c.proposta.obra_id === obraId && c.proposta.status === "pendente").length;
  const sessao = sessoes.find((s) => s.id === atual);
  const obra = obras?.find((o) => o.id === sessao?.obraId);

  const escolherSessao = (id: string) => {
    setAtual(id);
    setTela("conversa");
    if (movel) fecharGaveta(false);
  };
  const abrirNova = (obraId: string) => {
    const s = novaSessao(obraId);
    despachar({ tipo: "nova", sessao: s });
    escolherSessao(s.id);
  };
  /** Trocar de obra mantém a tela aberta; a conversa vai para a mais recente da obra (ou uma nova). */
  const trocarObra = (obraId: string) => {
    const recente = sessoes.find((s) => s.obraId === obraId);
    if (recente) setAtual(recente.id);
    else {
      const s = novaSessao(obraId);
      despachar({ tipo: "nova", sessao: s });
      setAtual(s.id);
    }
  };

  const podeCadastrar = usuario.papel !== "viewer";
  const cursorDa = (obraId: string) => (obraId in maisConversas ? maisConversas[obraId]!.antes : cursorGlobal);
  const carregarConversas = async (obraId: string) => {
    const antes = cursorDa(obraId);
    if (!antes) return;
    setMaisConversas((m) => ({ ...m, [obraId]: { antes, buscando: true } }));
    try {
      const ss = await api.listarSessoes({ obra_id: obraId, limite: LIMITE_CONVERSAS, antes_de: antes });
      despachar({ tipo: "listadas", sessoes: ss, obraPadrao: obraId });
      setMaisConversas((m) => ({ ...m, [obraId]: { antes: ss.length < LIMITE_CONVERSAS ? null : ss.at(-1)!.atualizado_em } }));
    } catch {
      setMaisConversas((m) => ({ ...m, [obraId]: { antes } }));
    }
  };
  const conteudo = erro ? (
    <div className="aviso-erro" role="alert">
      <Icone nome="alert" tam={15} />
      Não consegui carregar as obras: {erro}
    </div>
  ) : !obras || (obras.length && !sessao) ? (
    <div className="carregando page" role="status">
      <Icone nome="loader" className="spin" tam={15} />
      {obras ? "Abrindo a conversa…" : "Carregando obras…"}
    </div>
  ) : !sessao || !obra ? (
    <div className="card vazio">
      <Icone nome="predio" tam={24} />
      <h3>Nenhuma obra ainda</h3>
      <p>Cadastre a primeira obra para começar pelo orçamento. As conversas com o agente aparecem aqui.</p>
      {podeCadastrar ? (
        <Link href="/obras/nova" className="btn amb">
          Cadastrar obra
        </Link>
      ) : null}
    </div>
  ) : null;

  return (
    <div className={`app${painelAberto ? " com-painel" : ""}`}>
      <Topo
        semAbas={barraCelular}
        obras={obras ?? []}
        obra={obra}
        tela={tela}
        setTela={setTela}
        pendentes={obra ? pendentes(obra.id) : 0}
        trocarObra={trocarObra}
        usuario={usuario}
        demo={demo}
        painelAberto={painelAberto}
        alternarPainel={alternarPainel}
        inerte={movel && gaveta}
        sair={async () => {
          await sair();
          router.replace("/entrar");
        }}
      />
      <nav className="trilho" aria-label="Atalhos">
        <Link href="/inicio" className="tr-btn" aria-label="Início" title="Início">
          <Icone nome="home" tam={18} />
        </Link>
        <button
          type="button"
          className={`tr-btn${painelAberto ? " on" : ""}`}
          aria-label={painelAberto ? "Esconder as conversas" : "Mostrar as conversas"}
          aria-expanded={painelAberto}
          aria-controls="painel-conversas"
          title="Conversas com o agente"
          onClick={alternarPainel}
        >
          <Icone nome="conversas" tam={18} />
        </button>
        <span className="tr-sep" aria-hidden="true" />
        <Link href="/conta" className="tr-btn" aria-label="Conta e créditos" title="Conta e créditos">
          <Icone nome="user" tam={18} />
        </Link>
      </nav>
      <aside className="painel" id="painel-conversas" aria-label="Conversas" ref={painel} hidden={!painelAberto} inert={!painelAberto}>
        <div className="painel-cab">
          <div>
            <div className="painel-t">Conversas</div>
            {obra ? <div className="painel-sub">{obra.nome}</div> : null}
          </div>
          <button type="button" className="tr-btn painel-x" aria-label="Fechar as conversas" onClick={() => (movel ? fecharGaveta() : alternarPainel())}>
            <Icone nome="x" tam={16} />
          </button>
        </div>
        {obra ? (
          <button type="button" className="painel-nova" onClick={() => abrirNova(obra.id)}>
            <Icone nome="plus" tam={16} />
            Nova conversa
          </button>
        ) : null}
        <div className="painel-lista">
          {sessoes
            // A conversa nova e vazia já é o botão "Nova conversa" acima: não entra na lista duas vezes.
            .filter((s) => s.obraId === obra?.id && !(s.carregada && s.mensagens.length === 0))
            .map((s) => (
              <button
                key={s.id}
                type="button"
                className={`painel-sess${s.id === atual ? (tela === "conversa" ? " on" : " atual") : ""}`}
                aria-current={s.id === atual ? "true" : undefined}
                title={s.titulo}
                onClick={() => escolherSessao(s.id)}
              >
                <Icone nome="message" tam={14} />
                <span className="sess-t">{s.titulo}</span>
              </button>
            ))}
          {obra && cursorDa(obra.id) ? (
            <button
              type="button"
              className="painel-mais"
              disabled={maisConversas[obra.id]?.buscando}
              aria-busy={maisConversas[obra.id]?.buscando}
              onClick={() => carregarConversas(obra.id)}
            >
              {maisConversas[obra.id]?.buscando ? <Icone nome="loader" className="spin" tam={14} /> : null}
              Conversas mais antigas
            </button>
          ) : null}
        </div>
        {movel ? (
          <div className="painel-pe">
            <Link href="/inicio" className="painel-link">
              <Icone nome="home" tam={16} />
              Início
            </Link>
            {podeCadastrar ? (
              <Link href="/obras/nova" className="painel-link">
                <Icone nome="predio" tam={16} />
                Nova obra
              </Link>
            ) : null}
            <Link href="/conta" className="painel-link">
              <Icone nome="user" tam={16} />
              Conta e créditos
            </Link>
          </div>
        ) : null}
        {demo ? (
          <div className="fict" role="note">
            <Icone nome="info" tam={14} />
            <span>Modo de demonstração: dados fictícios, em memória. Nada vai para a API.</span>
          </div>
        ) : null}
      </aside>
      {movel ? <div className="gaveta-fundo" aria-hidden="true" hidden={!gaveta} onClick={() => fecharGaveta()} /> : null}

      <main className="palco" inert={movel && gaveta}>
        {conteudo ??
          (sessao && obra ? (
            <>
              {/* escondida, não desmontada: o texto digitado e o "Parar" sobrevivem à troca de tela */}
              <section className="palco-conversa" id="painel-conversa" aria-label="Conversa com o agente" hidden={tela !== "conversa"}>
                <div className="conversa-cab">
                  <h1 className="conversa-t" title={sessao.titulo}>
                    {sessao.titulo}
                  </h1>
                  <button type="button" className="btn sm so-movel" onClick={alternarPainel}>
                    <Icone nome="conversas" tam={15} />
                    Conversas
                  </button>
                </div>
                <Conversa key={sessao.id} sessao={sessao} obra={obra} despachar={despachar} />
              </section>
              {tela !== "conversa" ? (
                // key pela obra: trocar de obra remonta a tela. Sem isso o estado de A (o rascunho do editor do
                // cronograma, por exemplo) ficava montado com a obra B, e "Salvar" gravava o de A em B.
                <section key={obra.id} className="palco-tela" aria-label={NAV.find((n) => n.k === tela)!.rotulo}>
                  {tela === "orcamento" ? (
                    <Orcamento obra={obra} />
                  ) : tela === "cronograma" ? (
                    <Cronograma obra={obra} />
                  ) : tela === "suprimentos" ? (
                    <Suprimentos obra={obra} />
                  ) : tela === "historico" ? (
                    <Historico obra={obra} />
                  ) : (
                    <Aprovacoes obra={obra} obras={obras ?? []} />
                  )}
                </section>
              ) : null}
            </>
          ) : null)}
      </main>
      {obra && !conteudo && barraCelular ? <BarraInferior tela={tela} setTela={setTela} pendentes={pendentes(obra.id)} inerte={movel && gaveta} /> : null}
    </div>
  );
}

/** No celular (≤ 760 px) a navegação vai para uma barra fixa embaixo: os cinco destinos do dia a dia, o resto no Mais. */
const BARRA: { k: AbaAtiva; rotulo: string; icone: NomeIcone }[] = [
  { k: "conversa", rotulo: "Agente", icone: "message" },
  { k: "orcamento", rotulo: "Orçamento", icone: "calc" },
  { k: "cronograma", rotulo: "Cronograma", icone: "calendario" },
  { k: "suprimentos", rotulo: "Compras", icone: "package" },
];

function BarraInferior(p: { tela: AbaAtiva; setTela: (t: AbaAtiva) => void; pendentes: number; inerte: boolean }) {
  const [mais, setMais] = useState(false);
  // Trocou de tela (pela folha ou por fora dela): a folha fecha, nunca fica cobrindo a tela nova.
  useEffect(() => setMais(false), [p.tela]);
  // Com o texto maior (o portal impõe tamanho mínimo de fonte), os rótulos não cabem: aí só os ícones (o nome fica no
  // aria-label) e o rótulo apenas no item ativo.
  const barra = useRef<HTMLElement>(null);
  const [compacta, setCompacta] = useState(false);
  useEffect(() => {
    const el = barra.current;
    if (!el) return;
    const medir = () => {
      el.classList.remove("compacta");
      const sobra = [...el.querySelectorAll<HTMLElement>(".bi-rot")].some((r) => r.scrollWidth > r.clientWidth + 1);
      setCompacta(sobra);
      if (sobra) el.classList.add("compacta");
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const noMais = p.tela === "aprovacoes" || p.tela === "historico";
  return (
    <>
      <nav ref={barra} className={`barra-inf${compacta ? " compacta" : ""}`} aria-label="Telas da obra" inert={p.inerte}>
        {BARRA.map((n) => (
          <button
            key={n.k}
            type="button"
            className={`bi-item${p.tela === n.k ? " on" : ""}`}
            aria-current={p.tela === n.k ? "page" : undefined}
            aria-label={n.rotulo}
            onClick={() => p.setTela(n.k)}
          >
            <Icone nome={n.icone} tam={20} />
            <span className="bi-rot" aria-hidden="true">
              {n.rotulo}
            </span>
          </button>
        ))}
        <button
          type="button"
          className={`bi-item${noMais ? " on" : ""}`}
          aria-haspopup="dialog"
          aria-expanded={mais}
          aria-label={p.pendentes ? `Mais (${p.pendentes} aprovações pendentes)` : "Mais"}
          onClick={() => setMais(true)}
        >
          <Icone nome="more" tam={20} />
          {p.pendentes ? <span className="bi-n" aria-hidden="true">{p.pendentes}</span> : null}
          <span className="bi-rot" aria-hidden="true">
            Mais
          </span>
        </button>
      </nav>
      {mais ? (
        <FolhaMais
          fechar={() => setMais(false)}
          pendentes={p.pendentes}
          ir={(t) => {
            setMais(false);
            p.setTela(t);
          }}
        />
      ) : null}
    </>
  );
}

/** A folha do Mais: Aprovações (com o contador), Histórico, Conta e Tema. Esc ou toque fora fecham. */
function FolhaMais({ fechar, pendentes, ir }: { fechar: () => void; pendentes: number; ir: (t: AbaAtiva) => void }) {
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    caixa.current?.querySelector<HTMLElement>("button,a")?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
    };
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("keydown", tecla);
      antes?.focus?.();
    };
  }, [fechar]);
  return (
    <div className="folha-fundo" onClick={(e) => e.target === e.currentTarget && fechar()}>
      <div className="folha" role="dialog" aria-modal="true" aria-label="Mais" ref={caixa}>
        <span className="folha-alca" aria-hidden="true" />
        <button type="button" className="folha-item" onClick={() => ir("aprovacoes")}>
          <Icone nome="checkCircle" tam={18} />
          <span>Aprovações</span>
          {pendentes ? <span className="n">{pendentes}</span> : null}
        </button>
        <button type="button" className="folha-item" onClick={() => ir("historico")}>
          <Icone nome="history" tam={18} />
          <span>Histórico</span>
        </button>
        <Link href="/conta" className="folha-item">
          <Icone nome="user" tam={18} />
          <span>Conta</span>
        </Link>
        <ItemTema />
      </div>
    </div>
  );
}

function ItemTema() {
  const tema = useTema();
  const outro = tema === "escuro" ? "claro" : "escuro";
  return (
    <button type="button" className="folha-item" onClick={() => trocarTema(outro)}>
      <Icone nome={tema === "escuro" ? "sol" : "lua"} tam={18} />
      <span>Tema {outro}</span>
    </button>
  );
}

function Topo(p: {
  semAbas?: boolean;
  obras: Obra[];
  obra: Obra | undefined;
  tela: AbaAtiva;
  setTela: (t: AbaAtiva) => void;
  pendentes: number;
  trocarObra: (id: string) => void;
  usuario: Usuario;
  demo: boolean;
  painelAberto: boolean;
  alternarPainel: () => void;
  inerte: boolean;
  sair: () => void;
}) {
  const { obra, tela } = p;
  const nav = useRef<HTMLDivElement>(null);
  // No celular as pílulas rolam: a escolhida não pode ficar fora da tela.
  useEffect(() => {
    nav.current?.querySelector<HTMLElement>("[aria-current=page]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tela]);
  return (
    <header className="topo" inert={p.inerte}>
      <Link href="/inicio" className="topo-marca" aria-label="Plumo, início">
        <Logo />
        <span className="topo-marca-t">Plumo</span>
        {p.demo ? <span className="tag">demo</span> : null}
      </Link>
      {obra ? <SeletorObra obras={p.obras} obra={obra} trocar={p.trocarObra} /> : null}
      {obra && !p.semAbas ? (
        <nav className="topo-nav" ref={nav} aria-label="Telas da obra">
          {NAV.map((n) => (
            <button
              key={n.k}
              type="button"
              className={`pilula${tela === n.k ? " on" : ""}`}
              aria-current={tela === n.k ? "page" : undefined}
              onClick={() => p.setTela(n.k)}
            >
              {n.rotulo}
              {n.k === "aprovacoes" && p.pendentes ? (
                <span className="n" aria-label={`${p.pendentes} pendentes`}>
                  {p.pendentes}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
      ) : obra ? null : (
        <span className="sp" />
      )}
      <div className="topo-dir">
        <Perfil usuario={p.usuario} sair={p.sair} />
      </div>
    </header>
  );
}

function SeletorObra({ obras, obra, trocar }: { obras: Obra[]; obra: Obra; trocar: (id: string) => void }) {
  const { aberto, setAberto, caixa, tecla } = useMenu();
  const { podeOperar } = useCasca();
  // Os dados da obra (tipo, área, padrão, contrato, BDI, data-base…) moram aqui: o card que repetia isso no Orçamento saiu.
  const [dados, setDados] = useState(false);
  const [busca, setBusca] = useState("");
  const q = busca
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  const lista = q
    ? obras.filter((o) =>
        o.nome
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .includes(q),
      )
    : obras;
  useEffect(() => {
    if (!aberto) setBusca("");
  }, [aberto]);
  return (
    <div className="seletor" ref={caixa} onKeyDown={tecla}>
      <button
        type="button"
        className="seletor-bt"
        aria-haspopup="menu"
        aria-expanded={aberto}
        title={`${obra.nome} · ${TXT_STATUS[obra.status]}`}
        onClick={() => setAberto((a) => !a)}
      >
        <span className="dot" style={{ background: COR_STATUS[obra.status] }} aria-hidden="true" />
        <span className="seletor-t">
          <span className="seletor-nome">{obra.nome}</span>
          <span className="seletor-st">{TXT_STATUS[obra.status]}</span>
        </span>
        <Icone nome="chevDown" tam={14} />
      </button>
      {aberto ? (
        <div className="ca-menu-pop seletor-pop" role="menu" aria-label="Trocar de obra">
          {obras.length > 6 ? (
            <label className="busca seletor-busca">
              <Icone nome="busca" tam={15} />
              <span className="sr-only">Buscar obra</span>
              <input
                data-foco
                type="search"
                placeholder="Buscar obra"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => {
                  // ↓ sai da busca para a lista; Enter com um resultado só já troca
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    e.stopPropagation(); // senão o menu também anda e pula o 1º item
                    caixa.current?.querySelector<HTMLElement>(".seletor-lista [role=menuitem]")?.focus();
                  } else if (e.key === "Enter" && lista.length === 1) {
                    setAberto(false);
                    trocar(lista[0]!.id);
                  }
                }}
              />
            </label>
          ) : null}
          <div className="seletor-lista">
            {lista.length ? null : <div className="seletor-vazio">Nenhuma obra com «{busca.trim()}».</div>}
            {lista.map((o) => (
              <button
                key={o.id}
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-current={o.id === obra.id ? "true" : undefined}
                onClick={() => {
                  setAberto(false);
                  trocar(o.id);
                }}
              >
                <span className="dot" style={{ background: COR_STATUS[o.status] }} aria-hidden="true" />
                <span className="seletor-pop-n">{o.nome}</span>
                <span className="seletor-pop-st">{TXT_STATUS[o.status]}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="seletor-nova"
            onClick={() => {
              setAberto(false);
              setDados(true);
            }}
          >
            <Icone nome="predio" tam={15} />
            Dados desta obra
          </button>
          {podeOperar ? (
            <Link href="/obras/nova" role="menuitem" tabIndex={-1}>
              <Icone nome="plus" tam={15} />
              Nova obra
            </Link>
          ) : null}
        </div>
      ) : null}
      {dados ? <ModalDadosObra obra={obra} fechar={() => setDados(false)} leitura={!podeOperar} /> : null}
    </div>
  );
}

/** O tema saiu do trilho e do topo: no desktop fica no menu do avatar (no celular, no Mais). */
function ItemTemaMenu() {
  const tema = useTema();
  const outro = tema === "escuro" ? "claro" : "escuro";
  return (
    <button type="button" role="menuitem" tabIndex={-1} onClick={() => trocarTema(outro)}>
      <Icone nome={tema === "escuro" ? "sol" : "lua"} tam={15} />
      Tema {outro}
    </button>
  );
}

function Perfil({ usuario, sair }: { usuario: Usuario; sair: () => void }) {
  const { aberto, setAberto, caixa, tecla } = useMenu();
  const PAPEL = { viewer: "leitura", admin: "admin", master: "master" } as const;
  return (
    <div className="perfil" ref={caixa} onKeyDown={tecla}>
      <button
        type="button"
        className="av-bt"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={`${usuario.nome}, ${PAPEL[usuario.papel]}`}
        onClick={() => setAberto((a) => !a)}
      >
        <span className="av" aria-hidden="true">
          {iniciais(usuario.nome)}
        </span>
      </button>
      {aberto ? (
        <div className="ca-menu-pop perfil-pop" role="menu" aria-label="Conta">
          <div className="pop-sec" aria-hidden="true">
            {usuario.nome} · {PAPEL[usuario.papel]}
          </div>
          <Link href="/conta" role="menuitem" tabIndex={-1}>
            <Icone nome="user" tam={15} />
            Conta e créditos
          </Link>
          <ItemTemaMenu />
          <button type="button" role="menuitem" tabIndex={-1} onClick={sair}>
            <Icone nome="logout" tam={15} />
            Sair
          </button>
        </div>
      ) : null}
    </div>
  );
}
