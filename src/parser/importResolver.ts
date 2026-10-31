/**
 * @module importResolver
 * Resolves local import specifiers to existing relative file paths.
 */

import * as path from 'path';
import * as fs from 'fs';

const DEFAULT_EXTENSIONS = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'py'];
const DEFAULT_INDEX_FILES = [
  'index.ts',
  'index.tsx',
  'index.js',
  'index.jsx',
  'index.mjs',
  'index.cjs',
  '__init__.py',
];

/**
 * Determine if a specifier is a local relative import or resolves to a local file.
 * Ignores third-party packages like 'react', 'express', 'os', 'json', 'rumps', etc.
 */
export function isLocalSpecifier(
  specifier: string,
  fromAbsFile?: string,
  projectRoot?: string,
): boolean {
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    return true;
  }
  if (fromAbsFile && projectRoot) {
    return resolveLocalImport(specifier, fromAbsFile, projectRoot) !== null;
  }
  return false;
}

/**
 * Resolves a local import specifier to its actual relative path within the project.
 * Checks relative imports and bare imports that exist locally in the project.
 * Returns null if the import cannot be resolved or is external.
 */
export function resolveLocalImport(
  specifier: string,
  fromAbsFile: string,
  projectRoot: string,
  extensions = DEFAULT_EXTENSIONS,
  indexFiles = DEFAULT_INDEX_FILES,
): string | null {
  const baseDir = path.dirname(fromAbsFile);

  // Normalize Python-style relative imports: e.g. .sensors -> ./sensors, ..utils -> ../utils
  const normalized = specifier.startsWith('.') && !specifier.startsWith('./') && !specifier.startsWith('../')
    ? specifier.replace(/^(\.+)/, '$1/')
    : specifier;

  const candidates: string[] = [];

  if (normalized.startsWith('/')) {
    candidates.push(path.resolve(projectRoot, normalized.slice(1)));
  } else if (normalized.startsWith('.')) {
    candidates.push(path.resolve(baseDir, normalized));
    if (normalized.slice(2).includes('.')) {
      const relWithSlashes = normalized.startsWith('./')
        ? './' + normalized.slice(2).replace(/\./g, '/')
        : '../' + normalized.slice(3).replace(/\./g, '/');
      candidates.push(path.resolve(baseDir, relWithSlashes));
    }
  } else {
    // Bare import (e.g. Python 'import sensors', 'import pkg.module')
    // Check relative to current file's directory first, then project root
    const relAsPath = normalized.replace(/\./g, '/');
    candidates.push(path.resolve(baseDir, normalized));
    if (relAsPath !== normalized) {
      candidates.push(path.resolve(baseDir, relAsPath));
    }
    candidates.push(path.resolve(projectRoot, normalized));
    if (relAsPath !== normalized) {
      candidates.push(path.resolve(projectRoot, relAsPath));
    }
  }

  for (const candidate of candidates) {
    // 1. Direct file match
    if (isFile(candidate)) {
      return normalizeRelPath(projectRoot, candidate);
    }

    // 2. Candidate + extension
    for (const ext of extensions) {
      const withExt = `${candidate}.${ext}`;
      if (isFile(withExt)) {
        return normalizeRelPath(projectRoot, withExt);
      }
    }

    // 3. Candidate directory + index file
    if (isDirectory(candidate)) {
      for (const indexFile of indexFiles) {
        const indexPath = path.join(candidate, indexFile);
        if (isFile(indexPath)) {
          return normalizeRelPath(projectRoot, indexPath);
        }
      }
    }
  }

  return null;
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function normalizeRelPath(root: string, absPath: string): string {
  const rel = path.relative(root, absPath);
  return rel.replace(/\\/g, '/');
}
