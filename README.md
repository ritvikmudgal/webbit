# Webbit

> AI-powered code intelligence for VS Code — powered by **Google Gemini 3.5 Flash Lite**

## Features

- **File-level analysis** — Instantly understand any file's role, architectural fit, and major components.
- **Deep function/class analysis** — Step-by-step breakdown of every function and class: purpose, inputs/outputs, internal mechanics, and dependencies.
- **Parallel AI agents** — Both analyses run simultaneously to minimise wait time.
- **Free tier friendly** — Best free-tier limits: **15 RPM · 250K TPM · 500 RPD**.

## Features

- **File-level analysis** — Instantly understand any file's role, architectural fit, and major components.
- **Deep function/class analysis** — Step-by-step breakdown of every function and class: purpose, inputs/outputs, internal mechanics, and dependencies.
- **Parallel AI agents** — Both analyses run simultaneously to minimise wait time.
- **Free tier friendly** — Uses Gemini 1.5 Flash (or Gemini 2.0 Flash Lite) with generous limits: **15 RPM · 1M TPM · 1,500 RPD**.

## Requirements

- VS Code 1.85+
- A free **Google AI API Key** from [aistudio.google.com](https://aistudio.google.com)

## Getting Started

1. Install the extension.
2. Open the Command Palette (`Ctrl+Shift+P`) and run **CodeIntel: Set API Key**.
3. Paste your Google AI API key when prompted.
4. Open any source file, then run **CodeIntel: Explain File**.

The analysis panel opens beside your editor with two sections:
- 🏛️ **File Role & Architecture**
- 🔬 **Function & Class Analysis**

## Configuration

| Setting | Description |
|---|---|
| `codeintel.aiApiKey` | Your Google AI API Key. Stored securely in VS Code global settings. Get one free at [aistudio.google.com](https://aistudio.google.com). |

You can also export the key as an environment variable as a fallback:

```bash
export GOOGLE_AI_API_KEY="AQ.xxxxx..."
```

## Rate Limits (Gemini 3.5 Flash Lite — Free Tier)

| Limit | Value |git 
|---|---|
| Requests per minute (RPM) | 15 |
| Tokens per minute (TPM) | 250,000 |
| Requests per day (RPD) | 500 |

## Supported Languages

TypeScript, TypeScript (React), JavaScript, JavaScript (React), Python, Go, Rust, Java, C#, C++, C, Ruby, PHP, Swift, Kotlin.

## Extension Commands

| Command | Description |
|---|---|
| `CodeIntel: Explain File` | Analyze the active file with both AI agents |
| `CodeIntel: Set API Key` | Save your Google AI API key to VS Code settings |

## Architecture

```
src/
├── extension.ts                  VS Code entry point, command handlers
├── parser/
│   └── tsParser.ts               Tree-sitter parser (stub → replace with real impl)
└── explanation/
    ├── contextBuilder.ts         Reads package.json + README for project context
    └── agents.ts                 Gemini 3.5 Flash Lite two-agent pipeline
```

## Development

```bash
# Install dependencies
npm install

# Type-check
npx tsc --noEmit

# Run standalone CLI agents (no VS Code needed)
# PowerShell:  $env:GOOGLE_AI_API_KEY = "AQ.xxxxx..."
# CMD:         set GOOGLE_AI_API_KEY=AQ.xxxxx...
# Bash:        export GOOGLE_AI_API_KEY="AQ.xxxxx..."
npx ts-node agent1.ts ./src/parser/tsParser.ts
npx ts-node agent2.ts ./src/extension.ts
```

## License

MIT
