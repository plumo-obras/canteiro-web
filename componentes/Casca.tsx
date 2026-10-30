"use client";
/**
 * A casca do app, como no protótipo: lateral só com conversas (agrupadas por obra), topo da sessão com as abas
 * (Conversa + as telas que você abre) e o "+" como único menu para abrir telas. Uma coisa por vez na área principal.
 */
import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Obra, Usuario } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { formatarHistorico } from "@/lib/historico";
import { assinarSessao, renovar, sair, usuarioAtual } from "@/lib/sessao";
import { Almoxarifado } from "./Almoxarifado";
import { Aprovacoes } from "./Aprovacoes";
import { ProvedorCasca, mensagemDe, useCasca } from "./contexto";
import { Conversa } from "./Conversa";
import { Icone, Logo, type NomeIcone } from "./Icone";
import { Pedidos } from "./Pedidos";
import { novaSessao, redutorSessoes, type AbaAtiva, type Sessao, type Tela } from "./sessoes";

const TELAS: { k: Tela; rotulo: string; icone: NomeIcone }[] = [
  { k: "almoxarifado", rotulo: "Almoxarifado", icone: "package" },
  { k: "pedidos", rotulo: "Pedidos", icone: "cart" },
  { k: "aprovacoes", rotulo: "Aprovações", icone: "checkCircle" },
];
const rotuloTela = (k: Tela) => TELAS.find((t) => t.k === k)!.rotulo;

const COR_STATUS: Record<Obra["status"], string> = { em_andamento: "var(--green)", em_orcamento: "#8a938f", concluida: "var(--blue)" };
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
  const router = useRouter();
  const usuario = useSyncExternalStore(assinarSessao, usuarioAtual, () => null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    let vivo = true;
    (usuarioAtual() ? Promise.resolve(true) : renovar()).then((ok) => {
      if (!vivo) return;
      if (ok) setPronto(true);
      else router.replace("/entrar");
    });
    return () => {
      vivo = false;
    };
  }, [router]);

  // Sessão caiu no meio do uso (renovação recusada): volta ao login.
  useEffect(() => {
    if (pronto && !usuario) router.replace("/entrar");
  }, [pronto, usuario, router]);

  if (!pronto || !usuario) {
    return (
      <div className="abrindo" role="status">
        Abrindo o Canteiro…
      </div>
    );
  }
  return (
    <ProvedorCasca usuario={usuario} demo={demo}>
      <App usuario={usuario} />
    </ProvedorCasca>
  );
}

/** Abaixo disto a lateral vira gaveta; acima, coluna fixa que recolhe num trilho. */
const MOVEL = "(max-width: 899px)";
const CHAVE_LATERAL = "canteiro.lateral";
function useMovel() {
  return useSyncExternalStore(
    (avisar) => {
      if (typeof matchMedia !== "function") return () => undefined;
      const m = matchMedia(MOVEL);
      m.addEventListener("change", avisar);
      return () => m.removeEventListener("change", avisar);
    },
    () => typeof matchMedia === "function" && matchMedia(MOVEL).matches,
    () => false,
  );
}
function lerRecolhida() {
  try {
    return localStorage.getItem(CHAVE_LATERAL) === "fechada";
  } catch {
    return false;
  }
}

function App({ usuario }: { usuario: Usuario }) {
  const { demo, versao, cartoes, receberPropostas } = useCasca();
  const router = useRouter();
  const [obras, setObras] = useState<Obra[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sessoes, despachar] = useReducer(redutorSessoes, []);
  const [atual, setAtual] = useState<string | null>(null);
  const [gruposAbertos, setGrupos] = useState<Record<string, boolean>>({});
  const movel = useMovel();
  const [recolhida, setRecolhida] = useState(lerRecolhida);
  const [gaveta, setGaveta] = useState(false);
  const lateral = useRef<HTMLElement>(null);
  const quemAbriu = useRef<HTMLElement | null>(null);
  const trilho = recolhida && !movel;
  const gavetaAberta = gaveta && movel;

  const iniciou = useRef(false);
  useEffect(() => {
    // Uma vez só (o StrictMode do dev roda o efeito duas vezes e abriria duas conversas vazias).
    if (iniciou.current) return;
    iniciou.current = true;
    // A página inicial abre uma obra (e a conversa mais recente dela) por ?obra=&sessao=; a URL volta limpa.
    const qs = new URLSearchParams(window.location.search);
    const querObra = qs.get("obra");
    const querSessao = qs.get("sessao");
    if (querObra || querSessao) window.history.replaceState(null, "", window.location.pathname);
    api
      .listarObras()
      .then((os) => {
        setObras(os);
        const o = os.find((x) => x.id === querObra) ?? os[0];
        if (!o) return;
        const abrirNovaEm = (obraId: string) => {
          const s = novaSessao(obraId);
          despachar({ tipo: "nova", sessao: s });
          setAtual(s.id);
        };
        if (!querSessao) abrirNovaEm(o.id);
        // Histórico na lateral: falha aqui não impede de conversar, só some a lista antiga.
        api
          .listarSessoes()
          .then((ss) => {
            despachar({ tipo: "listadas", sessoes: ss, obraPadrao: o.id });
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

  // O contador de Aprovações vem do servidor (e de quem mais aprovou), não só do que esta aba viu.
  useEffect(() => {
    api.listarPropostas({ status: "pendente" }).then(receberPropostas).catch(() => undefined);
  }, [versao, receberPropostas]);

  const recolher = (on: boolean) => {
    setRecolhida(on);
    try {
      localStorage.setItem(CHAVE_LATERAL, on ? "fechada" : "aberta");
    } catch {
      // navegador sem armazenamento: a escolha vale só nesta aba
    }
  };
  // Ctrl/⌘ + \ recolhe e abre, como no protótipo; no celular a gaveta tem o próprio botão.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "\\" && !movel) {
        e.preventDefault();
        recolher(!recolhida);
      }
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [movel, recolhida]);
  // Depois de recolher ou abrir, o foco segue para o botão que desfaz (quem usa teclado não fica perdido no body).
  const trocouLateral = useRef(false);
  useEffect(() => {
    if (!trocouLateral.current) {
      trocouLateral.current = true;
      return;
    }
    if (!movel) lateral.current?.querySelector<HTMLElement>("[data-alterna-lateral]")?.focus({ preventScroll: true });
  }, [recolhida, movel]);

  const abrirGaveta = () => {
    quemAbriu.current = document.activeElement as HTMLElement | null;
    setGaveta(true);
  };
  const fecharGaveta = (devolverFoco = true) => {
    setGaveta(false);
    if (devolverFoco) quemAbriu.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!gavetaAberta) return;
    lateral.current?.querySelector<HTMLElement>("button,a")?.focus({ preventScroll: true });
    const esc = (e: KeyboardEvent) => e.key === "Escape" && fecharGaveta();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [gavetaAberta]);

  const pendentes = (obraId: string) => Object.values(cartoes).filter((c) => c.proposta.obra_id === obraId && c.proposta.status === "pendente").length;
  const sessao = sessoes.find((s) => s.id === atual);
  const obra = obras?.find((o) => o.id === sessao?.obraId);

  const escolher = (id: string) => {
    setAtual(id);
    if (movel) fecharGaveta(false);
  };
  const abrirNova = (obraId: string) => {
    const s = novaSessao(obraId);
    despachar({ tipo: "nova", sessao: s });
    escolher(s.id);
  };
  const botaoGaveta = <BotaoGaveta aberta={gavetaAberta} abrir={abrirGaveta} />;
  // Sem sessão aberta: no celular ainda precisa de um topo com o botão da gaveta.
  const topoSimples = (
    <header className="ses-top topo-simples so-movel">
      <div className="ses-tit">
        {botaoGaveta}
        <h1>Canteiro</h1>
      </div>
    </header>
  );

  return (
    <div className={`app${trilho ? " lat-fechada" : ""}${gavetaAberta ? " gaveta-aberta" : ""}`}>
      <aside className="side" id="lateral" aria-label="Conversas" ref={lateral} inert={movel && !gaveta}>
        {trilho ? (
          <Trilho obras={obras ?? []} sessoes={sessoes} obraAtual={obra?.id} pendentes={pendentes} escolher={escolher} abrirNova={abrirNova} abrir={() => recolher(false)} />
        ) : (
          <>
            <div className="brand">
              <Logo />
              Canteiro
              {demo ? (
                <span className="tag" title="Modo de demonstração">
                  demo
                </span>
              ) : null}
              {movel ? (
                <button type="button" className="side-fechar" aria-label="Fechar a lateral" onClick={() => fecharGaveta()}>
                  <Icone nome="x" tam={18} />
                </button>
              ) : (
                <button
                  type="button"
                  className="side-fechar"
                  data-alterna-lateral
                  aria-label="Recolher a lateral"
                  aria-expanded="true"
                  aria-controls="lateral"
                  aria-keyshortcuts="Control+Backslash"
                  title="Recolher a lateral (Ctrl+\)"
                  onClick={() => recolher(true)}
                >
                  <Icone nome="painel" tam={17} />
                </button>
              )}
            </div>
            <Link href="/inicio" className="nav side-link">
              <Icone nome="home" tam={16} />
              Início
            </Link>
            {obras?.[0] ? (
              <button type="button" className="side-nova" onClick={() => abrirNova(obra?.id ?? obras[0]!.id)}>
                <Icone nome="plus" tam={16} />
                Nova conversa
              </button>
            ) : null}
            {(obras ?? []).map((o) => {
              const ss = sessoes.filter((s) => s.obraId === o.id);
              const aberto = gruposAbertos[o.id] ?? (sessao?.obraId === o.id || (obras?.length ?? 0) === 1);
              const n = pendentes(o.id);
              return (
                <div key={o.id}>
                  <button type="button" className="grp" aria-expanded={aberto} aria-controls={`grp-${o.id}`} onClick={() => setGrupos((g) => ({ ...g, [o.id]: !aberto }))}>
                    <Icone nome="chevRight" tam={14} className="grp-chev" />
                    <span className="dot" style={{ background: COR_STATUS[o.status] }} aria-hidden="true" />
                    <span className="sess-t">{o.nome}</span>
                    {n ? (
                      <span className="count" aria-label={`${n} esperando aprovação`}>
                        {n}
                      </span>
                    ) : null}
                  </button>
                  <div className="grp-l" id={`grp-${o.id}`} hidden={!aberto}>
                    {ss.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`nav sess${s.id === atual ? " on" : ""}`}
                        aria-current={s.id === atual ? "page" : undefined}
                        title={s.titulo}
                        onClick={() => escolher(s.id)}
                      >
                        <span className="sess-t">{s.titulo}</span>
                      </button>
                    ))}
                    <button type="button" className="nav sess sess-nova" onClick={() => abrirNova(o.id)}>
                      <span className="sess-t">+ Nova conversa nesta obra</span>
                    </button>
                  </div>
                </div>
              );
            })}
            {demo ? (
              <div className="fict" role="note">
                <Icone nome="info" tam={14} />
                <span>Modo de demonstração: dados fictícios da Casa Vila Nova, em memória. Nada vai para a API.</span>
              </div>
            ) : null}
            <div className="side-pe">
              <Link href="/conta" className="nav side-link">
                <Icone nome="user" tam={16} />
                Conta e créditos
              </Link>
              <Perfil
                usuario={usuario}
                sair={async () => {
                  await sair();
                  router.replace("/entrar");
                }}
              />
            </div>
          </>
        )}
      </aside>
      {movel ? <div className="gaveta-fundo" aria-hidden="true" hidden={!gaveta} onClick={() => fecharGaveta()} /> : null}

      {erro ? (
        <>
          {topoSimples}
          <main className="main cheia" inert={gavetaAberta}>
            <div className="page">
              <div className="aviso-erro" role="alert">
                <Icone nome="alert" tam={15} />
                Não consegui carregar as obras: {erro}
              </div>
            </div>
          </main>
        </>
      ) : !obras || (obras.length && !sessao) ? (
        <>
          {topoSimples}
          <main className="main cheia" inert={gavetaAberta}>
            <div className="carregando page" role="status">
              <Icone nome="loader" className="spin" tam={15} />
              {obras ? "Abrindo a conversa…" : "Carregando obras…"}
            </div>
          </main>
        </>
      ) : !sessao || !obra ? (
        <>
          {topoSimples}
          <main className="main cheia" inert={gavetaAberta}>
            <div className="card vazio">
              <Icone nome="info" tam={24} />
              <h3>Nenhuma obra ainda</h3>
              <p>Quando a primeira obra for cadastrada, as conversas aparecem aqui.</p>
            </div>
          </main>
        </>
      ) : (
        <SessaoAberta sessao={sessao} obra={obra} despachar={despachar} pendentes={pendentes(obra.id)} botaoGaveta={botaoGaveta} inerte={gavetaAberta} />
      )}
    </div>
  );
}

function BotaoGaveta({ aberta, abrir }: { aberta: boolean; abrir: () => void }) {
  return (
    <button type="button" className="bt-gaveta so-movel" aria-label="Abrir a lateral" aria-expanded={aberta} aria-controls="lateral" onClick={abrir}>
      <Icone nome="menu" tam={20} />
    </button>
  );
}

/** Lateral recolhida (desktop): trilho de 64 px que mantém o que pede atenção, o status e o contador de cada obra. */
function Trilho({
  obras,
  sessoes,
  obraAtual,
  pendentes,
  escolher,
  abrirNova,
  abrir,
}: {
  obras: Obra[];
  sessoes: Sessao[];
  obraAtual: string | undefined;
  pendentes: (obraId: string) => number;
  escolher: (id: string) => void;
  abrirNova: (obraId: string) => void;
  abrir: () => void;
}) {
  return (
    <>
      <button type="button" className="r-btn r-logo" aria-label="Abrir a lateral" title="Abrir a lateral (Ctrl+\)" onClick={abrir}>
        <Logo />
      </button>
      <Link href="/inicio" className="r-btn" aria-label="Início" title="Início">
        <Icone nome="home" tam={18} />
      </Link>
      {obras[0] ? (
        <button type="button" className="r-btn" aria-label="Nova conversa" title="Nova conversa" onClick={() => abrirNova(obraAtual ?? obras[0]!.id)}>
          <Icone nome="plus" tam={18} />
        </button>
      ) : null}
      <span className="r-sep" aria-hidden="true" />
      {obras.map((o) => {
        const n = pendentes(o.id);
        const recente = sessoes.find((s) => s.obraId === o.id);
        const rotulo = `${o.nome} · ${TXT_STATUS[o.status]}${n ? ` · ${n} esperando aprovação` : ""}`;
        return (
          <button
            key={o.id}
            type="button"
            className={`r-btn${o.id === obraAtual ? " on" : ""}`}
            aria-label={rotulo}
            aria-current={o.id === obraAtual ? "true" : undefined}
            title={rotulo}
            onClick={() => (recente ? escolher(recente.id) : abrirNova(o.id))}
          >
            <span className="r-ini" aria-hidden="true">
              {iniciais(o.nome)}
            </span>
            <span className="r-dot" style={{ background: COR_STATUS[o.status] }} aria-hidden="true" />
            {n ? (
              <span className="r-n" aria-hidden="true">
                {n}
              </span>
            ) : null}
          </button>
        );
      })}
      <span className="sp" />
      <Link href="/conta" className="r-btn" aria-label="Conta e créditos" title="Conta e créditos">
        <Icone nome="user" tam={18} />
      </Link>
      <button
        type="button"
        className="r-btn"
        data-alterna-lateral
        aria-label="Abrir a lateral"
        aria-expanded="false"
        aria-controls="lateral"
        title="Abrir a lateral (Ctrl+\)"
        onClick={abrir}
      >
        <Icone nome="painel" tam={18} />
      </button>
    </>
  );
}

function Perfil({ usuario, sair }: { usuario: Usuario; sair: () => void }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false);
    document.addEventListener("pointerdown", fora, true);
    return () => document.removeEventListener("pointerdown", fora, true);
  }, [aberto]);
  const PAPEL = { viewer: "leitura", admin: "admin", master: "master" } as const;
  return (
    <div className="perfil" ref={caixa} onKeyDown={(e) => e.key === "Escape" && setAberto(false)}>
      {aberto ? (
        <div className="ca-menu-pop perfil-pop" role="menu" aria-label="Conta">
          <button type="button" role="menuitem" onClick={sair} autoFocus>
            <Icone nome="logout" tam={15} />
            Sair
          </button>
        </div>
      ) : null}
      <button type="button" className="foot" aria-haspopup="menu" aria-expanded={aberto} onClick={() => setAberto((a) => !a)}>
        <span className="av" aria-hidden="true">
          {iniciais(usuario.nome)}
        </span>
        <span className="foot-t">
          {usuario.nome}
          <span>{PAPEL[usuario.papel]}</span>
        </span>
        <Icone nome="chevDown" tam={14} />
      </button>
    </div>
  );
}

function SessaoAberta({
  sessao,
  obra,
  despachar,
  pendentes,
  botaoGaveta,
  inerte,
}: {
  sessao: Sessao;
  obra: Obra;
  despachar: React.Dispatch<Parameters<typeof redutorSessoes>[1]>;
  pendentes: number;
  botaoGaveta: React.ReactNode;
  inerte: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const abas = useRef<HTMLDivElement>(null);
  const botaoMais = useRef<HTMLButtonElement>(null);
  const popMais = useRef<HTMLDivElement>(null);
  const ativa = sessao.ativa;
  const ativar = (aba: AbaAtiva) => despachar({ tipo: "ativar", sessaoId: sessao.id, aba });
  const fechar = (t: Tela) => despachar({ tipo: "fecharTela", sessaoId: sessao.id, tela: t });

  useEffect(() => {
    if (!menu) return;
    popMais.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    const fora = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!popMais.current?.contains(t) && !botaoMais.current?.contains(t)) setMenu(false);
    };
    document.addEventListener("pointerdown", fora, true);
    return () => document.removeEventListener("pointerdown", fora, true);
  }, [menu]);

  // No celular as abas rolam na horizontal: a aba que acabou de abrir não pode ficar escondida fora da tela.
  useEffect(() => {
    abas.current?.querySelector<HTMLElement>("[aria-selected=true]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [ativa, sessao.abas.length]);

  // ← → entre as abas, Home/End; Delete fecha a aba de tela focada (a Conversa não fecha).
  const teclaAbas = (e: React.KeyboardEvent) => {
    const bs = [...(abas.current?.querySelectorAll<HTMLButtonElement>("[role=tab]") ?? [])];
    const i = bs.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const ir = (j: number) => {
      e.preventDefault();
      const b = bs[(j + bs.length) % bs.length]!;
      b.focus();
      b.click();
    };
    if (e.key === "ArrowRight") ir(i + 1);
    else if (e.key === "ArrowLeft") ir(i - 1);
    else if (e.key === "Home") ir(0);
    else if (e.key === "End") ir(bs.length - 1);
    else if ((e.key === "Delete" || e.key === "Backspace") && bs[i]!.dataset.k !== "conversa") {
      e.preventDefault();
      fechar(bs[i]!.dataset.k as Tela);
      bs[i - 1]?.focus();
    }
  };
  const teclaMenu = (e: React.KeyboardEvent) => {
    const its = [...(popMais.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];
    const i = its.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") {
      e.preventDefault();
      setMenu(false);
      botaoMais.current?.focus();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      its[(i + (e.key === "ArrowDown" ? 1 : -1) + its.length) % its.length]?.focus();
    } else if (e.key === "Tab") setMenu(false);
  };

  return (
    <>
      <header className="ses-top" inert={inerte}>
        <div className="ses-tit">
          {botaoGaveta}
          <h1 title={`${obra.nome} · ${sessao.titulo}`}>
            <span className="dot" style={{ background: COR_STATUS[obra.status] }} aria-hidden="true" />
            <span className="ses-obra">{obra.nome}</span>
            <span className="sepr" aria-hidden="true">
              ·
            </span>
            <span className="ses-nome">{sessao.titulo}</span>
          </h1>
          {/* No celular o título mostra só a sessão; a obra desce para esta linha. */}
          <span className="ses-st">
            <span className="so-movel">{obra.nome} · </span>
            {TXT_STATUS[obra.status]}
          </span>
        </div>
        <div className="abas-linha">
          <div className="abas" role="tablist" aria-label="Abas da sessão" ref={abas} onKeyDown={teclaAbas}>
            <button
              type="button"
              role="tab"
              className={`aba${ativa === "conversa" ? " on" : ""}`}
              data-k="conversa"
              aria-selected={ativa === "conversa"}
              aria-controls="painel-conversa"
              tabIndex={ativa === "conversa" ? 0 : -1}
              onClick={() => ativar("conversa")}
            >
              <Icone nome="message" tam={15} />
              Conversa
            </button>
            {sessao.abas.map((t) => {
              const def = TELAS.find((x) => x.k === t)!;
              const on = ativa === t;
              return (
                <span key={t} className={`aba-c${on ? " on" : ""}`}>
                  <button
                    type="button"
                    role="tab"
                    className={`aba${on ? " on" : ""}`}
                    data-k={t}
                    aria-selected={on}
                    aria-controls="painel-tela"
                    tabIndex={on ? 0 : -1}
                    aria-keyshortcuts="Delete"
                    onClick={() => ativar(t)}
                  >
                    <Icone nome={def.icone} tam={15} />
                    {def.rotulo}
                    {t === "aprovacoes" && pendentes ? (
                      <span className="n" aria-label={`${pendentes} pendentes`}>
                        {pendentes}
                      </span>
                    ) : null}
                  </button>
                  <button type="button" className="aba-x" tabIndex={-1} aria-label={`Fechar ${def.rotulo}`} title="Fechar" onClick={() => fechar(t)}>
                    <Icone nome="x" tam={13} />
                  </button>
                </span>
              );
            })}
          </div>
          <span className="abas-mais">
            <button
              ref={botaoMais}
              type="button"
              className="aba-add"
              aria-haspopup="menu"
              aria-expanded={menu}
              aria-label="Abrir uma tela nesta sessão"
              title="Abrir uma tela"
              onClick={() => setMenu((m) => !m)}
            >
              <Icone nome="plus" tam={16} />
            </button>
            {menu ? (
              <div className="ca-menu-pop abas-pop" role="menu" aria-label="Abrir uma tela" ref={popMais} onKeyDown={teclaMenu}>
                <div className="pop-sec" aria-hidden="true">
                  {obra.nome}
                </div>
                {TELAS.map((t) => (
                  <button
                    key={t.k}
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    onClick={() => {
                      setMenu(false);
                      despachar({ tipo: "abrirTela", sessaoId: sessao.id, tela: t.k });
                    }}
                  >
                    <Icone nome={t.icone} tam={15} />
                    <span>{t.rotulo}</span>
                    {t.k === "aprovacoes" && pendentes ? (
                      <span className="n" aria-label={`${pendentes} pendentes`}>
                        {pendentes}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </span>
        </div>
      </header>
      {/* A conversa fica montada (escondida) enquanto uma tela está aberta: o texto digitado e o "Parar" não se perdem. */}
      <main className="main ca" id="painel-conversa" role="tabpanel" aria-label="Conversa" hidden={ativa !== "conversa"} inert={inerte}>
        <Conversa key={sessao.id} sessao={sessao} obra={obra} despachar={despachar} />
      </main>
      {ativa !== "conversa" ? (
        <section className="visao" id="painel-tela" role="tabpanel" aria-label={rotuloTela(ativa)} inert={inerte}>
          {ativa === "almoxarifado" ? <Almoxarifado obra={obra} /> : ativa === "pedidos" ? <Pedidos obra={obra} /> : <Aprovacoes obra={obra} />}
        </section>
      ) : null}
    </>
  );
}
