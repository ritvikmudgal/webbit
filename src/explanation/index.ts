/**
 * src/explanation/index.ts
 *
 * Main orchestrator for Webbit's code-explanation pipeline.
 *
 * PIPELINE (cache miss path)
 * ──────────────────────────
 *   1. Hash the raw file content with SHA-256
 *   2. Check the LRU cache (O(1))
 *   3. CACHE HIT  → return immediately; no parser or LLM calls are made
 *   4. CACHE MISS → parse the file → run Agent 1 & Agent 2 → store result
 *
 * The `fromCache` boolean in the return value lets callers (e.g. extension.ts)
 * show a ⚡ indicator when the result was served from cache.
 */

import * as path from 'path';

import { parse }               from '../parser/tsParser';
import { buildProjectContext } from './contextBuilder';
import { runAgents, AgentOutput } from './agents';
import { explanationCache, CacheValue } from './cache';

// ─── Public Types ──────────────────────────────────────────────────────────────

/** Options accepted by `explainFile`. */
export interface ExplainFileOptions {
  /** Absolute path to the file on disk (used by the parser and context builder). */
  filePath: string;
  /** Raw text content of the file (used for SHA-256 hashing and parsing). */
  content: string;
  /** Human-readable language name, e.g. "TypeScript" or "Python". */
  language: string;
  /** Files that import this file (reverse-dependency list). Defaults to []. */
  dependents?: string[];
  /** Google AI API key passed through to the agents. */
  apiKey: string;
}

/** Return value of `explainFile`. Extends `AgentOutput` with a cache indicator. */
export interface ExplainFileResult extends AgentOutput {
  /**
   * `true`  → result was served from the LRU cache (no parser/LLM was invoked).
   * `false` → result was freshly computed and has been stored in the cache.
   */
  fromCache: boolean;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Explains a source file using Webbit's two-agent Gemini pipeline.
 *
 * Wraps the pipeline in a SHA-256 content-keyed LRU cache (max 5 entries).
 * Repeated opens of the same unchanged file are served instantly from cache.
 * If the user edits the file, the hash changes, causing a natural cache miss.
 *
 * @param options - See `ExplainFileOptions`.
 * @returns       - See `ExplainFileResult`.
 */
export async function explainFile(options: ExplainFileOptions): Promise<ExplainFileResult> {
  const { filePath, content, language, dependents = [], apiKey } = options;

  // ── Step 1: Compute SHA-256 hash of raw file content ──────────────────────
  const contentHash = explanationCache.hashContent(content);

  // ── Step 2 & 3: Cache lookup ───────────────────────────────────────────────
  const cached: CacheValue | undefined = explanationCache.get(contentHash);

  if (cached !== undefined) {
    // CACHE HIT — skip parser and LLM entirely.
    return {
      fileLevel:     cached.agent1Response,
      functionLevel: cached.agent2Response,
      fromCache:     true,
    };
  }

  // ── Step 4: Cache miss — run the full pipeline ────────────────────────────

  // 4a. Parse the file (Tree-sitter or regex stub in tsParser.ts)
  const wasmDir     = path.join(__dirname, '..', '..', 'node_modules');
  const parseResult = await parse(content, language, wasmDir);

  // 4b. Build project-wide context (package.json name, deps, README snippet)
  const projectContext = buildProjectContext(filePath);

  // 4c. Run Agent 1 (file-level) & Agent 2 (function-level) via Gemini
  const agentOutput: AgentOutput = await runAgents({
    filePath,
    parseResult,
    projectContext,
    dependents,
    apiKey,
  });

  // ── Step 5: Store the result in the LRU cache ──────────────────────────────
  const cacheValue: CacheValue = {
    agent1Response: agentOutput.fileLevel,
    agent2Response: agentOutput.functionLevel,
    timestamp:      Date.now(),
  };
  explanationCache.set(contentHash, cacheValue);

  return {
    ...agentOutput,
    fromCache: false,
  };
}
