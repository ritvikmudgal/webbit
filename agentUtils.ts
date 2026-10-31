/**
 * agentUtils.ts
 * Shared utilities for agent1.ts and agent2.ts.
 * Pure Node.js — no VS Code APIs.
 * LLM provider: Google Gemini via @google/generative-ai
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Automatically load environment variables from .env silently (no stdout logs)
dotenv.config({ quiet: true });

// ---------------------------------------------------------------------------
// Model config
// ---------------------------------------------------------------------------

// ─── Model config ─────────────────────────────────────────────────────────────
// Gemini 3.5 Flash Lite — best free-tier model on this account
// Limits: 15 RPM · 250K TPM · 500 RPD
export const MODEL = 'gemini-3.5-flash-lite';

// ---------------------------------------------------------------------------
// Gemini client (cached singleton per API key)
// ---------------------------------------------------------------------------

let _cachedModel: GenerativeModel | null = null;
let _cachedKey = '';

/**
 * Return a (possibly cached) GenerativeModel.
 * Reads GOOGLE_AI_API_KEY from the environment.
 * Throws a descriptive Error when the key is absent.
 */
export function createGeminiModel(): GenerativeModel {
  const apiKey = process.env.GOOGLE_AI_API_KEY ?? '';
  if (!apiKey.trim()) {
    throw new Error(
      'GOOGLE_AI_API_KEY environment variable is not set or is empty. ' +
        'Set it before running:\n' +
        '  PowerShell : $env:GOOGLE_AI_API_KEY="AQ.xxxxx..."\n' +
        '  CMD        : set GOOGLE_AI_API_KEY=AQ.xxxxx...\n' +
        '  Bash       : export GOOGLE_AI_API_KEY="AQ.xxxxx..."\n\n' +
        'Get a free key at: https://aistudio.google.com/apikey'
    );
  }

  if (_cachedModel && _cachedKey === apiKey) {
    return _cachedModel;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  _cachedModel = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      temperature: 0.2,     // low → deterministic, structured output
      maxOutputTokens: 4096,
    },
  });
  _cachedKey = apiKey;
  return _cachedModel;
}

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

const EXT_TO_LANG: Record<string, string> = {
  '.ts':   'TypeScript',
  '.tsx':  'TypeScript (React)',
  '.js':   'JavaScript',
  '.jsx':  'JavaScript (React)',
  '.py':   'Python',
  '.go':   'Go',
  '.rs':   'Rust',
  '.java': 'Java',
  '.cs':   'C#',
  '.cpp':  'C++',
  '.c':    'C',
  '.rb':   'Ruby',
  '.php':  'PHP',
  '.swift':'Swift',
  '.kt':   'Kotlin',
};

export function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return EXT_TO_LANG[ext] ?? 'Unknown';
}

// ---------------------------------------------------------------------------
// Robust JSON extractor
// ---------------------------------------------------------------------------

/**
 * Strips optional ```json ... ``` or ``` ... ``` markdown fences that Gemini
 * sometimes wraps around its JSON response, then parses the result.
 *
 * Returns the parsed object on success.
 * Returns `{ error: "Failed to parse LLM JSON", raw: <original text> }` on
 * failure so callers always receive a valid JS object.
 */
export function extractJson(text: string): Record<string, unknown> {
  const trimmed = text.trim();

  // Strip ```json ... ``` or ``` ... ``` fences.
  const fencePattern = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i;
  const fenceMatch = fencePattern.exec(trimmed);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  // Some models prepend a short sentence before the JSON — find the first '{'.
  const jsonStart = candidate.indexOf('{');
  const jsonEnd   = candidate.lastIndexOf('}');
  const jsonSlice =
    jsonStart !== -1 && jsonEnd > jsonStart
      ? candidate.slice(jsonStart, jsonEnd + 1)
      : candidate;

  try {
    return JSON.parse(jsonSlice) as Record<string, unknown>;
  } catch {
    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return { error: 'Failed to parse LLM JSON', raw: text };
    }
  }
}

// ---------------------------------------------------------------------------
// Structured error envelope
// ---------------------------------------------------------------------------

export interface ErrorEnvelope {
  agent: string;
  status: 'error';
  message: string;
}

export function buildErrorEnvelope(agentName: string, err: unknown): ErrorEnvelope {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
      ? err
      : JSON.stringify(err);

  return { agent: agentName, status: 'error', message };
}
