// Test-only extraction of the actual committed workflow callback, not a parallel
// implementation. External GETs and artifact locations are supplied by fixtures.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const yaml = readFileSync(new URL('../../.github/workflows/classyline-production-manual.yml', import.meta.url), 'utf8');
const scripts = [...yaml.matchAll(/node --input-type=module <<'NODE'\n([\s\S]*?)^          NODE/gm)]
  .map(m => m[1].replace(/^          /gm, ''));
assert.equal(scripts.length, 4);
const release = scripts.at(-1);
const helpers = release.slice(release.indexOf('async function cf(path) {'), release.indexOf('await mainUnchanged();'));
assert(helpers.includes('function project(p)') && helpers.includes('function noActive(list)'));
const callbacks = [...release.matchAll(/preflight:async \(\) => \{\n([\s\S]*?)\n\s*\}\}\);/g)];
assert.equal(callbacks.length, 1, 'Must exercise the actual committed transport preflight');
export const preflightFactory = new Function('fetch', 'e', 'projectID', 'root', 'baseline', 'baselineSHA',
  'knownIDs', 'check', 'loadPlan', 'process', 'output', 'initialProject',
  helpers + '\nconst bindings=project(initialProject); return async()=>{\n' + callbacks[0][1] + '\n};');
