#!/usr/bin/env node

/**
 * Verify a PUBLISHED release, over the network.
 *
 * The package smoke test inspects the local `dist/` artifact, which proves the
 * builder is correct but says nothing about what GitHub is actually serving. A
 * failed upload, a stale asset, or a repository flipped to private all leave
 * that test green while every install breaks. This closes that gap by doing what
 * Foundry does: read the manifest URL, follow its `download` URL, and confirm
 * the archive agrees with the manifest.
 *
 * The manifest URL is deliberately the `releases/latest` one, because that is
 * the address users paste into Foundry. Verifying it proves the update-check
 * path works, not just this one release.
 *
 * Usage:
 *   node tools/verify-release.mjs
 *   node tools/verify-release.mjs --manifest <url>
 */

import { readZip, readZipText } from './lib/zip.mjs';

const DEFAULT_MANIFEST =
  'https://github.com/Ebonhawk3829/simulacrum-foundry/releases/latest/download/module.json';

/**
 * Parse argv.
 * @param {string[]} argv
 * @returns {object}
 */
function parseArgs(argv) {
  const args = { manifest: DEFAULT_MANIFEST };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--manifest') args.manifest = argv[++i];
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return args;
}

/**
 * Fetch a URL as a Buffer, following redirects.
 * @param {string} url
 * @returns {Promise<Buffer>}
 */
async function get(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * A tiny assertion collector, so every failure is reported rather than the first.
 */
class Report {
  constructor() {
    this.failures = [];
    this.checks = 0;
  }

  /**
   * Record a check.
   * @param {boolean} ok
   * @param {string} label
   * @param {string} [detail]
   */
  check(ok, label, detail = '') {
    this.checks++;
    if (!ok) this.failures.push(label);
    console.log(`${ok ? ' ok ' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  }

  /** @returns {number} exit code */
  finish() {
    const failed = this.failures.length;
    const summary = failed ? `${failed} of ${this.checks} check(s) FAILED` : `all ${this.checks} checks passed`;
    console.log(`\n${summary}`);
    return failed ? 1 : 0;
  }
}

/**
 * Confirm the archive ships every path the manifest declares.
 *
 * A compendium pack is a directory of LevelDB files, and directory entries carry
 * a trailing slash, so a declared directory is satisfied by any file beneath it.
 * @param {Report} report
 * @param {string[]} names
 * @param {object} manifest
 */
function checkDeclaredAssets(report, names, manifest) {
  const moduleId = manifest.id;
  const packs = new Set((manifest.packs ?? []).map(p => p.path));

  const declared = [
    ...(manifest.esmodules ?? []),
    ...(manifest.styles ?? []),
    ...(manifest.languages ?? []).map(l => l.path),
    ...packs,
  ];

  for (const path of declared) {
    const full = `${moduleId}/${path}`;
    const kind = packs.has(path) ? 'pack' : 'asset';
    const files = names.filter(n => n.startsWith(`${full}/`)).length;
    const detail = kind === 'pack' ? `${files} files` : '';
    report.check(names.includes(full) || files > 0, `declared ${kind} ships: ${path}`, detail);
  }
}

/**
 * Verify the archive's structure and its agreement with the manifest.
 * @param {Report} report
 * @param {Buffer} zip
 * @param {object} manifest
 */
function checkArchive(report, zip, manifest) {
  const moduleId = manifest.id;
  const names = readZip(zip).map(e => e.name);

  report.check(
    names.includes(`${moduleId}/module.json`),
    'archive is wrapped in the module folder',
    `${names.length} entries`,
  );
  report.check(
    names.every(n => n.startsWith(`${moduleId}/`)),
    'no file escapes the module folder',
  );

  const inner = JSON.parse(readZipText(zip, `${moduleId}/module.json`));
  report.check(inner.version === manifest.version, 'inner version matches published manifest', inner.version);
  report.check(inner.download === manifest.download, 'inner download matches published manifest');

  checkDeclaredAssets(report, names, manifest);

  // Regression guard: excluding a top-level "tools/" directory by name once
  // swallowed scripts/tools/, producing an archive that installed cleanly and
  // then failed on its first tool import.
  const tools = names.filter(n => n.startsWith(`${moduleId}/scripts/tools/`));
  report.check(tools.length >= 20, 'agent tool modules ship', `${tools.length} files`);
}

/**
 * Check that the repository does not require authentication to install.
 *
 * A private repository serves a login page rather than the asset, so every user
 * gets a confusing parse error instead of a download. Installing from a manifest
 * URL presupposes anonymous access, so this is a failure, not a warning.
 * @param {Report} report
 * @param {object} res
 */
function checkAnonymous(report, res) {
  const type = res.headers.get('content-type') ?? '';
  const looksLikeHtml = type.includes('text/html');
  report.check(
    !looksLikeHtml,
    'manifest is served without authentication',
    looksLikeHtml ? `${type} — the repository is probably private` : type,
  );
}

/**
 * Entry point.
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = new Report();

  const explicit = args.manifest !== DEFAULT_MANIFEST;
  console.log(`[verify] manifest: ${args.manifest}${explicit ? ' (explicit)' : ''}`);

  const res = await fetch(args.manifest, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${args.manifest}`);
  checkAnonymous(report, res);

  const manifest = JSON.parse((await res.text()).replace(/^\uFEFF/, ''));
  report.check(true, 'manifest URL served', `${manifest.id}@${manifest.version}`);

  // Foundry only detects updates if the manifest address never changes.
  const stable = manifest.manifest ?? '';
  report.check(stable === args.manifest, 'manifest points at the stable latest URL', stable);

  const zip = await get(manifest.download);
  report.check(true, 'download URL served', `${(zip.length / 1024).toFixed(1)} KB`);
  checkArchive(report, zip, manifest);

  const systems = (manifest.relationships?.systems ?? []).map(s => s.id);
  const required = (manifest.relationships?.requires ?? []).map(r => r.id);
  report.check(systems.length > 0, 'declares a system', systems.join(', '));
  report.check(required.length > 0, 'declares required modules', required.join(', '));

  process.exit(report.finish());
}

main().catch(err => {
  console.error(`[verify] FAILED: ${err.message}`);
  process.exit(1);
});
