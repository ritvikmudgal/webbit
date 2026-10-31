/**
 * src/explanation/cache.ts
 *
 * SHA-256 content-keyed LRU (Least Recently Used) cache for Webbit agent results.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Every time a user opens a file in the dependency graph, the extension would
 * normally re-run the Tree-sitter parser AND make two expensive cloud LLM API
 * calls (Agent 1 & Agent 2). This cache stores the results so that repeated
 * clicks on the same unchanged file are instantaneous and cost $0.
 *
 * HOW THE LRU WORKS
 * ─────────────────
 * JavaScript's built-in `Map` preserves insertion order. We exploit this:
 *
 *   • The FIRST key in the Map is always the Least Recently Used (LRU) entry.
 *   • The LAST  key in the Map is always the Most Recently Used  (MRU) entry.
 *
 * When an entry is accessed (get) or updated (set), we delete it from the Map
 * and re-insert it — this moves it to the tail (MRU position).
 *
 * When the cache is full and a new entry arrives:
 *   1. Grab the first key via `map.keys().next().value` → LRU key
 *   2. Delete it
 *   3. Insert the new entry at the tail
 *
 * This gives O(1) get, set, and eviction — no linked-list bookkeeping needed.
 *
 * CACHE INVALIDATION
 * ──────────────────
 * Cache keys are SHA-256 hashes of the raw file content string. If the user
 * edits a file, its content changes → its SHA-256 hash changes → the cache
 * misses naturally → the file goes back through the Parser → Agent pipeline.
 * No explicit invalidation logic is required.
 */

import { createHash } from 'crypto';

// ─── Public Types ──────────────────────────────────────────────────────────────

/** The value stored for each cached file. */
export interface CacheValue {
  /** File-level explanation produced by Agent 1. */
  agent1Response: string;
  /** Function/class-level analysis produced by Agent 2. */
  agent2Response: string;
  /** Unix timestamp (ms) of when this entry was cached. */
  timestamp: number;
}

/**
 * Describes the outcome of a cache lookup.
 * `isHit` is true when the content was found in the cache.
 */
export interface CacheResult {
  isHit: boolean;
  data?: CacheValue;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

/** Maximum number of files that can live in the cache simultaneously. */
const CACHE_CAPACITY = 5;

// ─── ExplanationCache ──────────────────────────────────────────────────────────

/**
 * SHA-256 content-keyed LRU cache for Webbit agent results.
 *
 * @example
 * ```ts
 * const hash   = explanationCache.hashContent(rawFileContent);
 * const cached = explanationCache.get(hash);
 * if (cached) {
 *   // Cache hit — no LLM call needed
 *   return { fileLevel: cached.agent1Response, functionLevel: cached.agent2Response };
 * }
 * // Cache miss — run the full pipeline, then store the result
 * const result = await runAgents(input);
 * explanationCache.set(hash, { agent1Response: result.fileLevel, agent2Response: result.functionLevel, timestamp: Date.now() });
 * ```
 */
export class ExplanationCache {
  /**
   * Backing store. Map preserves insertion order:
   *   head (first key) = LRU
   *   tail (last key)  = MRU
   */
  private readonly store = new Map<string, CacheValue>();

  /** Maximum number of entries allowed in the cache. */
  private readonly capacity: number;

  constructor(capacity: number = CACHE_CAPACITY) {
    this.capacity = capacity;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Returns the SHA-256 hex digest of `content`.
   *
   * Uses Node.js built-in `crypto` — no external dependencies.
   * Handles large files efficiently via the streaming hash API.
   *
   * @param content - Raw file content string (UTF-8).
   * @returns 64-character lowercase hex string.
   */
  hashContent(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  /**
   * Retrieves a cached value by its SHA-256 hash.
   *
   * **LRU effect:** On a cache hit, the entry is moved to the MRU (tail)
   * position so it is the last to be evicted.
   *
   * @param hash - SHA-256 hex digest (from `hashContent`).
   * @returns The cached `CacheValue`, or `undefined` on a cache miss.
   */
  get(hash: string): CacheValue | undefined {
    const value = this.store.get(hash);
    if (value === undefined) {
      return undefined;   // cache miss
    }

    // Move to tail (MRU): delete + re-insert preserves Map's insertion order.
    this.store.delete(hash);
    this.store.set(hash, value);

    return value;
  }

  /**
   * Stores a value in the cache under the given SHA-256 hash.
   *
   * Behaviour:
   * - If `hash` already exists → updates its value and moves it to MRU.
   * - If the cache is at capacity → evicts the LRU entry (Map's first key)
   *   before inserting the new entry.
   *
   * @param hash  - SHA-256 hex digest (from `hashContent`).
   * @param value - The result to cache.
   */
  set(hash: string, value: CacheValue): void {
    if (this.store.has(hash)) {
      // Entry exists: delete first so re-insertion moves it to the tail.
      this.store.delete(hash);
    } else if (this.store.size >= this.capacity) {
      /**
       * Cache is full. Evict the LRU entry.
       *
       * `Map.keys()` returns keys in insertion order.
       * The very first key is the oldest / least-recently-used entry.
       */
      const lruKey = this.store.keys().next().value as string;
      this.store.delete(lruKey);
    }

    // Insert at the tail → becomes the new MRU entry.
    this.store.set(hash, value);
  }

  /** Number of entries currently held in the cache (0 – capacity). */
  get size(): number {
    return this.store.size;
  }

  /**
   * Removes all entries from the cache.
   * Useful for testing or when the user explicitly requests a cache clear.
   */
  clear(): void {
    this.store.clear();
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────────

/**
 * Shared singleton instance used by the whole Webbit extension.
 * Importing this from any module always gives the same cache object.
 */
export const explanationCache = new ExplanationCache();
