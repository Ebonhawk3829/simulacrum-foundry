#!/usr/bin/env node

/**
 * Build a Foundry-installable release into dist/.
 *
 * Produces exactly the two assets a Foundry release contains:
 *
 *   dist/module.json     the manifest, stamped for this version
 *   dist/simulacrum.zip  the module archive
 *
 * Those names match what the release workflow uploads and what the manifest's
 * own `download` URL points at, so the local build and the published release
 * cannot describe different artifacts.
 *
 * Usage:
 *   node tools/build-release.mjs                # version from module.json
 *   node tools/build-release.mjs --version 0.1.0
 *   node tools/build-release.mjs --check        # verify without writing
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { buildRelease, parseManifest } from './lib/release-builder.mjs';
import { readZip } from './lib/zip.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

/**
 * Parse argv into a flag map.
 * @param {string[]} argv
 * @returns {{version?: string, check: boolean, repo?: string}}
 */
function parseArgs(argv) {
  const args = { check: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--check') args.check = true;
    else if (arg === '--version') args.version = argv[++i];
    else if (arg.startsWith('--version=')) args.version = arg.slice('--version='.length);
    else if (arg === '--repo') args.repo = argv[++i];
    else if (arg.startsWith('--repo=')) args.repo = arg.slice('--repo='.length);
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return args;
}

/** Current commit, or "unknown" when not in a work tree. */
function shortCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Format a byte count for a human.
 * @param {number} bytes
 * @returns {string}
 */
function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const args = parseArgs(process.argv.slice(2));

const repoManifest = parseManifest(readFileSync(join(ROOT, 'module.json'), 'utf8'));
const version = args.version ?? repoManifest.version;

console.log(`[release] Building ${repoManifest.id}@${version}`);

let release;
try {
  release = buildRelease({
    root: ROOT,
    version,
    repoUrl: args.repo ?? repoManifest.url,
    commit: shortCommit(),
    date: new Date().toISOString(),
  });
} catch (err) {
  console.error(`[release] FAILED: ${err.message}`);
  process.exit(1);
}

// Read the archive back rather than trusting the writer, so a corrupt archive
// fails the build instead of failing an install.
const entries = readZip(release.zip);
const names = entries.map(e => e.name);
const manifestInside = JSON.parse(
  entries.find(e => e.name === `${release.folder}/module.json`).data.toString('utf8')
);

console.log(`[release] Files: ${release.fileCount}`);
console.log(`[release] Archive: ${humanSize(release.zip.length)} (${names.length} entries)`);

if (manifestInside.version !== version) {
  console.error(
    `[release] FAILED: the archive's manifest says ${manifestInside.version}, expected ${version}`
  );
  process.exit(1);
}

if (manifestInside.download !== release.manifest.download) {
  console.error('[release] FAILED: the archive manifest and the stamped manifest disagree on download.');
  process.exit(1);
}

if (args.check) {
  console.log('[release] --check: verified, nothing written.');
  process.exit(0);
}

mkdirSync(DIST, { recursive: true });

const manifestPath = join(DIST, 'module.json');
const zipPath = join(DIST, `${release.folder}.zip`);

writeFileSync(manifestPath, release.manifestJson, 'utf8');
writeFileSync(zipPath, release.zip);

console.log(`[release] Wrote ${manifestPath}`);
console.log(`[release] Wrote ${zipPath}`);

if (!existsSync(zipPath)) {
  console.error('[release] FAILED: the archive was not written.');
  process.exit(1);
}
