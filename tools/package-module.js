#!/usr/bin/env node

/**
 * Package the module — compatibility entry point.
 *
 * The packaging implementation lives in tools/build-release.mjs. This file
 * remains because the end-to-end harness invokes it by path, and because it
 * previously shelled out to the `zip` binary, which is not present on every
 * development machine.
 *
 * It delegates rather than duplicating, so there is one definition of what a
 * release contains and the two entry points cannot drift apart.
 */

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const result = spawnSync(process.execPath, [join(ROOT, 'tools', 'build-release.mjs'), ...process.argv.slice(2)], {
  cwd: ROOT,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
