/**
 * Pure, safe expression evaluator for computed columns (`compute` attribute of
 * dsfr-data-normalize).
 *
 * Scope (version simple, assumed):
 *   - arithmetic on numeric fields + constants: + - * /
 *   - text concatenation with `+` and single-quoted string literals
 *   - parentheses for precedence
 *
 * Out of scope (distinct future need): conditions / functions / aggregated values.
 *
 * Implemented as a tokenizer + recursive-descent parser → AST → evaluator.
 * NEVER uses eval()/new Function() — public repo + miweb mirror, no injection.
 */

import { toNumber, looksLikeNumber } from './number-parser.js';
import { isUnsafeKey } from './security.js';

type Row = Record<string, unknown>;

// --- AST ---

type Node =
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'field'; name: string }
  | { type: 'neg'; operand: Node }
  | { type: 'bin'; op: '+' | '-' | '*' | '/'; left: Node; right: Node };

export interface CompiledAssignment {
  target: string;
  ast: Node;
}

export type CompiledCompute = CompiledAssignment[];

// --- Tokenizer ---

type Token =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'ident'; v: string }
  | { t: 'op'; v: '+' | '-' | '*' | '/' }
  | { t: 'lparen' }
  | { t: 'rparen' };

// Identifiers: letters (incl. accented), digits, underscore. No spaces.
const IDENT_START = /[A-Za-zÀ-ÿ_]/;
const IDENT_PART = /[A-Za-zÀ-ÿ0-9_]/;

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    if (ch === '(') {
      tokens.push({ t: 'lparen' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ t: 'rparen' });
      i++;
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ t: 'op', v: ch });
      i++;
      continue;
    }

    // String literal (single quotes)
    if (ch === "'") {
      let j = i + 1;
      let str = '';
      while (j < input.length && input[j] !== "'") {
        str += input[j];
        j++;
      }
      if (j >= input.length) {
        throw new Error(`compute: chaîne non terminée près de "${input.slice(i)}"`);
      }
      tokens.push({ t: 'str', v: str });
      i = j + 1;
      continue;
    }

    // Number literal (international dot notation)
    if (ch >= '0' && ch <= '9') {
      let j = i;
      let num = '';
      while (j < input.length && ((input[j] >= '0' && input[j] <= '9') || input[j] === '.')) {
        num += input[j];
        j++;
      }
      tokens.push({ t: 'num', v: parseFloat(num) });
      i = j;
      continue;
    }

    // Identifier (field name)
    if (IDENT_START.test(ch)) {
      let j = i;
      let name = '';
      while (j < input.length && IDENT_PART.test(input[j])) {
        name += input[j];
        j++;
      }
      tokens.push({ t: 'ident', v: name });
      i = j;
      continue;
    }

    throw new Error(`compute: caractère inattendu "${ch}" dans l'expression`);
  }
  return tokens;
}

// --- Parser (recursive descent) ---

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  parse(): Node {
    const node = this.parseAdd();
    if (this.pos < this.tokens.length) {
      throw new Error('compute: expression mal formée (jeton restant)');
    }
    return node;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private parseAdd(): Node {
    let left = this.parseMul();
    let tok = this.peek();
    while (tok && tok.t === 'op' && (tok.v === '+' || tok.v === '-')) {
      this.pos++;
      const right = this.parseMul();
      left = { type: 'bin', op: tok.v, left, right };
      tok = this.peek();
    }
    return left;
  }

  private parseMul(): Node {
    let left = this.parseUnary();
    let tok = this.peek();
    while (tok && tok.t === 'op' && (tok.v === '*' || tok.v === '/')) {
      this.pos++;
      const right = this.parseUnary();
      left = { type: 'bin', op: tok.v, left, right };
      tok = this.peek();
    }
    return left;
  }

  private parseUnary(): Node {
    const tok = this.peek();
    if (tok && tok.t === 'op' && tok.v === '-') {
      this.pos++;
      return { type: 'neg', operand: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Node {
    const tok = this.peek();
    if (!tok) throw new Error('compute: expression incomplète');

    if (tok.t === 'num') {
      this.pos++;
      return { type: 'num', value: tok.v };
    }
    if (tok.t === 'str') {
      this.pos++;
      return { type: 'str', value: tok.v };
    }
    if (tok.t === 'ident') {
      this.pos++;
      if (isUnsafeKey(tok.v)) {
        throw new Error(`compute: nom de champ interdit "${tok.v}"`);
      }
      return { type: 'field', name: tok.v };
    }
    if (tok.t === 'lparen') {
      this.pos++;
      const node = this.parseAdd();
      const next = this.peek();
      if (!next || next.t !== 'rparen') {
        throw new Error('compute: parenthèse fermante manquante');
      }
      this.pos++;
      return node;
    }
    throw new Error("compute: jeton inattendu dans l'expression");
  }
}

// --- Compile ---

/**
 * Parse a `compute` attribute (`target = expr; target2 = expr2`) into compiled
 * assignments. The expressions are parsed once here, not per row.
 */
export function compileCompute(attr: string): CompiledCompute {
  const compiled: CompiledCompute = [];
  if (!attr || !attr.trim()) return compiled;

  for (const part of attr.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      throw new Error(`compute: assignation invalide "${trimmed}" (attendu "champ = expression")`);
    }
    const target = trimmed.slice(0, eq).trim();
    const exprStr = trimmed.slice(eq + 1).trim();
    if (!target) throw new Error('compute: nom de champ cible manquant');
    if (isUnsafeKey(target)) throw new Error(`compute: nom de champ cible interdit "${target}"`);
    if (!exprStr) throw new Error(`compute: expression manquante pour "${target}"`);
    const ast = new Parser(tokenize(exprStr)).parse();
    compiled.push({ target, ast });
  }
  return compiled;
}

// --- Evaluate ---

/** Returns the numeric value of v if it is a number or a numeric-looking string, else null. */
function numberish(v: unknown): number | null {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'string' && looksLikeNumber(v)) return toNumber(v, true);
  return null;
}

function evalNode(node: Node, row: Row): unknown {
  switch (node.type) {
    case 'num':
      return node.value;
    case 'str':
      return node.value;
    case 'field':
      return Object.prototype.hasOwnProperty.call(row, node.name) ? row[node.name] : undefined;
    case 'neg':
      return -toNumber(evalNode(node.operand, row));
    case 'bin': {
      const l = evalNode(node.left, row);
      const r = evalNode(node.right, row);
      if (node.op === '+') {
        // `+` is overloaded: numeric add when both sides are numberish, else string concat.
        const ln = numberish(l);
        const rn = numberish(r);
        if (ln !== null && rn !== null) return ln + rn;
        return `${l ?? ''}${r ?? ''}`;
      }
      const a = toNumber(l);
      const b = toNumber(r);
      switch (node.op) {
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          return a / b;
      }
    }
  }
}

/**
 * Apply compiled assignments to a row, mutating a shallow copy. Each target field
 * is computed in order, so a later assignment can reference an earlier one.
 */
export function applyCompute(row: Row, compiled: CompiledCompute): Row {
  if (compiled.length === 0) return row;
  const result: Row = { ...row };
  for (const { target, ast } of compiled) {
    result[target] = evalNode(ast, result);
  }
  return result;
}
