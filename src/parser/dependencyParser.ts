/**
 * @module dependencyParser
 * Scans directories, extracts local imports, and generates graph JSON.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { DependencyGraph, DependencyScannerOptions } from './parserTypes';
import { resolveLocalImport, isLocalSpecifier } from './importResolver';

const DEFAULT_EXTS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py'
]); const DEFAULT_IGNORES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.vscode',
  'coverage',
]);

/**
 * Regex matching ES import/export and CommonJS require specifiers:
 * - import ... from './foo'
 * - import './foo'
 * - export ... from './foo'
 * - require('./foo')
 * - import('./foo')
 */
const IMPORT_REGEX =
  /(?:import\s+(?:[\w*\s{},]*from\s+)?['"]([^'"]+)['"]|export\s+[\w*\s{},]*from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*\(\s*['"]([^'"]+)['"]\s*\))/g;

/**
 * Extracts raw import specifiers from file contents using fast regex.
 * Supports JavaScript, TypeScript, and Python import statements.
 */
export function extractImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];

  // 1. JavaScript / TypeScript imports & requires
  let match: RegExpExecArray | null;
  IMPORT_REGEX.lastIndex = 0;
  while ((match = IMPORT_REGEX.exec(source)) !== null) {
    const raw = match[1] || match[2] || match[3] || match[4];
    if (raw) specifiers.push(raw);
  }

  // 2. Python imports
  const lines = source.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Python 'from ... import ...'
    // e.g. 'from sensors import c_to_f', 'from . import utils', 'from .sensors import c_to_f'
    const fromMatch = trimmed.match(/^from\s+([.\w]+)\s+import(?:\s+(.*))?$/);
    if (fromMatch) {
      const mod = fromMatch[1];
      specifiers.push(mod);

      // For 'from . import utils', also extract submodule names if mod consists only of dots
      if (/^\.+$/.test(mod) && fromMatch[2]) {
        const afterImport = fromMatch[2].replace(/[()]/g, '').split('#')[0];
        const parts = afterImport.split(',');
        for (const part of parts) {
          const name = part.trim().split(/\s+as\s+/)[0].trim();
          if (name && name !== mod) specifiers.push(name);
        }
      }
      continue;
    }

    // Python 'import ...'
    // e.g. 'import sensors', 'import sensors, os', 'import sensors as s, os as o'
    // Exclude statements containing quotes, curly braces, or 'from' (JS/TS constructs)
    if (/^import\s+[^'\"{}*]+$/.test(trimmed) && !/\bfrom\b/.test(trimmed)) {
      const rest = trimmed.replace(/^import\s+/, '').split('#')[0];
      const parts = rest.split(',');
      for (const part of parts) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (name && /^[a-zA-Z0-9_.]+$/.test(name)) {
          specifiers.push(name);
        }
      }
    }
  }

  return specifiers;
}

/**
 * Recursively scans project files.
 */
function scanFiles(
  dir: string,
  root: string,
  allowedExts: Set<string>,
  ignoreSet: Set<string>,
  results: string[],
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (ignoreSet.has(entry.name) || entry.name.startsWith('.')) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanFiles(fullPath, root, allowedExts, ignoreSet, results);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (allowedExts.has(ext)) {
        results.push(fullPath);
      }
    }
  }
}

/**
 * Builds a clean Cytoscape/G6 compatible dependency graph.
 */
export async function buildDependencyGraph(
  projectRoot: string,
  options: DependencyScannerOptions = {},
): Promise<DependencyGraph> {
  const root = path.resolve(projectRoot);
  const allowedExts = options.extensions
    ? new Set(options.extensions.map((e) => (e.startsWith('.') ? e : `.${e}`)))
    : DEFAULT_EXTS;

  const ignoreSet = new Set(DEFAULT_IGNORES);
  if (options.ignore) {
    for (const ig of options.ignore) ignoreSet.add(ig);
  }

  const files: string[] = [];
  scanFiles(root, root, allowedExts, ignoreSet, files);

  const nodesMap = new Map<string, { id: string }>();
  const edgesMap = new Map<string, { source: string; target: string }>();

  // Add all detected source files as nodes
  for (const file of files) {
    const relSource = path.relative(root, file).replace(/\\/g, '/');
    if (!nodesMap.has(relSource)) {
      nodesMap.set(relSource, { id: relSource });
    }
  }

  // Scan imports per file
  for (const file of files) {
    const relSource = path.relative(root, file).replace(/\\/g, '/');
    let content = '';
    try {
      content = await fs.promises.readFile(file, 'utf8');
    } catch {
      continue;
    }

    const rawSpecifiers = extractImportSpecifiers(content);

    for (const specifier of rawSpecifiers) {
      if (!isLocalSpecifier(specifier, file, root)) {
        continue; // Exclude react, express, os, json, rumps, etc.
      }

      const resolved = resolveLocalImport(specifier, file, root);
      if (resolved) {
        // Ensure target is registered in nodes
        if (!nodesMap.has(resolved)) {
          nodesMap.set(resolved, { id: resolved });
        }

        // Avoid duplicate edges or self-referential loops
        const edgeKey = `${relSource}->${resolved}`;
        if (!edgesMap.has(edgeKey)) {
          edgesMap.set(edgeKey, {
            source: relSource,
            target: resolved,
          });
        }
      }
    }
  }

  return {
    nodes: Array.from(nodesMap.values()),
    edges: Array.from(edgesMap.values()),
  };
}
