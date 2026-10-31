import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as dotenv from "dotenv";

// Attempt to load .env from workspace silently if present
dotenv.config({ quiet: true });

import { explainFile } from "./explanation/index";
import { buildDependencyGraph } from "./parser/dependencyParser";
import type { DependencyGraph } from "./parser/parserTypes";

type FileNode = {
  id: string;
  label: string;
  uri: vscode.Uri;
  imports: string[];
  exports: string[];
  lines: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getApiKey(): string {
  const fromConfig = vscode.workspace
    .getConfiguration("webbit")
    .get<string>("aiApiKey") ?? "";
  return fromConfig || process.env.GOOGLE_AI_API_KEY || "";
}

function detectLanguage(uri: vscode.Uri): string {
  const ext = path.extname(uri.fsPath).toLowerCase();
  const map: Record<string, string> = {
    ".ts": "TypeScript",
    ".tsx": "TypeScript (React)",
    ".js": "JavaScript",
    ".jsx": "JavaScript (React)",
    ".py": "Python",
    ".go": "Go",
    ".rs": "Rust",
  };
  return map[ext] ?? "Unknown";
}

function loadWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  extensionPath: string
): string {
  const nonce = [...Array(24)].map(() => Math.random().toString(36)[2]).join("");
  const htmlPath = path.join(extensionPath, "media", "webview.html");
  const rawHtml = fs.readFileSync(htmlPath, "utf8");
  const cytoscapeUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", "cytoscape.min.js")
  );

  return rawHtml
    .replace(/{{cspSource}}/g, webview.cspSource)
    .replace(/{{nonce}}/g, nonce)
    .replace(/{{cytoscapeUri}}/g, cytoscapeUri.toString());
}

// ─── Sidebar Webview Provider ─────────────────────────────────────────────────

class AgentHubView implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private files = new Map<string, FileNode>();
  private latestGraph?: DependencyGraph;

  constructor(private readonly context: vscode.ExtensionContext) {}

  public getFiles(): Map<string, FileNode> {
    return this.files;
  }

  public getGraph(): DependencyGraph | undefined {
    return this.latestGraph;
  }

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };
    view.webview.html = this.html(view.webview);

    view.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "scan") await this.scan();
      if (msg.type === "analyze") this.analyze(msg.id, false);
      if (msg.type === "deep") this.analyze(msg.id, true);
      if (msg.type === "open") {
        const f = this.files.get(msg.id);
        if (f) {
          const doc = await vscode.workspace.openTextDocument(f.uri);
          await vscode.window.showTextDocument(doc);
        }
      }
      if (msg.type === "openFullGraph") {
        openFullGraphPanel(this.context, this.files, this.latestGraph);
      }
    });

    this.scan();
  }

  private async scan() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      this.view?.webview.postMessage({
        type: "graph",
        nodes: [],
        edges: [],
        total: 0,
        edgeCount: 0,
      });
      return;
    }

    const projectRoot = workspaceFolders[0].uri.fsPath;

    const graph = await buildDependencyGraph(projectRoot, {
      ignore: ["dist", "out", "build", ".next", "coverage", "node_modules", ".git"],
    });
    this.latestGraph = graph;

    this.files.clear();
    for (const node of graph.nodes) {
      const absPath = path.join(projectRoot, node.id);
      const uri = vscode.Uri.file(absPath);
      const imports = graph.edges
        .filter((e) => e.source === node.id)
        .map((e) => e.target);

      let lines = 0;
      try {
        const content = fs.readFileSync(absPath, "utf8");
        lines = content.split("\n").length;
      } catch {
        lines = 0;
      }

      this.files.set(node.id, {
        id: node.id,
        label: path.basename(node.id),
        uri,
        imports,
        exports: [],
        lines,
      });
    }

    const nodes = [...this.files.values()].map((f) => ({
      id: f.id,
      label: f.label,
      lines: f.lines,
      imports: f.imports,
    }));

    this.view?.webview.postMessage({
      type: "graph",
      nodes,
      edges: graph.edges,
      total: this.files.size,
      edgeCount: graph.edges.length,
    });
  }

  private analyze(id: string, deep: boolean) {
    const f = this.files.get(id);
    if (!f) return;

    const outgoing = f.imports;
    const incoming = [...this.files.values()]
      .filter((x) => x.imports.includes(id))
      .map((x) => x.id);

    const doc = vscode.workspace.fs.readFile(f.uri);

    void doc.then(async (bytes) => {
      const source = bytes.toString();
      const funcs = [
        ...source.matchAll(
          /\b(?:function\s+([\w$]+)|(?:const|let)\s+([\w$]+)\s*=\s*(?:async\s*)?\()/g
        ),
      ].map((m) => m[1] || m[2]);

      const summary = `${f.label} contains ${f.lines} lines and ${funcs.length} detected function declarations. It imports ${outgoing.length} project file(s) and is imported by ${incoming.length} file(s).`;

      let aiFileLevel = "";
      let aiFuncLevel = "";
      let aiError = "";
      let fromCache = false;

      if (deep) {
        const apiKey = getApiKey();
        if (!apiKey) {
          aiError =
            '⚠️ No API key set. Run "Webbit: Set API Key" from the Command Palette (Ctrl+Shift+P).';
        } else {
          this.view?.webview.postMessage({
            type: "analysis",
            id,
            deep,
            summary,
            functions: funcs,
            imports: outgoing,
            importedBy: incoming,
            exports: f.exports,
            aiFileLevel: "⏳ Agent 1 analysing role & architecture…",
            aiFuncLevel: "⏳ Agent 2 analysing functions & classes…",
            aiError: "",
            fromCache: false,
          });

          try {
            const aiResult = await explainFile({
              filePath: f.uri.fsPath,
              content: source,
              language: detectLanguage(f.uri),
              dependents: incoming,
              apiKey,
            });
            aiFileLevel = aiResult.fileLevel;
            aiFuncLevel = aiResult.functionLevel;
            fromCache = aiResult.fromCache;
          } catch (err: unknown) {
            aiError = `❌ AI error: ${
              err instanceof Error ? err.message : String(err)
            }`;
            console.error("Webbit AI deep analysis error:", err);
          }
        }
      }

      this.view?.webview.postMessage({
        type: "analysis",
        id,
        deep,
        summary,
        functions: funcs,
        imports: outgoing,
        importedBy: incoming,
        exports: f.exports,
        aiFileLevel,
        aiFuncLevel,
        aiError,
        fromCache,
      });
    });
  }

  private html(webview: vscode.Webview): string {
    return loadWebviewHtml(webview, this.context.extensionUri, this.context.extensionPath);
  }
}

// ─── Fullscreen Neural Graph Panel ──────────────────────────────────────────

let fullGraphPanel: vscode.WebviewPanel | undefined;

function openFullGraphPanel(
  context: vscode.ExtensionContext,
  files: Map<string, FileNode>,
  graphData?: DependencyGraph
) {
  if (fullGraphPanel) {
    fullGraphPanel.reveal(vscode.ViewColumn.One);
    if (graphData) {
      fullGraphPanel.webview.postMessage({
        type: "graph",
        nodes: graphData.nodes,
        edges: graphData.edges,
        total: graphData.nodes.length,
        edgeCount: graphData.edges.length,
      });
    }
    return;
  }

  fullGraphPanel = vscode.window.createWebviewPanel(
    "webbitFullGraph",
    "🕸️ Webbit: Neural Spider Web",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [context.extensionUri],
    }
  );

  fullGraphPanel.onDidDispose(() => {
    fullGraphPanel = undefined;
  });

  fullGraphPanel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.type === "open") {
      const f = files.get(msg.id);
      if (f) {
        const doc = await vscode.workspace.openTextDocument(f.uri);
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
      }
    }
    if (msg.type === "scan" || msg.type === "requestData") {
      if (graphData) {
        fullGraphPanel?.webview.postMessage({
          type: "graph",
          nodes: graphData.nodes,
          edges: graphData.edges,
          total: graphData.nodes.length,
          edgeCount: graphData.edges.length,
        });
      }
    }
  });

  fullGraphPanel.webview.html = buildFullGraphHtml(fullGraphPanel.webview, context);

  if (graphData) {
    fullGraphPanel.webview.postMessage({
      type: "graph",
      nodes: graphData.nodes,
      edges: graphData.edges,
      total: graphData.nodes.length,
      edgeCount: graphData.edges.length,
    });
  }
}

function buildFullGraphHtml(
  webview: vscode.Webview,
  context: vscode.ExtensionContext
): string {
  return loadWebviewHtml(webview, context.extensionUri, context.extensionPath);
}

// ─── Command Handlers ─────────────────────────────────────────────────────────

async function cmdExplain(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage("Webbit: Open a file first.");
    return;
  }

  const filePath = editor.document.uri.fsPath;
  const content = editor.document.getText();
  const language = detectLanguage(editor.document.uri);
  const apiKey = getApiKey();

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Webbit: Weaving analysis…",
      cancellable: false,
    },
    async () => {
      const result = await explainFile({
        filePath,
        content,
        language,
        dependents: [],
        apiKey,
      });

      const cacheTag = result.fromCache ? " ⚡ (cached)" : "";
      const panel = vscode.window.createWebviewPanel(
        "webbitResult",
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

async function cmdSetApiKey(): Promise<void> {
  const key = await vscode.window.showInputBox({
    prompt: "Enter your Google AI API key (get one free at aistudio.google.com/apikey)",
    placeHolder: "AQ...",
    password: true,
    ignoreFocusOut: true,
  });
  if (key === undefined) return;

  await vscode.workspace
    .getConfiguration("webbit")
    .update("aiApiKey", key, vscode.ConfigurationTarget.Global);

  vscode.window.showInformationMessage("Webbit: API key saved 🔑.");
}

function buildWebviewHtml(
  filename: string,
  fileLevel: string,
  functionLevel: string,
  fromCache: boolean
): string {
  const esc = (s: string): string =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const cacheNote = fromCache
    ? '<p class="cache-note">⚡ Served from cache — no LLM call was made.</p>'
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Webbit: ${esc(filename)}</title>
  <style>
    body        { font-family: 'Inter', system-ui, sans-serif; padding: 1.25rem 2rem; line-height: 1.6; background: #0a0a0f; color: #f8f9fa; }
    h1          { color: #00f5ff; display: flex; align-items: center; gap: 0.5rem; font-family: 'Orbitron', sans-serif; }
    h2          { border-bottom: 1px solid rgba(0, 245, 255, 0.25); padding-bottom: .35rem; margin-top: 1.5rem; color: #b026ff; font-family: 'Rajdhani', sans-serif; }
    pre         { background: rgba(26, 26, 46, 0.85); border: 1px solid rgba(0, 245, 255, 0.3); padding: 1rem; border-radius: 8px; overflow-x: auto; white-space: pre-wrap; font-family: 'Fira Code', monospace; box-shadow: 0 0 15px rgba(0, 245, 255, 0.1); }
    code        { font-family: 'Fira Code', monospace; }
    .cache-note { color: #39ff14; font-size: 0.85em; font-style: italic; margin: 0.5rem 0; text-shadow: 0 0 8px rgba(57, 255, 20, 0.4); }
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
  const provider = new AgentHubView(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("agenthub.sidebar", provider),
    vscode.commands.registerCommand("agenthub.refresh", () =>
      vscode.commands.executeCommand("workbench.view.extension.agenthub")
    ),
    vscode.commands.registerCommand("webbit.explain", cmdExplain),
    vscode.commands.registerCommand("webbit.setApiKey", cmdSetApiKey),
    vscode.commands.registerCommand("webbit.openFullGraph", () =>
      openFullGraphPanel(context, provider.getFiles(), provider.getGraph())
    )
  );
}

export function deactivate(): void {}
