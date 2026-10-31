/**
 * src/extension.ts
 *
 * VS Code extension entry point for Webbit.
 * Registers two commands:
 *   • webbit.explain    – analyzes the active file via the LRU-cached AI pipeline
 *   • webbit.setApiKey  – prompts the user for their Google AI API key
 *
 * LLM provider: Google Gemini 3.5 Flash Lite (via @google/generative-ai)
 * API key storage: VS Code global settings under `webbit.aiApiKey`
 * Cache: SHA-256 content-keyed LRU cache (max 5 entries) in explanation/cache.ts
 */

import * as vscode from 'vscode';
import * as path   from 'path';
import * as dotenv from 'dotenv';

// Attempt to load .env from workspace silently if present
dotenv.config({ quiet: true });

import { explainFile } from './explanation/index';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Read the Google AI API key from VS Code settings first, then fall back to
 * the `GOOGLE_AI_API_KEY` environment variable.
 */
function getApiKey(): string {
  const fromConfig = vscode.workspace
    .getConfiguration('webbit')
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
 * webbit.explain
 *
 * Analyzes the currently active editor file and displays the AI output in a
 * new read-only Markdown preview panel.
 * Uses the SHA-256 LRU cache: repeated opens of the same unchanged file
 * are served instantly (⚡) without re-running the parser or LLM.
 */
async function cmdExplain(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('Webbit: Open a file first.');
    return;
  }

  const filePath = editor.document.uri.fsPath;
  const content  = editor.document.getText();
  const language = detectLanguage(editor.document.uri);
  const apiKey   = getApiKey();

  await vscode.window.withProgress(
    {
      location:    vscode.ProgressLocation.Notification,
      title:       'Webbit: Analyzing…',
      cancellable: false,
    },
    async () => {
      // Delegates to the cached orchestrator in explanation/index.ts
      const result = await explainFile({
        filePath,
        content,
        language,
        dependents: [],   // TODO: wire up reverse-dependency graph
        apiKey,
      });

      // Show a ⚡ indicator in the panel title when the result came from cache
      const cacheTag = result.fromCache ? ' ⚡ (cached)' : '';

      const panel = vscode.window.createWebviewPanel(
        'webbitResult',
        `Webbit: ${path.basename(filePath)}${cacheTag}`,
        vscode.ViewColumn.Beside,
        { enableScripts: false }
      );

      panel.webview.html = buildWebviewHtml(
        path.basename(filePath),
        result.fileLevel,
        result.functionLevel,
        result.fromCache
      );
    }
  );
}

/**
 * webbit.setApiKey
 *
 * Prompts the user for their Google AI API key and persists it to
 * `webbit.aiApiKey` in VS Code's global settings.
 */
async function cmdSetApiKey(): Promise<void> {
  const key = await vscode.window.showInputBox({
    prompt:         'Enter your Google AI API key (get one free at aistudio.google.com/apikey)',
    placeHolder:    'AQ...',
    password:       true,
    ignoreFocusOut: true,
  });
  if (key === undefined) { return; }  // user cancelled

  await vscode.workspace
    .getConfiguration('webbit')
    .update('aiApiKey', key, vscode.ConfigurationTarget.Global);

  vscode.window.showInformationMessage('Webbit: API key saved 🔑.');
}

// ─── Webview HTML Builder ─────────────────────────────────────────────────────

/**
 * Wrap the two Markdown strings in a minimal HTML page for the webview panel.
 * Content is HTML-escaped to prevent injection.
 */
function buildWebviewHtml(
  filename:      string,
  fileLevel:     string,
  functionLevel: string,
  fromCache:     boolean
): string {
  const esc = (s: string): string =>
    s.replace(/&/g, '&amp;')
     .replace(/</g, '&lt;')
     .replace(/>/g, '&gt;');

  const cacheNote = fromCache
    ? '<p class="cache-note">⚡ Served from cache — no LLM call was made.</p>'
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Webbit: ${esc(filename)}</title>
  <style>
    body        { font-family: var(--vscode-font-family); padding: 1.25rem 2rem; line-height: 1.6; }
    h1          { color: var(--vscode-titleBar-activeForeground); display: flex; align-items: center; gap: 0.5rem; }
    h2          { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: .35rem; margin-top: 1.5rem; }
    pre         { background: var(--vscode-textCodeBlock-background); padding: 1rem; border-radius: 6px; overflow-x: auto; white-space: pre-wrap; font-family: var(--vscode-editor-font-family); }
    code        { font-family: var(--vscode-editor-font-family); }
    .cache-note { color: var(--vscode-charts-green); font-size: 0.85em; font-style: italic; margin: 0.5rem 0; }
  </style>
</head>
<body>
  <h1>🕸️ Webbit: ${esc(filename)}</h1>
  ${cacheNote}
  <h2>🔍 File Role &amp; Architecture</h2>
  <pre>${esc(fileLevel)}</pre>
  <h2>⚙️ Function &amp; Class Analysis</h2>
  <pre>${esc(functionLevel)}</pre>
</body>
</html>`;
}

// ─── Extension Lifecycle ──────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('webbit.explain',   cmdExplain),
    vscode.commands.registerCommand('webbit.setApiKey', cmdSetApiKey)
  );
}

export function deactivate(): void {
  // Nothing to clean up.
}
