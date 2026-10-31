import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { ParseResult, FunctionInfo, ClassInfo } from '../parser/tsParser';
import { ProjectContext } from './contextBuilder';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface AgentInput {
  filePath: string;
  parseResult: ParseResult;
  projectContext: ProjectContext;
  dependents: string[];
  apiKey: string;
}

export interface AgentOutput {
  fileLevel: string;
  functionLevel: string;
}

// ─── Model Configuration ──────────────────────────────────────────────────────
// Gemini 3.5 Flash Lite — best free-tier model: 15 RPM · 250K TPM · 500 RPD
const MODEL_NAME = 'gemini-3.5-flash-lite';

// Other free-tier options (uncomment to switch):
// const MODEL_NAME = 'gemini-3.1-flash-lite'; // 15 RPM · 250K TPM · 500 RPD (same limits, older)
// const MODEL_NAME = 'gemini-2.5-flash-lite'; // 10 RPM · 250K TPM · 20 RPD
// const MODEL_NAME = 'gemini-2.5-flash';       //  5 RPM · 250K TPM · 20 RPD

let cachedModel: GenerativeModel | null = null;
let cachedKey = '';

function getModel(apiKey: string): GenerativeModel {
  if (cachedModel && cachedKey === apiKey) {
    return cachedModel;
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  cachedModel = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2048,
    },
  });
  cachedKey = apiKey;
  return cachedModel;
}

// ─── Prompt Builders ──────────────────────────────────────────────────────────
function buildFileLevelPrompt(input: AgentInput): string {
  const { filePath, parseResult, projectContext, dependents } = input;
  const { projectName, dependencies, readmeSnippet } = projectContext;
  const deps = dependencies.length > 0 ? dependencies.slice(0, 15).join(', ') : 'none listed';
  const importedBy = dependents.length > 0 ? dependents.join(', ') : 'nothing (entry point or unused)';
  const fileImports = parseResult.imports.length > 0 ? parseResult.imports.join(', ') : 'none';

  return `You are a Software Architect. Explain the role of this file concisely.

PROJECT: ${projectName}
DEPENDENCIES: ${deps}
README SNIPPET: ${readmeSnippet || 'N/A'}
FILE PATH: ${filePath}
IMPORTED BY: ${importedBy}
FILE IMPORTS: ${fileImports}

Respond in Markdown with exactly these sections:
## Role & Purpose
What is this file responsible for?

## Architectural Fit
How does it fit into the overall project architecture?

## Major Components
List the main classes and functions exported by this file.

Keep the entire response under 150 words. Be precise and technical.`;
}

function formatFunctions(fns: FunctionInfo[]): string {
  return fns.map(f =>
    `### Function: ${f.name}
Params: ${f.params}
Lines: ${f.startLine}–${f.endLine}
Body snippet:
\`\`\`
${f.bodySnippet}
\`\`\``
  ).join('\n');
}

function formatClasses(cls: ClassInfo[]): string {
  return cls.map(c => {
    const methodList = c.methods.map(m =>
      `  - ${m.name}${m.params} (lines ${m.startLine}–${m.endLine}):
\`\`\`
${m.bodySnippet}
\`\`\``
    ).join('\n');
    return `### Class: ${c.name} (lines ${c.startLine}–${c.endLine})
Methods:
${methodList}`;
  }).join('\n');
}

function buildFunctionLevelPrompt(input: AgentInput): string {
  const { filePath, parseResult } = input;
  const fnSection = formatFunctions(parseResult.functions);
  const clsSection = formatClasses(parseResult.classes);
  const codeSection = [fnSection, clsSection].filter(Boolean).join('\n---\n');

  return `You are a Senior Code Reviewer. Analyze each function and class in deep technical detail.

FILE: ${filePath}

${codeSection || 'No functions or classes detected.'}

For EACH function and class, produce a Markdown section:
## [Name]
**Purpose:** What does it do and why does it exist?
**Inputs/Outputs:** Parameter types and return value.
**Internal Mechanics:** How does it work? Look for: 'new' keyword = dynamic allocation, '@media' = responsive CSS, 'onclick'/'addEventListener' = event handlers, constructor/destructor patterns, async/await = async I/O.
**Dependencies:** What other functions or modules does it call?

Rules:
- Infer patterns only from visible code evidence. Do not hallucinate.
- Keep each entry under 100 words.
- If no functions exist, write a brief structural analysis of the file instead.`;
}

// ─── Agent Runners ────────────────────────────────────────────────────────────
async function runAgent1(input: AgentInput, model: GenerativeModel): Promise<string> {
  try {
    const result = await model.generateContent(buildFileLevelPrompt(input));
    return result.response.text() || '⚠️ No response from Agent 1.';
  } catch (err) {
    return `⚠️ Agent 1 error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function runAgent2(input: AgentInput, model: GenerativeModel): Promise<string> {
  try {
    const result = await model.generateContent(buildFunctionLevelPrompt(input));
    return result.response.text() || '⚠️ No response from Agent 2.';
  } catch (err) {
    return `⚠️ Agent 2 error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────
export async function runAgents(input: AgentInput): Promise<AgentOutput> {
  if (!input.apiKey) {
    return {
      fileLevel: '⚠️ No API key set. Run **Webbit: Set API Key** first.',
      functionLevel: '⚠️ No API key set.',
    };
  }

  const model = getModel(input.apiKey);

  const [fileLevel, functionLevel] = await Promise.all([
    runAgent1(input, model),
    runAgent2(input, model),
  ]);

  return { fileLevel, functionLevel };
}
