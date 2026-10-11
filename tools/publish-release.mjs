#!/usr/bin/env node

/**
 * Publish a release to GitHub.
 *
 * A Foundry release is a tag plus two assets. This automates that, and refuses
 * to proceed in the situations where a half-finished release is worse than none:
 * a dirty tree, an existing tag, or a missing archive.
 *
 * It does NOT build. Run `npm run build:release` first, or pass --build. Keeping
 * the steps separate means the artifact that gets published is the one that was
 * inspected.
 *
 * Usage:
 *   node tools/publish-release.mjs --dry-run
 *   node tools/publish-release.mjs
 *   node tools/publish-release.mjs --version 0.1.0 --notes-file RELEASE.md
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { parseManifest, checkArchiveFreshness } from './lib/release-builder.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

/**
 * Parse argv.
 * @param {string[]} argv
 * @returns {object}
 */
function parseArgs(argv) {
  const args = { dryRun: false, build: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--build') args.build = true;
    else if (arg === '--tag') args.tag = argv[++i];
    else if (arg === '--version') args.version = argv[++i];
    else if (arg === '--notes-file') args.notesFile = argv[++i];
    else if (arg === '--title') args.title = argv[++i];
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return args;
}

/**
 * Run a command, returning trimmed stdout. Throws on non-zero exit.
 * @param {string} command
 * @param {string[]} args
 * @returns {string}
 */
function run(command, args) {
  return execFileSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/**
 * True when the command exits zero.
 * @param {string} command
 * @param {string[]} args
 * @returns {boolean}
 */
function succeeds(command, args) {
  try {
    run(command, args);
    return true;
  } catch {
    return false;
  }
}

const args = parseArgs(process.argv.slice(2));
const manifest = parseManifest(readFileSync(join(ROOT, 'module.json'), 'utf8'));
const version = args.version ?? manifest.version;
const tag = args.tag ?? version;
const repo = (manifest.url ?? '').replace(/^https?:\/\/github\.com\//, '');

const fail = message => {
  console.error(`[publish] FAILED: ${message}`);
  process.exit(1);
};

console.log(`[publish] ${manifest.id}@${version} -> ${repo} (tag ${tag})`);

if (!repo.includes('/')) fail(`manifest "url" is not a GitHub repository URL: ${manifest.url}`);

// 1. gh must be present and authenticated, or nothing below can work.
if (!succeeds('gh', ['--version'])) fail('the GitHub CLI (gh) is not installed.');
if (!succeeds('gh', ['auth', 'status'])) fail('gh is not authenticated. Run: gh auth login');

if (args.build) {
  console.log('[publish] Building first...');
  run(process.execPath, ['tools/build-release.mjs', '--version', version]);
}

// 2. The artifacts must exist. They are what gets uploaded.
const zipPath = join(DIST, `${manifest.id}.zip`);
const manifestPath = join(DIST, 'module.json');
if (!existsSync(zipPath)) fail(`missing ${zipPath}. Run: npm run build:release`);
if (!existsSync(manifestPath)) fail(`missing ${manifestPath}. Run: npm run build:release`);

// 3. The archive's manifest must agree with the version being published, or the
//    release would install a module that reports a different version.
const stamped = parseManifest(readFileSync(manifestPath, 'utf8'), 'dist/module.json');
if (stamped.version !== version) {
  fail(`dist/module.json says ${stamped.version} but you are publishing ${version}. Rebuild.`);
}
if (!stamped.download.includes(`/download/${version}/`)) {
  fail(`dist/module.json download URL does not point at ${version}: ${stamped.download}`);
}

// 4. Release from a committed state, so the tag identifies the source.
const dirty = run('git', ['status', '--porcelain']);
if (dirty) fail(`the working tree has uncommitted changes:\n${dirty}\n\nCommit them first.`);

const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
const head = run('git', ['rev-parse', '--short', 'HEAD']);
console.log(`[publish] Source: ${branch} @ ${head}`);

// 5. The archive must match the commit being tagged.
//
// dist/ is gitignored, so a build made before the last edit survives a commit
// and looks finished. Its staleness is invisible in the upload: the release
// succeeds and ships content that predates the version it claims to be. Caught
// here rather than trusted, because that failure is both silent and permanent.
const { differing, absent } = checkArchiveFreshness(readFileSync(zipPath), ROOT, {
  ignore: ['module.json', 'scripts/build-info.js'],
});
if (differing.length || absent.length) {
  const lines = [
    ...differing.map(p => `  stale    ${p}`),
    ...absent.map(p => `  vanished ${p}`),
  ];
  fail(
    `the archive does not match the working tree:\n${lines.join('\n')}\n\n` +
      `Run \`npm run build:release\` and commit the result before publishing.`
  );
}
console.log('[publish] Archive matches the working tree.');

// 6. Never reuse a tag: a moved tag makes two different builds share a version.
if (succeeds('git', ['rev-parse', '--verify', `refs/tags/${tag}`])) {
  fail(`tag ${tag} already exists locally. Bump the version rather than re-releasing.`);
}
if (succeeds('gh', ['release', 'view', tag, '--repo', repo])) {
  fail(`a GitHub release for ${tag} already exists.`);
}

const notesFile = args.notesFile ?? join(ROOT, 'tools', 'release-notes', `${version}.md`);
let notes;
if (existsSync(notesFile)) {
  notes = readFileSync(notesFile, 'utf8');
  console.log(`[publish] Notes: ${notesFile}`);
} else {
  notes = readFileSync(join(ROOT, 'tools', 'release-notes', 'default.md'), 'utf8')
    .replaceAll('{{version}}', version)
    .replaceAll('{{repo}}', repo);
  console.log('[publish] Notes: generated from tools/release-notes/default.md');
}

const title = args.title ?? `${manifest.title} ${version}`;

const plan = [
  `tag      : ${tag}`,
  `title    : ${title}`,
  `assets   : ${manifestPath}`,
  `           ${zipPath}`,
  `manifest : ${stamped.manifest}`,
  `download : ${stamped.download}`,
  '',
  '--- release notes ---',
  notes.trim(),
];
console.log('\n' + plan.join('\n') + '\n');

if (args.dryRun) {
  console.log('[publish] --dry-run: nothing was tagged or uploaded.');
  process.exit(0);
}

// 7. Tag, push, and upload. Order matters: the tag must exist before the release
//    is created against it, and the release must exist before its assets.
console.log(`[publish] Tagging ${tag}...`);
run('git', ['tag', '-a', tag, '-m', `Release ${version}`]);

console.log('[publish] Pushing tag...');
try {
  run('git', ['push', 'origin', `refs/tags/${tag}`]);
} catch (err) {
  // Leave the local tag in place so a retry does not have to recreate it.
  console.error(`[publish] Push failed: ${err.stderr || err.message}`);
  console.error(`[publish] The local tag ${tag} exists. Fix the push and re-run.`);
  process.exit(1);
}

const notesTmp = join(ROOT, 'dist', 'release-notes.md');
writeFileSync(notesTmp, notes, 'utf8');

console.log('[publish] Creating release...');
try {
  run('gh', [
    'release',
    'create',
    tag,
    manifestPath,
    zipPath,
    '--repo',
    repo,
    '--title',
    title,
    '--notes-file',
    notesTmp,
  ]);
} catch (err) {
  console.error(`[publish] Release creation failed: ${err.stderr || err.message}`);
  console.error(
    `[publish] The tag ${tag} was pushed. Create the release manually with:\n` +
      `  gh release create ${tag} dist/module.json dist/simulacrum.zip --repo ${repo} --notes-file ${notesTmp}`
  );
  process.exit(1);
}

const installUrl = stamped.manifest;
console.log(`\n[publish] Released ${tag}.`);
console.log(`[publish] Install in Foundry via this manifest URL:`);
console.log(`          ${installUrl}`);
