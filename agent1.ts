/**
 * agent1.ts — File Role & Architecture Analyzer
 *
 * CLI Usage:
 *   npx ts-node agent1.ts <absolute_or_relative_file_path>
 *
 * Output (stdout):
 *   A single, valid JSON object — parseable by JSON.parse() — with this shape:
 *   {
 *     "agent":  "agent1",
 *     "file":   "<basename>",
 *     "status": "success",
 *     "data": {
 *       "role_and_purpose":   "...",
 *       "architectural_fit":  "...",
 *       "major_components":   ["..."]
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

interface Agent1Data {
  role_and_purpose:  string;
  architectural_fit: string;
  major_components:  string[];
}

interface Agent1Success {
  agent:  'agent1';
  file:   string;
  status: 'success';
  data:   Agent1Data;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPrompt(
  filePath: string,
  language: string,
  imports: string[],
  exports: string[],
  content: string
): string {
  return `You are a Principal Software Architect. Analyze this file's role in the project.

FILE PATH: ${filePath}
LANGUAGE: ${language}
IMPORTS: ${imports.length > 0 ? imports.join(', ') : '(none detected)'}
EXPORTS: ${exports.length > 0 ? exports.join(', ') : '(none detected)'}

FILE CONTENT:
${content}

Respond ONLY with a valid JSON object (no markdown code blocks, no extra text) matching this exact schema:
{
  "role_and_purpose": "1-2 sentences on what this file is responsible for.",
  "architectural_fit": "How it connects upstream/downstream components.",
  "major_components": ["List", "of", "main", "exports"]
}
Keep it concise and technical. Output raw JSON only.`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const AGENT_NAME = 'agent1';

  // 1. Validate CLI argument
  const rawPath = process.argv[2];
  if (!rawPath) {
    const envelope = buildErrorEnvelope(
      AGENT_NAME,
      'No file path provided. Usage: npx ts-node agent1.ts <file_path>'
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

    // 4. Parse the file for imports / exports
    const wasmDir = path.join(__dirname, 'node_modules');
    const parsed  = await parse(content, language, wasmDir);

    const imports: string[] = parsed.imports ?? [];
    const exports: string[] = parsed.exports ?? [];

    // 5. Build prompt & call Gemini
    const prompt = buildPrompt(filePath, language, imports, exports, content);
    const result = await model.generateContent(prompt);
    const rawLlmResponse = result.response.text();

    // 6. Robustly extract JSON from the LLM response
    const llmData = extractJson(rawLlmResponse) as Partial<Agent1Data> &
      Record<string, unknown>;

    // 7. Build success envelope and print
    const output: Agent1Success = {
      agent:  'agent1',
      file:   fileName,
      status: 'success',
      data: {
        role_and_purpose:  (llmData.role_and_purpose  as string) ?? '',
        architectural_fit: (llmData.architectural_fit as string) ?? '',
        major_components:  (llmData.major_components  as string[]) ?? [],
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
