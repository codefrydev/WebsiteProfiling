/** DashScript — dashboard formula language (DAX-inspired, audit-data scoped). */

export type TokenType =
  | 'number'
  | 'string'
  | 'ident'
  | 'op'
  | 'pipe'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'dot'
  | 'eof';

export interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

export type Expr =
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'null' }
  | { kind: 'field'; path: string }
  | { kind: 'rowField'; name: string }
  | { kind: 'binop'; op: string; left: Expr; right: Expr }
  | { kind: 'unop'; op: string; arg: Expr }
  | { kind: 'call'; name: string; args: Expr[] };

export type PipelineStage =
  | { kind: 'call'; name: string; args: Expr[] };

export interface EvalContext {
  raw: Record<string, unknown>;
  rows: Record<string, unknown>[];
  row?: Record<string, unknown>;
}

export type EvalValue = number | string | boolean | null | Record<string, unknown>[] | Record<string, unknown>;

export class DashScriptError extends Error {
  constructor(message: string, public pos?: number) {
    super(pos != null ? `${message} (at ${pos})` : message);
    this.name = 'DashScriptError';
  }
}
