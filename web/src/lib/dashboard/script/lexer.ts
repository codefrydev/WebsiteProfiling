import type { Token } from '@/lib/dashboard/script/types';
import { DashScriptError } from '@/lib/dashboard/script/types';

const KEYWORDS = new Set(['true', 'false', 'null', 'field', 'row']);

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  const peek = () => input[i] ?? '';
  const advance = () => input[i++];

  while (i < input.length) {
    const ch = peek();
    const start = i;

    if (/\s/.test(ch)) { advance(); continue; }

    if (ch === '/' && input[i + 1] === '/') {
      while (i < input.length && input[i] !== '\n') i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = advance();
      let s = '';
      while (i < input.length && peek() !== quote) {
        if (peek() === '\\') { advance(); s += advance(); }
        else s += advance();
      }
      if (peek() !== quote) throw new DashScriptError('Unterminated string', start);
      advance();
      tokens.push({ type: 'string', value: s, pos: start });
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(input[i + 1] ?? ''))) {
      let num = '';
      while (/[0-9.]/.test(peek())) num += advance();
      tokens.push({ type: 'number', value: num, pos: start });
      continue;
    }

    if (/[a-zA-Z_@$]/.test(ch)) {
      let id = '';
      while (/[a-zA-Z0-9_@$]/.test(peek())) id += advance();
      tokens.push({ type: 'ident', value: id, pos: start });
      continue;
    }

    if (ch === '|' && input[i + 1] === '|') {
      i += 2;
      tokens.push({ type: 'op', value: '||', pos: start });
      continue;
    }
    if (ch === '&' && input[i + 1] === '&') {
      i += 2;
      tokens.push({ type: 'op', value: '&&', pos: start });
      continue;
    }
    if (ch === '|') {
      advance();
      tokens.push({ type: 'pipe', value: '|', pos: start });
      continue;
    }
    if (ch === '(') { advance(); tokens.push({ type: 'lparen', value: '(', pos: start }); continue; }
    if (ch === ')') { advance(); tokens.push({ type: 'rparen', value: ')', pos: start }); continue; }
    if (ch === ',') { advance(); tokens.push({ type: 'comma', value: ',', pos: start }); continue; }
    if (ch === '.') { advance(); tokens.push({ type: 'dot', value: '.', pos: start }); continue; }

    const two = input.slice(i, i + 2);
    if (['>=', '<=', '==', '!='].includes(two)) {
      i += 2;
      tokens.push({ type: 'op', value: two, pos: start });
      continue;
    }
    if ('+-*/<>=!'.includes(ch)) {
      advance();
      tokens.push({ type: 'op', value: ch, pos: start });
      continue;
    }

    throw new DashScriptError(`Unexpected character "${ch}"`, start);
  }

  tokens.push({ type: 'ident', value: 'eof', pos: i });
  return tokens;
}

export function isKeyword(name: string): boolean {
  return KEYWORDS.has(name);
}
