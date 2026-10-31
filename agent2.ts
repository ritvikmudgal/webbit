/**
 * agent2.ts — Deep Function & Class Analyzer
 *
 * CLI Usage:
 *   npx ts-node agent2.ts <absolute_or_relative_file_path>
 *
 * Output (stdout):
 *   A single, valid JSON object — parseable by JSON.parse() — with this shape:
 *   {
 *     "agent":  "agent2",
 *     "file":   "<basename>",
 *     "status": "success",
 *     "data": {
 *       "analysis": [
 *         {
 *           "name":               "FunctionOrClassName",
 *           "type":               "function" | "class",
 *           "purpose":            "...",
 *           "inputs_outputs":     "...",
 *           "internal_mechanics": "...",
 *           "dependencies":       ["..."]
 *         }
 *       ]
 *     }
 *   }
 *
 * No VS Code APIs are used. Pure Node.js + @google/generative-ai.
 */

import * as fs   from 'fs';
import * as path from 'path';

import { parse } from './src/parser/tsParser';
import {
  createGeminiModel,
  detectLanguage,
  extractJson,
  buildErrorEnvelope,
} from './agentUtils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of a single function/class entry as returned by tsParser */
interface ParsedSymbol {
  name:         string;
  type:         'function' | 'class' | string;
  params?:      string | string[];
  bodySnippet?: string;
  startLine?:   number;
  endLine?:     number;
}

interface AnalysisEntry {
  name:               string;
  type:               'function' | 'class';
  purpose:            string;
  inputs_outputs:     string;
  internal_mechanics: string;
  dependencies:       string[];
}

interface Agent2Data {
  analysis: AnalysisEntry[];
}

interface Agent2Success {
  agent:  'agent2';
  file:   string;
  status: 'success';
  data:   Agent2Data;
}

// ---------------------------------------------------------------------------
// Formatter: convert parsed symbols into a readable string for the prompt
// ---------------------------------------------------------------------------

function formatSymbols(symbols: ParsedSymbol[]): string {
  if (symbols.length === 0) {
    return '(No functions or classes detected by the parser.)';
  }

  return symbols
    .map((sym, idx) => {
      const lines =
        sym.startLine !== undefined && sym.endLine !== undefined
          ? `Lines ${sym.startLine}–${sym.endLine}`
          : 'Line range unknown';

      const rawParams = sym.params;
      const paramsStr =
        Array.isArray(rawParams) && rawParams.length > 0
          ? `Params: ${rawParams.join(', ')}`
          : typeof rawParams === 'string' && rawParams.trim()
          ? `Params: ${rawParams}`
          : 'Params: (none / not extracted)';

      const snippet = sym.bodySnippet
        ? `Body Snippet:\n${sym.bodySnippet
            .split('\n')
            .slice(0, 30) // cap at 30 lines to stay within token budget
            .map(l => `    ${l}`)
            .join('\n')}`
        : '  Body Snippet: (not available)';

      return [
        `--- [${idx + 1}] ${sym.type.toUpperCase()}: ${sym.name} (${lines}) ---`,
        paramsStr,
        snippet,
      ].join('\n');
    })
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPrompt(filePath: string, formattedSymbols: string): string {
  return `You are a Senior Code Reviewer. Perform a deep technical inspection of the functions and classes in this file.

FILE: ${filePath}

CODE STRUCTURE:
${formattedSymbols}

For EACH function and class listed above, analyze it.
Respond ONLY with a valid JSON object (no markdown code blocks, no extra text) matching this exact schema:
{
  "analysis": [
    {
      "name": "FunctionOrClassName",
      "type": "function",
      "purpose": "What it does and why it exists.",
      "inputs_outputs": "Parameters and return types.",
      "internal_mechanics": "How it works. Note memory allocation (new), async patterns, or event handlers if visible.",
      "dependencies": ["List of other functions/modules it calls"]
    }
  ]
}
Rules:
- Infer strictly from the visible code provided. Do not hallucinate.
- Keep each entry under 100 words across all fields combined.
- The "type" field must be exactly "function" or "class".
- Output raw JSON only — no markdown, no explanation outside the JSON.`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const AGENT_NAME = 'agent2';

  // 1. Validate CLI argument
  const rawPath = process.argv[2];
  if (!rawPath) {
    const envelope = buildErrorEnvelope(
      AGENT_NAME,
      'No file path provided. Usage: npx ts-node agent2.ts <file_path>'
    );
    console.log(JSON.stringify(envelope, null, 2));
    process.exit(1);
  }

  const filePath = path.resolve(rawPath);
  const fileName = path.basename(filePath);

  try {
    // 2. Validate the API key and create Gemini model
    const model = createGeminiModel();

    // 3. Read file content
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    const content  = fs.readFileSync(filePath, 'utf-8');
    const language = detectLanguage(filePath);

    // 4. Parse the file for functions and classes
    const wasmDir = path.join(__dirname, 'node_modules');
    const parsed  = await parse(content, language, wasmDir);

    // Collect all named symbols (functions + classes) into one flat array
    const functions: ParsedSymbol[] = (parsed.functions ?? []).map(f => ({
      name:        f.name,
      type:        'function' as const,
      params:      f.params,
      bodySnippet: f.bodySnippet,
      startLine:   f.startLine,
      endLine:     f.endLine,
    }));
    const classes: ParsedSymbol[] = (parsed.classes ?? []).map(c => ({
      name:      c.name,
      type:      'class' as const,
      startLine: c.startLine,
      endLine:   c.endLine,
    }));
    const allSymbols: ParsedSymbol[] = [...functions, ...classes];

    // 5. Format symbols into the prompt-friendly string
    const formattedSymbols = formatSymbols(allSymbols);

    // 6. Build prompt & call Gemini
    const prompt = buildPrompt(filePath, formattedSymbols);
    const result = await model.generateContent(prompt);
    const rawLlmResponse = result.response.text();

    // 7. Robustly extract JSON from the LLM response
    const llmData = extractJson(rawLlmResponse) as Partial<Agent2Data> &
      Record<string, unknown>;

    // 8. Build success envelope and print
    const output: Agent2Success = {
      agent:  'agent2',
      file:   fileName,
      status: 'success',
      data: {
        analysis: (llmData.analysis as AnalysisEntry[]) ?? [],
      },
    };

    console.log(JSON.stringify(output, null, 2));
  } catch (err: unknown) {
    const envelope = buildErrorEnvelope(AGENT_NAME, err);
    console.log(JSON.stringify(envelope, null, 2));
    process.exit(1);
  }
}

main();
