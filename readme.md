# AgentHub — VS Code Extension

A native VS Code Activity Bar container and sidebar WebviewView. This is an extension project, not a standalone website.

## Run it
1. Install Node.js and VS Code.
2. Open this folder in VS Code.
3. Run `npm install`.
4. Press `F5` to launch the Extension Development Host.
5. Click the AgentHub icon in the Activity Bar.

## Features
- Initial sidebar: only **Dependency Web** and **File Analysis**.
- Dependency Web: scans JS/TS workspace files, resolves relative imports, and draws a clickable node network.
- File Analysis: gives a local structural overview.
- Deep Analysis: reveals detected functions, local imports, and files that import the selected file.
- Clicking a graph node offers an action to open that file in the editor.

## Notes
The webview markup is embedded inside `src/extension.ts` because VS Code renders extension sidebar interfaces through its Webview API. There is no standalone HTML website. The current analysis is deterministic local static analysis; it does not require a paid AI API. Dynamic imports, path aliases, generated files, and non-JS/TS languages need additional parser support.
