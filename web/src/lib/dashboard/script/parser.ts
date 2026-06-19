import type { Expr, PipelineStage, Token } from '@/lib/dashboard/script/types';
import { DashScriptError } from '@/lib/dashboard/script/types';
import { tokenize } from '@/lib/dashboard/script/lexer';

export class Parser {
  private pos = 0;

  constructor(private tokens: Token[]) {}

  parseExpr(): Expr {
    return this.orExpr();
  }

  parsePipeline(): PipelineStage[] {
    const stages: PipelineStage[] = [];
    stages.push(this.pipelineStage());
    while (this.match('pipe')) {
      stages.push(this.pipelineStage());
    }
    return stages;
  }

  private pipelineStage(): PipelineStage {
    const name = this.consumeIdent('Expected pipeline stage name');
    this.consume('lparen', 'Expected "(" after stage name');
    const args: Expr[] = [];
    if (!this.check('rparen')) {
      args.push(this.parseExpr());
      while (this.match('comma')) args.push(this.parseExpr());
    }
    this.consume('rparen', 'Expected ")"');
    return { kind: 'call', name, args };
  }

  private orExpr(): Expr {
    let left = this.andExpr();
    while (this.matchOp('||')) left = { kind: 'binop', op: '||', left, right: this.andExpr() };
    return left;
  }

  private andExpr(): Expr {
    let left = this.cmpExpr();
    while (this.matchOp('&&')) left = { kind: 'binop', op: '&&', left, right: this.cmpExpr() };
    return left;
  }

  private cmpExpr(): Expr {
    let left = this.addExpr();
    while (true) {
      const op = this.peekOp();
      if (!op || !['>', '<', '>=', '<=', '==', '!='].includes(op)) break;
      this.advance();
      left = { kind: 'binop', op, left, right: this.addExpr() };
    }
    return left;
  }

  private addExpr(): Expr {
    let left = this.mulExpr();
    while (true) {
      const op = this.peekOp();
      if (op !== '+' && op !== '-') break;
      this.advance();
      left = { kind: 'binop', op, left, right: this.mulExpr() };
    }
    return left;
  }

  private mulExpr(): Expr {
    let left = this.unary();
    while (true) {
      const op = this.peekOp();
      if (op !== '*' && op !== '/') break;
      this.advance();
      left = { kind: 'binop', op, left, right: this.unary() };
    }
    return left;
  }

  private unary(): Expr {
    const op = this.peekOp();
    if (op === '!' || op === '-') {
      this.advance();
      return { kind: 'unop', op, arg: this.unary() };
    }
    return this.primary();
  }

  private primary(): Expr {
    const t = this.tokens[this.pos];

    if (this.match('number')) {
      return { kind: 'number', value: Number(t.value) };
    }
    if (this.match('string')) {
      return { kind: 'string', value: t.value };
    }

    if (this.matchIdent()) {
      const name = t.value;
      if (name === 'true') return { kind: 'bool', value: true };
      if (name === 'false') return { kind: 'bool', value: false };
      if (name === 'null') return { kind: 'null' };

      if (name === 'field' && this.check('lparen')) {
        this.advance();
        const pathExpr = this.parseExpr();
        this.consume('rparen', 'Expected ")" after field path');
        if (pathExpr.kind !== 'string') throw new DashScriptError('field() requires a string path', t.pos);
        return { kind: 'field', path: pathExpr.value };
      }

      if (name === 'row' && this.check('dot')) {
        this.advance();
        const field = this.consumeIdent('Expected row field name');
        return { kind: 'rowField', name: field };
      }

      // bare identifier in row context → row field shorthand
      if (this.check('dot')) {
        let path = name;
        while (this.match('dot')) {
          path += `.${this.consumeIdent('Expected field after "."')}`;
        }
        return { kind: 'field', path };
      }

      if (this.check('lparen')) {
        this.advance();
        const args: Expr[] = [];
        if (!this.check('rparen')) {
          args.push(this.parseExpr());
          while (this.match('comma')) args.push(this.parseExpr());
        }
        this.consume('rparen', 'Expected ")"');
        return { kind: 'call', name, args };
      }

      // identifier alone → row field in filter context, or field on raw in measure context
      return { kind: 'rowField', name };
    }

    if (this.match('lparen')) {
      const e = this.parseExpr();
      this.consume('rparen', 'Expected ")"');
      return e;
    }

    throw new DashScriptError(`Unexpected token "${t.value}"`, t.pos);
  }

  private match(type: Token['type']): boolean {
    if (this.tokens[this.pos]?.type !== type) return false;
    this.pos++;
    return true;
  }

  private matchOp(op: string): boolean {
    if (this.tokens[this.pos]?.type !== 'op' || this.tokens[this.pos]?.value !== op) return false;
    this.pos++;
    return true;
  }

  private check(type: Token['type']): boolean {
    return this.tokens[this.pos]?.type === type;
  }

  private peekOp(): string | null {
    const t = this.tokens[this.pos];
    return t?.type === 'op' ? t.value : null;
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  private consume(type: Token['type'], msg: string): Token {
    const t = this.tokens[this.pos];
    if (t?.type !== type) throw new DashScriptError(msg, t?.pos);
    this.pos++;
    return t;
  }

  private matchIdent(): boolean {
    const t = this.tokens[this.pos];
    if (t?.type !== 'ident' || t.value === 'eof') return false;
    this.pos++;
    return true;
  }

  private consumeIdent(msg: string): string {
    const t = this.tokens[this.pos];
    if (t?.type !== 'ident' || t.value === 'eof') throw new DashScriptError(msg, t?.pos);
    this.pos++;
    return t.value;
  }
}

export function parseExpr(source: string): Expr {
  const tokens = tokenize(source.trim());
  return new Parser(tokens).parseExpr();
}

export function parsePipeline(source: string): PipelineStage[] {
  const trimmed = source.trim();
  if (!trimmed) return [];
  const tokens = tokenize(trimmed);
  return new Parser(tokens).parsePipeline();
}
