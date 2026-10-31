/**
 * src/parser/tsParser.ts
 *
 * Multi-language structural parser for the Webbit VS Code extension.
 *
 * Import extraction uses the partner's production-grade `extractImportSpecifiers`
 * (supports JS/TS ES imports, CommonJS require, dynamic import, Python from/import).
 *
 * Function/class extraction uses fast regex that covers the most common patterns
 * across TypeScript, JavaScript, and Python.
 *
 * Expected contract:
 *   parse(content: string, language: string, wasmDir: string): Promise<ParseResult>
 */

// ---------------------------------------------------------------------------
// Legacy types — used by CLI agents (agent1.ts / agent2.ts)
// ---------------------------------------------------------------------------

export interface ParsedSymbol {
  name:         string;
  type:         'function' | 'class' | string;
  params?:      string[];
  bodySnippet?: string;
  startLine?:   number;
  endLine?:     number;
}

// ---------------------------------------------------------------------------
// Rich types — used by VS Code extension agents (src/explanation/agents.ts)
// ---------------------------------------------------------------------------

/** A single method extracted from inside a class body. */
export interface MethodInfo {
  name:        string;
  /** Full parameter list as a raw string, e.g. "(filePath: string, opts?: Options)" */
  params:      string;
  bodySnippet: string;
  startLine:   number;
  endLine:     number;
}

/** A top-level function in the file. */
export interface FunctionInfo {
  name:        string;
  /** Full parameter list as a raw string. */
  params:      string;
  bodySnippet: string;
  startLine:   number;
  endLine:     number;
}

/** A top-level class in the file. */
export interface ClassInfo {
  name:      string;
  startLine: number;
  endLine:   number;
  methods:   MethodInfo[];
}

/** Returned by parse() for both CLI agents and the VS Code extension. */
export interface ParseResult {
  imports:   string[];
  exports:   string[];
  /** Typed as FunctionInfo[] at runtime; cast is safe when real parser is wired in. */
  functions: FunctionInfo[];
  /** Typed as ClassInfo[] at runtime; cast is safe when real parser is wired in. */
  classes:   ClassInfo[];
}

// ---------------------------------------------------------------------------
// Import the partner's production-grade specifier extractor
// ---------------------------------------------------------------------------
import { extractImportSpecifiers } from './dependencyParser';

// ---------------------------------------------------------------------------
// Stub implementation — now powered by real import extraction
// ---------------------------------------------------------------------------

/**
 * Parse a source file and return its structural elements.
 *
 * @param content  - Raw file content as a UTF-8 string.
 * @param language - Human-readable language name (e.g. "TypeScript").
 * @param wasmDir  - Absolute path to the directory containing .wasm grammars.
 * @returns        A ParseResult with imports, exports, functions, and classes.
 */
export async function parse(
  content: string,
  language: string,
  _wasmDir: string
): Promise<ParseResult> {
  // ── 1. Imports — use partner's production-grade multi-language extractor ──
  // Handles ES import/export, CommonJS require(), dynamic import(), Python from/import
  const imports = extractImportSpecifiers(content);

  // ── 2. Exports — regex covering TS/JS export patterns ──
  const exportMatches = [
    ...content.matchAll(
      /export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|type|interface|enum)\s+([\w$]+)/g
    ),
  ];
  const exports = exportMatches.map((m) => m[1]);

  // ── 3. Functions — covers named functions, arrow functions, methods ──
  const isPython = language.toLowerCase().includes('python');
  let functionMatches: RegExpMatchArray[];

  if (isPython) {
    functionMatches = [
      ...content.matchAll(/^\s*(?:async\s+)?def\s+([\w$]+)\s*(\([^)]*\))/gm),
    ];
  } else {
    functionMatches = [
      ...content.matchAll(
        /(?:export\s+)?(?:async\s+)?function\s+([\w$]+)\s*(\([^)]*\))|(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?::\s*[\w<>\[\]|&,\s]+)?\s*=>/gm
      ),
    ];
  }

  const functions: FunctionInfo[] = functionMatches.map((m) => {
    const name   = m[1] || m[3] || '';
    const params = m[2] || `(${m[4] || ''})`;
    const lineNum = content.slice(0, m.index ?? 0).split('\n').length;
    return {
      name,
      params,
      bodySnippet: '',
      startLine:   lineNum,
      endLine:     lineNum,
    };
  }).filter((f) => f.name);

  // ── 4. Classes ──
  const classMatches = [
    ...content.matchAll(/(?:export\s+)?class\s+([\w$]+)/g),
  ];
  const classes: ClassInfo[] = classMatches.map((m) => {
    const lineNum = content.slice(0, m.index ?? 0).split('\n').length;
    return {
      name:      m[1],
      startLine: lineNum,
      endLine:   lineNum,
      methods:   [],
    };
  });

  return { imports, exports, functions, classes };
}
