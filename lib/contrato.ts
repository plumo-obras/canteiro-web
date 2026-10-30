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

export interface Obra extends Documento {
  nome: string;
  cidade: string;
  cep: string;
  verba: Centavos;
  status: StatusObra;
}

export type CurvaABC = "A" | "B" | "C";

export interface Insumo extends Documento {
  obra_id: string;
  nome: string;
  unidade: string;
  precisa_ate_o_fim: Milesimos;
  curva: CurvaABC;
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
  quem: string;
  origem: string;
  desfaz: string | null;
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
}

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
  fonte: string;
  dados: Record<string, unknown>;
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
