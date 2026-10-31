/**
 * src/parser/tsParser.ts
 *
 * TYPE STUB — Replace this file with your real tree-sitter / language parser.
 *
 * This stub satisfies TypeScript's type checker and provides a sensible
 * fallback so agent1.ts / agent2.ts degrade gracefully when run against
 * a file before the real parser is wired in.
 *
 * Expected contract for the real implementation:
 *   parse(content: string, language: string, wasmDir: string): Promise<ParseResult>
 *
 * Where ParseResult exposes at minimum:
 *   imports:   string[]          – imported module paths / names
 *   exports:   string[]          – exported identifiers
 *   functions: FunctionInfo[]    – top-level functions (rich shape)
 *   classes:   ClassInfo[]       – top-level classes  (rich shape)
 *
 * NOTE: `ParsedSymbol` and `FunctionInfo`/`ClassInfo` coexist.
 *   • CLI agents (agent1.ts / agent2.ts) use the legacy `ParsedSymbol` shape.
 *   • The VS Code extension agents (src/explanation/agents.ts) use the richer
 *     `FunctionInfo` / `ClassInfo` shapes exported below.
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
// Stub implementation
// Replace the body of this function with the real tree-sitter logic.
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
  wasmDir: string
): Promise<ParseResult> {
  // ---- STUB: basic regex-based extraction as a fallback ----
  // This produces approximate results; the real tree-sitter parser will be more accurate.

  const importMatches   = [...content.matchAll(/import\s+.*?from\s+['"](.+?)['"]/g)];
  const exportMatches   = [...content.matchAll(/export\s+(?:const|function|class|default|type|interface)\s+(\w+)/g)];
  const functionMatches = [...content.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*(\([^)]*\))/g)];
  const classMatches    = [...content.matchAll(/(?:export\s+)?class\s+(\w+)/g)];

  const imports = importMatches.map(m => m[1]);
  const exports = exportMatches.map(m => m[1]);

  const functions: FunctionInfo[] = functionMatches.map(m => ({
    name:        m[1],
    params:      m[2] ?? '()',
    bodySnippet: '',   // real parser fills this from the AST body node
    startLine:   0,
    endLine:     0,
  }));

  const classes: ClassInfo[] = classMatches.map(m => ({
    name:      m[1],
    startLine: 0,
    endLine:   0,
    methods:   [],     // real parser walks class body nodes to populate this
  }));

  return { imports, exports, functions, classes };
}
