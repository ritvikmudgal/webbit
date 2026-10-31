# 🕸️ Webbit

> **AI-Powered Code Intelligence & Architecture Navigator for VS Code**  
> *Untangle complex codebases with dual AI agents powered by Google Gemini 3.5 Flash Lite.*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![VS Code Engine](https://img.shields.io/badge/VS%20Code-1.85+-blue.svg)](https://code.visualstudio.com/)
[![LLM](https://img.shields.io/badge/AI-Gemini%203.5%20Flash%20Lite-brightgreen.svg)](https://aistudio.google.com/)
[![Node Version](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)

---

## 🌟 What is Webbit?

Modern software projects are intricate webs of dependencies, exports, functions, and cross-cutting architectural concerns. Diving into unfamiliar code or conducting architectural reviews often requires hours of tedious code tracing.

**Webbit** automates this by deploying two specialized AI agents in parallel:
1. **Architect Agent (`Agent 1`)** — High-level role & system design analysis.
2. **Reviewer Agent (`Agent 2`)** — Low-level, surgical inspection of functions, classes, and internal mechanics.

Whether used as an interactive **VS Code Extension** or via **standalone CLI scripts** that produce strict JSON for UI dashboards, Webbit provides instant, deterministic code intelligence.

---

## ✨ Features

- 🏛️ **File Role & Architecture Analysis**: Understands the file's primary responsibility, architectural fit, and major exports in context of the broader project.
- 🔬 **Deep Function & Class Breakdown**: Line-by-line inspection of functions, class methods, parameters, return types, dynamic allocations (`new`), event handlers, and dependencies.
- ⚡ **Concurrent Dual-Agent Pipeline**: Dispatches both agents simultaneously with `Promise.all` for minimal latency.
- 🆓 **Generous Free Tier**: Powered by `gemini-3.5-flash-lite`, offering **15 RPM · 250,000 TPM · 500 Requests/Day** on Google AI Studio's free tier.
- 🖥️ **Native VS Code Webview**: Side-by-side Markdown viewer rendered directly beside your active code editor.
- 🤖 **Standalone CLI Tools**: Dedicated terminal scripts (`agent1.ts` and `agent2.ts`) that output **strict, valid JSON** to `stdout` for headless automation and frontend integration.
- 🔐 **Built-in Secret Management**: Auto-loads API keys silently from `.env`, keeping secrets safe from Git while preserving pure JSON output.

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** v18+ (v20+ recommended)
- **VS Code** 1.85+
- A free **Google AI Studio API Key** (starts with `AQ...`):  
  👉 Get one free in 30 seconds at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

### 2. Installation & Setup

Clone the repository and install dependencies:

```bash
cd webbit
npm install
```

Configure your environment:

```bash
# Copy the template and add your API key
cp .env.example .env
```

Open `.env` and set your key:
```env
GOOGLE_AI_API_KEY=AQ.your_actual_key_here
```

---

## 💻 Usage

### Option A: VS Code Extension

1. Open the project in VS Code:
   ```bash
   code .
   ```
2. Press **`F5`** (or go to **Run & Debug** > **Run Extension**) to open the *Extension Development Host*.
3. In the new window:
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac).
   - Run command: **`Webbit: Set API Key`** and enter your Google AI key (persists globally).
   - Open any source code file (e.g. TypeScript, JavaScript, Python, etc.).
   - Run command: **`Webbit: Explain File`**.
4. An interactive panel opens side-by-side with the complete architectural breakdown.

---

### Option B: Standalone CLI Agents

You can run the agents directly from your terminal. Both agents load `.env` silently and output **strict JSON** directly to `stdout`.

#### Agent 1: File Role & Architecture
```bash
npx ts-node agent1.ts ./src/explanation/agents.ts
```

**Output schema:**
```json
{
  "agent": "agent1",
  "file": "agents.ts",
  "status": "success",
  "data": {
    "role_and_purpose": "Acts as an AI-powered code explanation agent that leverages Google Gemini to generate structured insights.",
    "architectural_fit": "Bridges AST parsing and project context with the presentation layer.",
    "major_components": ["AgentInput", "AgentOutput", "runAgents", "getModel"]
  }
}
```

#### Agent 2: Deep Technical Analysis
```bash
npx ts-node agent2.ts ./src/explanation/agents.ts
```

**Output schema:**
```json
{
  "agent": "agent2",
  "file": "agents.ts",
  "status": "success",
  "data": {
    "analysis": [
      {
        "name": "getModel",
        "type": "function",
        "purpose": "Initializes and caches the GenerativeModel instance.",
        "inputs_outputs": "Params: apiKey (string); Returns: GenerativeModel",
        "internal_mechanics": "Uses memoization pattern; instantiates GoogleGenerativeAI with temperature 0.2.",
        "dependencies": ["GoogleGenerativeAI"]
      }
    ]
  }
}
```

---

## ⚙️ Configuration

| Setting | Type | Default | Description |
|---|---|---|---|
| `webbit.aiApiKey` | `string` | `""` | Google AI API Key for Gemini 3.5 Flash Lite. Stored securely in VS Code global settings. |

Fallback priority for the API key:
1. VS Code settings (`webbit.aiApiKey`)
2. Environment variable (`process.env.GOOGLE_AI_API_KEY`)
3. Project `.env` file

---

## 🏗️ Project Architecture

```
webbit/
├── .env                         # Local secrets (never committed, gitignored)
├── .env.example                 # Safe environment template
├── .gitignore                   # Ignores .env, node_modules/, dist/
├── agent1.ts                    # Standalone CLI: File Role & Architecture Agent
├── agent2.ts                    # Standalone CLI: Deep Technical Function/Class Reviewer
├── agentUtils.ts                # Shared Gemini client, JSON sanitizer, & error handlers
├── package.json                 # Extension manifest & scripts
├── tsconfig.json                # TypeScript compiler configuration
└── src/
    ├── extension.ts             # VS Code extension lifecycle & command registration
    ├── explanation/
    │   ├── agents.ts            # Parallel Gemini dual-agent runner
    │   └── contextBuilder.ts    # Extracts package.json & README project context
    └── parser/
        └── tsParser.ts          # Language parsing & AST structural extraction
```

---

## 🌐 Supported Languages

Webbit supports code analysis across 15+ languages:
- **Web & Fullstack**: TypeScript (`.ts`, `.tsx`), JavaScript (`.js`, `.jsx`), PHP, Ruby
- **Systems & Backend**: Python (`.py`), Go (`.go`), Rust (`.rs`), Java (`.java`), C# (`.cs`), C++ (`.cpp`), C (`.c`)
- **Mobile**: Swift (`.swift`), Kotlin (`.kt`)

---

## 🛠️ Development & Build

```bash
# Compile TypeScript to ./dist
npm run compile

# Run compilation in watch mode during development
npm run watch

# Type-check without emitting files
npx tsc --noEmit
```

---

## 📄 License

This project is open-source under the [MIT License](LICENSE).
