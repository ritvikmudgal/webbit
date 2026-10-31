<<<<<<< HEAD
import * as vscode from "vscode";
import * as path from "path";

type FileNode = { id: string; label: string; uri: vscode.Uri; imports: string[]; exports: string[]; lines: number; };
class AgentHubView implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private files = new Map<string, FileNode>();
  constructor(private readonly context: vscode.ExtensionContext) {}
  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.context.extensionUri] };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage(async msg => {
      if (msg.type === "scan") await this.scan();
      if (msg.type === "analyze") this.analyze(msg.id, false);
      if (msg.type === "deep") this.analyze(msg.id, true);
      if (msg.type === "open") {
        const f = this.files.get(msg.id);
        if (f) { const doc = await vscode.workspace.openTextDocument(f.uri); await vscode.window.showTextDocument(doc); }
      }
    });
    this.scan();
  }
  private async scan() {
    const uris = await vscode.workspace.findFiles("**/*.{ts,tsx,js,jsx,mjs,cjs}", "**/{node_modules,.git,out,dist,build}/**", 700);
    this.files.clear();
    for (const uri of uris) {
      const rel = vscode.workspace.asRelativePath(uri);
      const text = (await vscode.workspace.fs.readFile(uri)).toString();
      const imports = [...text.matchAll(/(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']|require\(["']([^"']+)["']\)/g)]
        .map(m => m[1] || m[2]).filter(Boolean);
      const exports = [...text.matchAll(/\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+([\w$]+)/g)].map(m=>m[1]);
      this.files.set(rel,{id:rel,label:path.basename(rel),uri,imports,exports,lines:text.split(/\r?\n/).length});
    }
    const nodes = [...this.files.values()].map(f => ({id:f.id,label:f.label,lines:f.lines,imports:this.resolveImports(f)}));
    this.view?.webview.postMessage({type:"graph",nodes,total:this.files.size,edges:nodes.reduce((n,x)=>n+x.imports.length,0)});
  }
  private resolveImports(file: FileNode): string[] {
    return file.imports.map(spec => {
      if (!spec.startsWith(".")) return "";
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(file.id),spec));
      return [base,base+".ts",base+".tsx",base+".js",base+".jsx",base+"/index.ts",base+"/index.tsx"].find(x=>this.files.has(x)) || "";
    }).filter(Boolean);
  }
  private analyze(id: string, deep: boolean) {
    const f = this.files.get(id); if (!f) return;
    const incoming = [...this.files.values()].filter(x=>this.resolveImports(x).includes(id)).map(x=>x.id);
    const outgoing = this.resolveImports(f);
    const doc = vscode.workspace.fs.readFile(f.uri);
    void doc.then(bytes=>{
      const source=bytes.toString();
      const funcs=[...source.matchAll(/\b(?:function\s+([\w$]+)|(?:const|let)\s+([\w$]+)\s*=\s*(?:async\s*)?\()/g)].map(m=>m[1]||m[2]);
      const summary = `${f.label} contains ${f.lines} lines and ${funcs.length} detected function declarations. It imports ${outgoing.length} project file(s) and is imported by ${incoming.length} file(s).`;
      this.view?.webview.postMessage({type:"analysis",id,deep,summary,functions:funcs,imports:outgoing,importedBy:incoming,exports:f.exports});
    });
  }
  private html(webview: vscode.Webview): string {
    const nonce = [...Array(24)].map(()=>Math.random().toString(36)[2]).join("");
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>
      :root{color-scheme:dark}*{box-sizing:border-box}body{padding:0 12px 14px;font:12px var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-sideBar-background)}
      .brand{display:flex;align-items:center;gap:10px;padding:13px 0 15px;border-bottom:1px solid var(--vscode-panel-border);font-weight:700;font-size:14px}.mark{width:32px;height:32px;border-radius:9px;background:linear-gradient(145deg,#292344,#171526);border:1px solid #7165b7;display:grid;place-items:center;color:#c9c2ff;box-shadow:0 0 14px #7667c533}.mark svg{width:23px;height:23px;display:block}.brand-copy{display:flex;flex-direction:column;gap:2px}.brand-copy small{font-size:8px;letter-spacing:1.25px;color:var(--vscode-descriptionForeground);font-weight:600}.home-intro{padding:15px 0 12px}.home-intro h2{font-size:15px;line-height:1.35;margin:0 0 5px;font-weight:650}.home-intro p{margin:0;color:var(--vscode-descriptionForeground);font-size:11px;line-height:1.55}.workspace-card{display:flex;align-items:center;gap:8px;padding:9px 10px;margin:3px 0 16px;border:1px solid var(--vscode-panel-border);border-radius:7px;background:var(--vscode-editor-background)}.status-dot{width:7px;height:7px;border-radius:50%;background:#d5a85c;box-shadow:0 0 8px #d5a85c66}.workspace-card strong{font-size:10px;font-weight:600}.workspace-card small{display:block;color:var(--vscode-descriptionForeground);font-size:9px;margin-top:2px}.section-heading{font-size:9px;letter-spacing:1.1px;text-transform:uppercase;color:var(--vscode-descriptionForeground);margin:0 0 7px}.choice{position:relative;display:flex;align-items:center;gap:10px;width:100%;padding:11px;margin:7px 0;background:var(--vscode-sideBarSectionHeader-background);color:var(--vscode-foreground);border:1px solid var(--vscode-panel-border);border-radius:8px;text-align:left;cursor:pointer;transition:border-color .15s,background .15s}.choice:before{content:"";position:absolute;left:-1px;top:9px;bottom:9px;width:2px;border-radius:2px;background:#897cff;opacity:0}.choice:hover,.choice.active{border-color:#8277ff;background:var(--vscode-list-hoverBackground)}.choice:hover:before{opacity:1}.ico{width:32px;height:32px;flex:0 0 32px;border-radius:8px;background:#302b4d;color:#c9c2ff;display:grid;place-items:center;font-size:17px}.choice b{display:block;font-size:11px;font-weight:650}.choice small{display:block;color:var(--vscode-descriptionForeground);margin-top:4px;font-size:9px;line-height:1.4}.choice .arrow{margin-left:auto;color:var(--vscode-descriptionForeground);font-size:14px}.home-metrics{display:flex;gap:7px;margin:13px 0 3px}.home-metric{flex:1;border-top:1px solid var(--vscode-panel-border);padding:9px 2px 3px}.home-metric strong{display:block;font-size:14px;color:var(--vscode-foreground);font-weight:650}.home-metric small{font-size:8px;color:var(--vscode-descriptionForeground);letter-spacing:.6px}
      .eyebrow{margin:17px 0 8px;color:var(--vscode-descriptionForeground);font-size:10px;letter-spacing:1.1px;text-transform:uppercase}.choice{display:flex;align-items:center;gap:10px;width:100%;padding:11px;margin:6px 0;background:var(--vscode-button-secondaryBackground);color:var(--vscode-foreground);border:1px solid var(--vscode-panel-border);border-radius:7px;text-align:left;cursor:pointer}.choice:hover,.choice.active{border-color:#8277ff;background:var(--vscode-list-hoverBackground)}.ico{width:28px;height:28px;border-radius:6px;background:#39345f;color:#c9c2ff;display:grid;place-items:center;font-size:16px}.choice b{display:block;font-size:12px}.choice small{display:block;color:var(--vscode-descriptionForeground);margin-top:3px;font-size:10px}
      button{font:inherit}.hidden{display:none!important}.back{border:0;background:none;color:var(--vscode-textLink-foreground);padding:12px 0;cursor:pointer}.title{font-size:14px;font-weight:700;margin:4px 0}.desc{color:var(--vscode-descriptionForeground);font-size:11px;line-height:1.5;margin:5px 0 13px}select,.action{width:100%;padding:8px;border-radius:5px;border:1px solid var(--vscode-dropdown-border);background:var(--vscode-dropdown-background);color:var(--vscode-dropdown-foreground);margin:5px 0 10px}.action{border:0;background:var(--vscode-button-background);color:var(--vscode-button-foreground);cursor:pointer}.action:hover{background:var(--vscode-button-hoverBackground)}.secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:1px solid var(--vscode-panel-border)}
      .stats{display:flex;gap:6px;margin:12px 0}.stat{flex:1;padding:8px 5px;border:1px solid var(--vscode-panel-border);border-radius:6px;text-align:center}.stat strong{display:block;font-size:16px;color:#aaa1ff}.stat small{color:var(--vscode-descriptionForeground);font-size:9px}.graph{height:220px;border:1px solid var(--vscode-panel-border);border-radius:8px;margin:10px 0;position:relative;overflow:hidden;background:radial-gradient(circle at 50% 50%,#292640 0,transparent 65%),var(--vscode-editor-background)}
      svg{width:100%;height:100%}.edge{stroke:#7469b9;stroke-width:1.2;opacity:.55}.node{cursor:pointer}.node circle{fill:#29264a;stroke:#9b8fff;stroke-width:1.5}.node text{fill:var(--vscode-foreground);font-size:9px;text-anchor:middle}.node.selected circle{fill:#7769df;stroke:#d5d0ff;stroke-width:2.5}.legend{font-size:10px;color:var(--vscode-descriptionForeground);display:flex;justify-content:space-between}.result{border:1px solid var(--vscode-panel-border);border-radius:7px;padding:10px;margin-top:10px}.result h4{margin:0 0 5px;font-size:12px}.muted{color:var(--vscode-descriptionForeground);font-size:10px;line-height:1.6}.chip{display:inline-block;margin:3px 3px 0 0;padding:3px 6px;border-radius:10px;background:#39345f;color:#d4ceff;font-size:9px}.filelist{font-size:10px;line-height:1.8;overflow-wrap:anywhere}.footer{border-top:1px solid var(--vscode-panel-border);margin-top:16px;padding-top:10px;color:var(--vscode-descriptionForeground);font-size:10px}
    </style></head><body><div class="brand"><span class="mark"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round"><circle cx="16" cy="16" r="3"/><circle cx="16" cy="16" r="7.5"/><circle cx="16" cy="16" r="12"/><path d="M16 4v9M16 19v9M4 16h9M19 16h9M7.5 7.5l6 6M18.5 18.5l6 6M24.5 7.5l-6 6M13.5 18.5l-6 6"/><path d="M16 1.8 18 4M30.2 16 28 18M16 30.2 14 28M1.8 16 4 14"/></svg></span><span class="brand-copy">AgentHub<small>CODEBASE INTELLIGENCE</small></span><span style="margin-left:auto;color:var(--vscode-descriptionForeground);font-size:9px">● LOCAL</span></div>
    <section id="home"><div class="home-intro"><h2>Understand your codebase.</h2><p>Explore file relationships and uncover how your project works.</p></div><div class="workspace-card"><span class="status-dot"></span><span><strong>Workspace analysis</strong><small id="workspaceStatus">Waiting for a project scan</small></span></div><div class="section-heading">Explore tools</div><button class="choice" data-go="dependency"><span class="ico">⌘</span><span><b>Dependency Web</b><small>See how files connect across your project</small></span><span class="arrow">›</span></button><button class="choice" data-go="analysis"><span class="ico">ƒ</span><span><b>File Analysis</b><small>Understand file purpose, structure and usage</small></span><span class="arrow">›</span></button><div class="home-metrics"><div class="home-metric"><strong id="homeFiles">—</strong><small>FILES FOUND</small></div><div class="home-metric"><strong id="homeLinks">—</strong><small>DEPENDENCIES</small></div></div></section>
    <section id="dependency" class="hidden"><button class="back" data-home>← All tools</button><div class="title">Dependency Web</div><p class="desc">A live map of local imports and exports. Select a node to inspect its file.</p><button id="scan" class="action">↻ Scan workspace</button><div class="stats"><div class="stat"><strong id="fileCount">—</strong><small>FILES</small></div><div class="stat"><strong id="edgeCount">—</strong><small>LINKS</small></div></div><div class="graph"><svg id="network" viewBox="0 0 280 220" role="img" aria-label="Dependency network"></svg></div><div class="legend"><span>◉ Select a node</span><span id="selectedNode">No file selected</span></div><div id="nodeDetail" class="result hidden"></div></section>
    <section id="analysis" class="hidden"><button class="back" data-home>← All tools</button><div class="title">File Analysis</div><p class="desc">Choose a workspace file for a quick structural overview.</p><select id="fileSelect"><option value="">Scan workspace first…</option></select><button id="quick" class="action">Analyze file</button><div id="quickResult" class="result hidden"></div><button id="deep" class="action secondary hidden">✦ Run deep analysis</button><div id="deepResult" class="result hidden"></div></section>
    <div class="footer">Spider-web inspired code mapping · Local static analysis</div>
    <script nonce="${nonce}">
    const vscode=acquireVsCodeApi();let nodes=[];let selected=null;const $=id=>document.getElementById(id);
    function page(id){["home","dependency","analysis"].forEach(x=>$(x).classList.toggle("hidden",x!==id))}
    document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>page(b.dataset.go));document.querySelectorAll("[data-home]").forEach(b=>b.onclick=()=>page("home"));
    $("scan").onclick=()=>vscode.postMessage({type:"scan"});
    function renderGraph(){const svg=$("network");svg.innerHTML="";if(!nodes.length){svg.innerHTML='<text x="140" y="110" text-anchor="middle" fill="#999" font-size="10">Scan workspace to build your network</text>';return}
      const shown=nodes.slice(0,32),cx=140,cy=110,coords={};shown.forEach((n,i)=>{const a=(Math.PI*2*i/shown.length)-Math.PI/2,r=shown.length<5?48:82;coords[n.id]={x:cx+Math.cos(a)*r,y:cy+Math.sin(a)*r};});
      const byId=new Set(shown.map(n=>n.id));shown.forEach(n=>n.imports.filter(x=>byId.has(x)).forEach(to=>{const a=coords[n.id],b=coords[to];svg.insertAdjacentHTML("beforeend",'<line class="edge" x1="'+a.x+'" y1="'+a.y+'" x2="'+b.x+'" y2="'+b.y+'"/>')}));
      shown.forEach(n=>{const p=coords[n.id];const g=document.createElementNS("http://www.w3.org/2000/svg","g");g.setAttribute("class","node"+(selected===n.id?" selected":""));g.innerHTML='<circle cx="'+p.x+'" cy="'+p.y+'" r="8"/><text x="'+p.x+'" y="'+(p.y+21)+'">'+n.label.replace(/[&<>]/g,"").slice(0,14)+'</text>';g.onclick=()=>selectNode(n.id);svg.appendChild(g)});
    }
    function selectNode(id){selected=id;const n=nodes.find(x=>x.id===id);if(!n)return;renderGraph();$("selectedNode").textContent=n.label;$("nodeDetail").classList.remove("hidden");$("nodeDetail").innerHTML='<h4>'+n.label+'</h4><div class="muted">'+n.lines+' lines · '+n.imports.length+' outgoing links</div><button class="action secondary" id="openFile">Open file in editor</button>'; $("openFile").onclick=()=>vscode.postMessage({type:"open",id});}
    window.addEventListener("message",e=>{const m=e.data;if(m.type==="graph"){nodes=m.nodes;$("fileCount").textContent=m.total;$("edgeCount").textContent=m.edges;$("homeFiles").textContent=m.total;$("homeLinks").textContent=m.edges;$("workspaceStatus").textContent=m.total+" project files scanned";renderGraph();const sel=$("fileSelect");sel.innerHTML="";nodes.forEach(n=>{const o=document.createElement("option");o.value=n.id;o.textContent=n.id;sel.appendChild(o)});}});
    $("quick").onclick=()=>{const id=$("fileSelect").value;if(id)vscode.postMessage({type:"analyze",id})};$("deep").onclick=()=>{const id=$("fileSelect").value;if(id)vscode.postMessage({type:"deep",id})};
    window.addEventListener("message",e=>{const m=e.data;if(m.type!=="analysis")return;const box=m.deep?$("deepResult"):$("quickResult");box.classList.remove("hidden");$("deep").classList.remove("hidden");box.innerHTML='<h4>'+(m.deep?"✦ Deep analysis":"File overview")+'</h4><p class="muted">'+m.summary+'</p>'+(m.deep?'<b class="muted">Detected functions</b><div>'+m.functions.map(x=>'<span class="chip">'+x+'</span>').join("")+'</div><b class="muted">Imports</b><div class="filelist">'+(m.imports.join("<br>")||"No local imports")+'</div><b class="muted">Imported by</b><div class="filelist">'+(m.importedBy.join("<br>")||"No incoming references")+'</div>':'')});
    renderGraph();vscode.postMessage({type:"scan"});
    </script></body></html>`;
  }
}
export function activate(context: vscode.ExtensionContext) {
  const provider = new AgentHubView(context);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider("agenthub.sidebar",provider));
  context.subscriptions.push(vscode.commands.registerCommand("agenthub.refresh",()=>vscode.commands.executeCommand("workbench.view.extension.agenthub")));
}
export function deactivate() {}
=======
/**
 * src/extension.ts
 *
 * VS Code extension entry point for Webbit.
 * Registers two commands:
 *   • webbit.explain    — analyzes the active file with the two AI agents
 *   • webbit.setApiKey  — prompts the user for their Google AI API key
 *
 * LLM provider: Google Gemini 3.5 Flash Lite (via @google/generative-ai)
 * API key storage: VS Code global settings under `webbit.aiApiKey`
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
      location:  vscode.ProgressLocation.Notification,
      title:     'Webbit: Analyzing…',
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
        'webbitResult',
        `Webbit: ${path.basename(filePath)}`,
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
 * webbit.setApiKey
 *
 * Prompts the user for their Google AI API key and persists it to
 * `webbit.aiApiKey` in VS Code's global settings.
 */
async function cmdSetApiKey(): Promise<void> {
  const key = await vscode.window.showInputBox({
    prompt:          'Enter your Google AI API key (get one free at aistudio.google.com/apikey)',
    placeHolder:     'AQ...',
    password:        true,
    ignoreFocusOut:  true,
  });
  if (key === undefined) { return; }  // user cancelled

  await vscode.workspace
    .getConfiguration('webbit')
    .update('aiApiKey', key, vscode.ConfigurationTarget.Global);

  vscode.window.showInformationMessage('Webbit: API key saved ✅');
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
  <title>Webbit: ${esc(filename)}</title>
  <style>
    body  { font-family: var(--vscode-font-family); padding: 1.25rem 2rem; line-height: 1.6; }
    h1    { color: var(--vscode-titleBar-activeForeground); display: flex; align-items: center; gap: 0.5rem; }
    h2    { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: .35rem; margin-top: 1.5rem; }
    pre   { background: var(--vscode-textCodeBlock-background); padding: 1rem; border-radius: 6px; overflow-x: auto; white-space: pre-wrap; font-family: var(--vscode-editor-font-family); }
    code  { font-family: var(--vscode-editor-font-family); }
  </style>
</head>
<body>
  <h1>🕸️ Webbit: ${esc(filename)}</h1>
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
    vscode.commands.registerCommand('webbit.explain',   cmdExplain),
    vscode.commands.registerCommand('webbit.setApiKey', cmdSetApiKey)
  );
}

export function deactivate(): void {
  // Nothing to clean up.
}
>>>>>>> 0a950f72bea9a343dae7d998fb296e176fa6e44f
