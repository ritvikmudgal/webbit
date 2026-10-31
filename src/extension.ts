/**
 * src/extension.ts
 *
 * VS Code extension entry point for CodeIntel.
 * Registers two commands:
 *   • codeintel.explain    — analyzes the active file with the two AI agents
 *   • codeintel.setApiKey  — prompts the user for their Google AI API key
 *
 * LLM provider: Google Gemini 3.5 Flash Lite (via @google/generative-ai)
 * API key storage: VS Code global settings under `codeintel.aiApiKey`
 */

import * as vscode from 'vscode';
import * as path   from 'path';
import * as dotenv from 'dotenv';

// Attempt to load .env from workspace silently if present
dotenv.config({ quiet: true });

import { parse }               from './parser/tsParser';
import { buildProjectContext } from './explanation/contextBuilder';
import { runAgents }           from './explanation/agents';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Read the Google AI API key from VS Code settings first, then fall back to
 * the `GOOGLE_AI_API_KEY` environment variable.
 */
function getApiKey(): string {
  const fromConfig = vscode.workspace
    .getConfiguration('codeintel')
    .get<string>('aiApiKey') ?? '';
  return fromConfig || process.env.GOOGLE_AI_API_KEY || '';
}

/**
 * Map a VS Code file URI to a human-readable language name that the parser
 * understands.
 */
function detectLanguage(uri: vscode.Uri): string {
  const ext = path.extname(uri.fsPath).toLowerCase();
  const map: Record<string, string> = {
    '.ts':  'TypeScript',
    '.tsx': 'TypeScript (React)',
    '.js':  'JavaScript',
    '.jsx': 'JavaScript (React)',
    '.py':  'Python',
    '.go':  'Go',
    '.rs':  'Rust',
  };
  return map[ext] ?? 'Unknown';
}

// ─── Commands ─────────────────────────────────────────────────────────────────

/**
 * codeintel.explain
 *
 * Analyzes the currently active editor file and displays the AI output in a
 * new read-only Markdown preview panel.
 */
async function cmdExplain(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('CodeIntel: Open a file first.');
    return;
  }

  const filePath = editor.document.uri.fsPath;
  const content  = editor.document.getText();
  const language = detectLanguage(editor.document.uri);
  const apiKey   = getApiKey();

  await vscode.window.withProgress(
    {
      location:  vscode.ProgressLocation.Notification,
      title:     'CodeIntel: Analyzing…',
      cancellable: false,
    },
    async () => {
      // 1. Parse the file (tree-sitter or regex stub)
      const wasmDir     = path.join(__dirname, '..', 'node_modules');
      const parseResult = await parse(content, language, wasmDir);

      // 2. Build project-wide context (package.json, README snippet)
      const projectContext = buildProjectContext(filePath);

      // 3. Run both AI agents in parallel
      const output = await runAgents({
        filePath,
        parseResult,
        projectContext,
        dependents: [],   // TODO: wire up reverse-dependency graph
        apiKey,
      });

      // 4. Display the results in a new Markdown panel
      const panel = vscode.window.createWebviewPanel(
        'codeIntelResult',
        `CodeIntel: ${path.basename(filePath)}`,
        vscode.ViewColumn.Beside,
        { enableScripts: false }
      );

      panel.webview.html = buildWebviewHtml(
        path.basename(filePath),
        output.fileLevel,
        output.functionLevel
      );
    }
  );
}

/**
 * codeintel.setApiKey
 *
 * Prompts the user for their Google AI API key and persists it to
 * `codeintel.aiApiKey` in VS Code's global settings.
 */
async function cmdSetApiKey(): Promise<void> {
  const key = await vscode.window.showInputBox({
    prompt:          'Enter your Google AI API key (get one free at aistudio.google.com)',
    placeHolder:     'AIza...',
    password:        true,
    ignoreFocusOut:  true,
  });
  if (key === undefined) { return; }  // user cancelled

  await vscode.workspace
    .getConfiguration('codeintel')
    .update('aiApiKey', key, vscode.ConfigurationTarget.Global);

  vscode.window.showInformationMessage('CodeIntel: API key saved ✅');
}

// ─── Webview HTML Builder ─────────────────────────────────────────────────────

/**
 * Wrap the two Markdown strings in a minimal HTML page for the webview panel.
 * Content is HTML-escaped to prevent injection.
 */
function buildWebviewHtml(
  filename:      string,
  fileLevel:     string,
  functionLevel: string
): string {
  const esc = (s: string): string =>
    s.replace(/&/g, '&amp;')
     .replace(/</g, '&lt;')
     .replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CodeIntel: ${esc(filename)}</title>
  <style>
    body  { font-family: var(--vscode-font-family); padding: 1rem 2rem; }
    h1    { color: var(--vscode-titleBar-activeForeground); }
    h2    { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: .25rem; }
    pre   { background: var(--vscode-textCodeBlock-background); padding: .5rem; border-radius: 4px; overflow-x: auto; }
    code  { font-family: var(--vscode-editor-font-family); }
  </style>
</head>
<body>
  <h1>📄 ${esc(filename)}</h1>
  <h2>🏛️ File Role &amp; Architecture</h2>
  <pre>${esc(fileLevel)}</pre>
  <h2>🔬 Function &amp; Class Analysis</h2>
  <pre>${esc(functionLevel)}</pre>
</body>
</html>`;
}

// ─── Extension Lifecycle ──────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('codeintel.explain',   cmdExplain),
    vscode.commands.registerCommand('codeintel.setApiKey', cmdSetApiKey)
  );
}

export function deactivate(): void {
  // Nothing to clean up.
}
