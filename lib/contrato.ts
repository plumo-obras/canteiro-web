/**
 * Tipos do contrato do MVP-0 (docs/contrato.md), espelhando packages/dominio/src/canteiro_dominio/modelos.py.
 * Quantidade em milésimos e dinheiro em centavos, sempre inteiros: quem formata é o front (lib/formato.ts).
 * Datas chegam como texto ISO 8601 com fuso.
 */

export type Milesimos = number;
export type Centavos = number;
export type DataISO = string;

export type Papel = "viewer" | "admin" | "master";

export interface Usuario {
  id: string;
  nome: string;
  tenant_id: string;
  papel: Papel;
}

interface Documento {
  id: string;
  tenant_id: string;
  criado_em: DataISO;
}

export type StatusObra = "em_andamento" | "em_orcamento" | "concluida";

export type Tipologia = "casa" | "sobrado" | "predio" | "galpao" | "reforma" | "comercial" | "outro";
export type Padrao = "baixo" | "normal" | "alto";
export type Regime = "empreitada" | "administracao";

export interface Obra extends Documento {
  nome: string;
  cidade: string;
  cep: string;
  verba: Centavos;
  status: StatusObra;
  endereco: string;
  uf: string;
  tipologia: Tipologia | null;
  /** m² em milésimos (142,5 m² = 142500); 0 = não informado. */
  area_construida: Milesimos;
  pavimentos: number;
  padrao: Padrao | null;
  regime: Regime | null;
  cliente: string;
  /** AAAA-MM-DD */
  inicio: string | null;
  prazo_meses: number;
  numero_contrato: string;
  /** Centésimos de ponto percentual (22,91% = 2291); 0 = não informado. */
  bdi: number;
  /** AAAA-MM: mês dos preços de referência. */
  data_base: string | null;
}

/** PATCH /obras/{id}: só os campos enviados mudam. */
export type DadosObra = Partial<Omit<Obra, keyof Documento | "status">>;
export type CorpoObra = DadosObra & { nome: string; chave_idempotencia: string };

/** Índices (0-based) das colunas da planilha; null = não mapeada. */
export interface Mapeamento {
  planilha: string;
  linha_cabecalho: number;
  /** Só no orçamento (EAP): nº do item ("3.2.1"), código e fonte (SINAPI, SEINFRA, próprio). */
  item: number | null;
  codigo: number | null;
  fonte: number | null;
  nome: number | null;
  unidade: number | null;
  quantidade: number | null;
  valor_unitario: number | null;
  valor_total: number | null;
  saldo: number | null;
  curva: number | null;
}

export interface LeituraPlanilha {
  planilhas: string[];
  planilha: string;
  linha_cabecalho: number;
  colunas: { indice: number; titulo: string }[];
  amostra: string[][];
  sugestao: Mapeamento;
}

export interface LinhaOrcamento {
  linhas: number[];
  nome: string;
  unidade: string;
  quantidade: Milesimos;
  valor_unitario: Centavos;
  total: Centavos;
  curva: CurvaABC;
  saldo: Milesimos;
  situacao: "novo" | "atualiza";
  precisa_antes: Milesimos | null;
  valor_antes: Centavos | null;
}

export interface PreviaOrcamento {
  aplicado: boolean;
  linhas: LinhaOrcamento[];
  ignoradas: { linha: number; texto: string; motivo: string }[];
  erros: { linha: number; campo: string | null; mensagem: string }[];
  total: Centavos;
  novos: number;
  atualizados: number;
  juntadas: number;
}

export type CurvaABC = "A" | "B" | "C";

/* ---------- orçamento da obra (EAP, em versões) ---------- */

export type TipoVersao = "contrato" | "aditivo";

export interface VersaoOrcamento {
  id: string;
  obra_id: string;
  tipo: TipoVersao;
  /** 0 no contrato; 1, 2… nos aditivos. */
  numero: number;
  descricao: string;
  /** AAAA-MM-DD */
  data: string | null;
  arquivo: string;
  itens: number;
  etapas: number;
  total: Centavos;
  /** false = desfeita ou substituída. */
  ativa: boolean;
  substitui: string | null;
  /** A EntradaRegistro da importação: o Desfazer da versão usa este ID. */
  registro_id: string | null;
  criado_em: DataISO;
}

export interface ItemPrevia {
  ordem: number;
  tipo: "etapa" | "item";
  numero: string;
  nivel: number;
  /** Número da etapa raiz ("2" para "2.1.1"). */
  etapa: string;
  codigo: string;
  fonte: string;
  descricao: string;
  unidade: string;
  quantidade: Milesimos;
  valor_unitario: Centavos;
  total: Centavos;
  linha: number;
}

export interface ItemOrcamento extends ItemPrevia {
  id: string;
  obra_id: string;
  versao_id: string;
}

export interface EtapaPrevia {
  etapa: string;
  descricao: string;
  total: Centavos;
}

export interface PreviaVersao {
  aplicado: boolean;
  tipo: TipoVersao;
  itens: ItemPrevia[];
  ignoradas: { linha: number; texto: string; motivo: string }[];
  erros: { linha: number; campo: string | null; mensagem: string }[];
  avisos: { linha: number; mensagem: string }[];
  total: Centavos;
  n_itens: number;
  n_etapas: number;
  etapas: EtapaPrevia[];
  substitui: { versao_id: string; total: Centavos; itens: number } | null;
  versao_id: string | null;
  registro_id: string | null;
}

export interface EtapaOrcamento {
  etapa: string;
  descricao: string;
  contratado: Centavos;
  aditivos: Centavos;
  atual: Centavos;
}

/** `GET /obras/{id}/orcamento`. */
export interface Orcamento {
  versoes: VersaoOrcamento[];
  itens: (ItemOrcamento & { curva: CurvaABC | null })[];
  etapas: EtapaOrcamento[];
  totais: { contratado: Centavos; aditivos: Centavos; atual: Centavos; n_itens: number; n_etapas: number };
}

/** O que acompanha a planilha no `POST …/orcamento/versoes`. */
export interface CorpoVersao {
  mapeamento: Mapeamento;
  tipo: TipoVersao;
  descricao?: string;
  data?: string | null;
  aplicar: boolean;
  chave_idempotencia?: string;
}

export interface Insumo extends Documento {
  obra_id: string;
  nome: string;
  unidade: string;
  precisa_ate_o_fim: Milesimos;
  curva: CurvaABC;
  /** Preço unitário do orçamento; 0 = sem preço. */
  valor_unitario: Centavos;
}

/** Calculada por `regras.conta_de_falta` na API. O front só mostra; nunca refaz a conta. */
export interface Conta {
  precisa: Milesimos;
  saldo: Milesimos;
  a_caminho: Milesimos;
  cotando: Milesimos;
  transferencia: Milesimos;
  falta: Milesimos;
  comprar: Milesimos;
}

export interface ItemInsumo {
  insumo: Insumo;
  conta: Conta;
}

export type TipoMovimento = "entrada" | "saida" | "ajuste" | "transferencia_entrada" | "transferencia_saida";

export interface Movimento extends Documento {
  obra_id: string;
  insumo_id: string;
  tipo: TipoMovimento;
  quantidade: Milesimos;
  destino: string | null;
  origem_doc: string | null;
  quem: string; // nome legível de quem lançou
  usuario_id?: string | null;
  origem: string;
  desfaz: string | null;
}

/** `POST /obras/{id}/insumos`: o que chegou ou foi comprado fora da planilha. `precisa_ate_o_fim` 0 = fora da conta. */
export interface CorpoInsumo {
  nome: string;
  unidade: string;
  curva?: CurvaABC;
  precisa_ate_o_fim?: Milesimos;
}

/** `POST /obras/{id}/movimentos`. Ajuste leva o sinal na quantidade (+ achou, − sumiu); os outros tipos, > 0. */
export interface CorpoMovimento {
  insumo_id: string;
  tipo: "entrada" | "saida" | "ajuste";
  quantidade: Milesimos;
  destino?: string | null;
  origem_doc?: string | null;
  chave_idempotencia: string;
}

export type StatusPedido = "em_cotacao" | "aprovado" | "enviado" | "em_transito" | "recebido" | "conferido" | "cancelado";

export interface Pedido extends Documento {
  numero: string;
  obra_id: string;
  insumo_id: string;
  quantidade: Milesimos;
  fornecedor: string;
  valor: Centavos;
  status: StatusPedido;
  previsao: string | null;
  rastreio: string | null;
  /** Gravados ao conferir: o que chegou de fato (pode ser menos ou mais que o pedido) e a NF. */
  quantidade_recebida?: Milesimos | null;
  nf?: string | null;
}

/** `POST /obras/{id}/pedidos`. `aprovado` cria já aprovado; sem ele, o pedido nasce em cotação. */
export interface CorpoPedido {
  insumo_id: string;
  quantidade: Milesimos;
  fornecedor: string;
  valor: Centavos;
  previsao?: string | null;
  aprovado?: boolean;
}

/** `POST /pedidos/{id}/avancar`. A quantidade recebida e a NF só valem para `para: "conferido"`. */
export interface CorpoAvancar {
  para: StatusPedido;
  quantidade_recebida?: Milesimos;
  nf?: string;
}

/** As escritas da tela devolvem o ID da EntradaRegistro criada: é o que o "Desfazer" do aviso usa. */
export type ComRegistro<T> = T & { registro_id?: string | null };

export type StatusProposta = "pendente" | "aprovada" | "recusada" | "desfeita";
export type TipoProposta = "criar_pedido" | "avancar_pedido" | "ajuste_estoque";

export interface DadosCriarPedido {
  insumo_id: string;
  quantidade: Milesimos;
  fornecedor: string;
  valor: Centavos;
  previsao?: string | null;
}
export interface DadosAvancarPedido {
  pedido_id: string;
  para: StatusPedido;
  quantidade_recebida?: Milesimos | null;
  nf?: string | null;
}
export interface DadosAjusteEstoque {
  insumo_id: string;
  quantidade: Milesimos;
  motivo: string;
}

export interface Proposta extends Documento {
  obra_id: string;
  tipo: TipoProposta;
  titulo: string;
  conta: string;
  /** Por que o agente propõe, em uma frase. */
  justificativa?: string;
  fonte: string;
  dados: Record<string, unknown>;
  /** Alguém mudou os dados antes de aprovar: `dados` é o que foi executado, `dados_originais` o que o agente propôs. */
  ajustada?: boolean;
  dados_originais?: Record<string, unknown> | null;
  sugerido_por: string;
  status: StatusProposta;
  decidido_por: string | null;
  decidido_em: DataISO | null;
  motivo_recusa: string | null;
  decidido_por_nome: string | null;
  /** A EntradaRegistro da execução: o que o Desfazer usa, inclusive depois de recarregar a tela. */
  registro_id?: string | null;
}

export interface EntradaRegistro extends Documento {
  obra_id: string | null;
  quem: string; // nome legível
  quem_nome?: string;
  usuario_id?: string;
  origem: string;
  texto: string;
  proposta_id: string | null;
  desfazer: Record<string, unknown> | null;
  desfeito: boolean;
}

/** O que dá para mudar antes de aprovar, por tipo (o resto da proposta é fixo). */
export type AjustesProposta =
  | Partial<Pick<DadosCriarPedido, "quantidade" | "fornecedor" | "valor" | "previsao">>
  | Partial<Pick<DadosAvancarPedido, "quantidade_recebida" | "nf">>
  | Partial<Pick<DadosAjusteEstoque, "quantidade" | "motivo">>;

/** Resposta de `POST /propostas/{id}/aprovar`. */
export interface RespostaAprovar {
  proposta: Proposta;
  registro: EntradaRegistro;
}

export interface RespostaEntrar {
  acesso: string;
  renovacao: string;
  usuario: Usuario;
}

/* ---------- SSE do POST /conversa ---------- */

export type NivelFerramenta = "consulta" | "propoe";

export interface UsoConversa {
  tokens: number;
  custo: number;
}

export type EventoConversa =
  | { tipo: "texto"; delta: string }
  | { tipo: "ferramenta"; nome: string; nivel: NivelFerramenta; resumo: string }
  | { tipo: "proposta"; proposta: Proposta }
  | { tipo: "fim"; sessao_id: string; uso: UsoConversa }
  | { tipo: "erro"; mensagem: string };

export interface CorpoConversa {
  sessao_id?: string | null;
  obra_id?: string | null;
  texto: string;
}

/* ---------- página inicial e conta (Web v2) ---------- */

/** `GET /obras/resumo`: um por obra, somado na API (nada de agregação no banco). */
export interface ResumoObra {
  obra: Obra;
  /** Propostas pendentes. */
  pendencias: number;
  /** Insumos com `Conta.comprar > 0`. */
  falta_comprar: number;
  /** Pedidos ainda não conferidos nem cancelados. */
  pedidos_abertos: number;
  valor_pedidos_abertos: Centavos;
  /** Pedidos recebidos esperando a conferência da NF. */
  nf_para_conferir: number;
  ultima_atividade: DataISO | null;
}

/** Valores de IA em microdólares (1 US$ = 1.000.000), inteiros como o resto do dinheiro. */
export type Microdolares = number;

export interface Creditos {
  saldo_microdolares: Microdolares;
  franquia: Microdolares;
  chave_propria: boolean;
  usuario_id?: string;
  tenant_id?: string;
}

/** Situação da chave própria da Anthropic. Nunca traz a chave: só os 4 últimos caracteres. */
export interface ChavePropria {
  ativa: boolean;
  final: string | null;
  cadastrada_em: DataISO | null;
}

/** `GET /conta`. */
export interface MinhaConta {
  usuario: { id: string; nome: string; email: string; papel: Papel };
  tenant: { id: string; nome: string };
  chave_propria: ChavePropria | null;
  creditos: Creditos;
}

export interface SomaUso {
  custo: Microdolares;
  tokens: number;
}

/** `GET /uso?de&ate`: dias sem consumo não vêm na lista. */
export interface RelatorioUso {
  total: SomaUso;
  por_dia: (SomaUso & { dia: string })[];
  por_obra: (SomaUso & { obra_id: string | null })[];
  por_rota: (SomaUso & { rota: string })[];
}
