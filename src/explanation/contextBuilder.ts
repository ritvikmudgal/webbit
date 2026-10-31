/**
 * src/explanation/contextBuilder.ts
 *
 * Builds a lightweight ProjectContext object that is passed to the AI agents
 * so they can produce architecture-aware explanations rather than isolated
 * function-level analysis.
 *
 * All I/O is pure Node.js `fs` — no VS Code APIs are used inside this module
 * so it can also be exercised by the standalone CLI agents if needed.
 */

import * as fs   from 'fs';
import * as path from 'path';

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface ProjectContext {
  /** The name field from package.json, or the workspace folder basename. */
  projectName: string;
  /** Top-level keys from package.json `dependencies` + `devDependencies`. */
  dependencies: string[];
  /** First 500 characters of README.md (or empty string if not found). */
  readmeSnippet: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Walk up from `startDir` until we find a `package.json`, or return null.
 */
function findPackageRoot(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) { break; } // filesystem root
    dir = parent;
  }
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a ProjectContext for the project that contains `filePath`.
 *
 * @param filePath - Absolute path to any file inside the project.
 * @returns A ProjectContext; gracefully degrades if files are missing.
 */
export function buildProjectContext(filePath: string): ProjectContext {
  const fileDir    = path.dirname(path.resolve(filePath));
  const projectRoot = findPackageRoot(fileDir);

  // ── project name ──────────────────────────────────────────────────────────
  let projectName  = path.basename(fileDir);
  let dependencies: string[] = [];

  if (projectRoot) {
    try {
      const pkgRaw  = fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8');
      const pkg     = JSON.parse(pkgRaw) as {
        name?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };

      projectName  = pkg.name ?? path.basename(projectRoot);
      dependencies = [
        ...Object.keys(pkg.dependencies    ?? {}),
        ...Object.keys(pkg.devDependencies ?? {}),
      ];
    } catch {
      // malformed package.json — fall through with defaults
    }
  }

  // ── readme snippet ────────────────────────────────────────────────────────
  let readmeSnippet = '';
  const readmeCandidates = ['README.md', 'readme.md', 'Readme.md'];

  if (projectRoot) {
    for (const candidate of readmeCandidates) {
      const readmePath = path.join(projectRoot, candidate);
      if (fs.existsSync(readmePath)) {
        try {
          readmeSnippet = fs.readFileSync(readmePath, 'utf-8').slice(0, 500);
        } catch {
          // unreadable — leave empty
        }
        break;
      }
    }
  }

  return { projectName, dependencies, readmeSnippet };
}
