// Execute the real workflow invocation wrapper against a local fake npx only.
// This checks native process-group cancellation, not Wrangler or hosted behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

const yaml = readFileSync(new URL('../.github/workflows/classyline-production-manual.yml', import.meta.url), 'utf8');
const invocation = yaml.match(/          \/\/ BEGIN WRANGLER INVOCATION\n([\s\S]*?)          \/\/ END WRANGLER INVOCATION/)[1]
  .replace(/^          /gm, '');
const fakeCredential = 'FAKE_NATIVE_TEST_VALUE_NOT_A_CREDENTIAL';
const executable = `#!${process.execPath}
const fs = require('node:fs');
const {spawn} = require('node:child_process');
fs.appendFileSync('calls', 'one\\n');
console.log(process.env.CLOUDFLARE_API_TOKEN);
console.error(process.env.CLOUDFLARE_API_TOKEN);
const mode = fs.readFileSync('mode', 'utf8');
if (mode === 'success') process.exit(0);
const descendant = spawn(process.execPath, ['descendant.cjs'], {stdio: 'ignore', detached: false});
fs.writeFileSync('pids.json', JSON.stringify([process.pid, descendant.pid]));
setInterval(() => {}, 1000);
`;

function live(pid) {
  try {
    process.kill(pid, 0);
    // Linux zombies cannot execute work and await reaping by the parent/init.
    // Some local executors virtualize process IDs, so /proc may be unavailable.
    try {
      const state = readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1][0];
      return state !== 'Z' && state !== 'X';
    } catch (error) { if (error.code === 'ENOENT') return true; throw error; }
  } catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}
async function until(predicate, message, milliseconds = 3000) {
  const deadline = Date.now() + milliseconds;
  while (!predicate()) {
    assert(Date.now() < deadline, message);
    await delay(10);
  }
}
async function execute(mode) {
  const dir = mkdtempSync(join(tmpdir(), 'classyline-native-wrangler-'));
  const bin = join(dir, 'bin'); mkdirSync(bin);
  writeFileSync(join(bin, 'npx'), executable, {mode: 0o700});
  writeFileSync(join(dir, 'mode'), mode);
  writeFileSync(join(dir, 'descendant.cjs'), "require('node:fs').writeFileSync('descendant-ready', 'ready'); setInterval(() => {}, 1000);\n");
  // Only the timeout duration is shortened; the native invocation function is exact.
  const source = `import {spawn} from 'node:child_process';
const e = {PATH: ${JSON.stringify(bin)}, HOME: ${JSON.stringify(dir)}, CLOUDFLARE_API_TOKEN: ${JSON.stringify(fakeCredential)}};
const candidate = 'b64e078ee6ecfc5f4e124fe6d68129164f521b8a';
const check = (ok, message) => { if (!ok) throw Error(message); };
${invocation.replace('180000', mode === 'timeout' ? '1000' : '5000')}
const result = await invokeWranglerOnce();
let replayRejected = false;
try { await invokeWranglerOnce(); } catch { replayRejected = true; }
console.log(JSON.stringify({result, replayRejected}));
`;
  writeFileSync(join(dir, 'controller.mjs'), source);
  const controller = spawn(process.execPath, ['controller.mjs'], {cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], env: {}});
  let stdout = '', stderr = '', pids = [];
  controller.stdout.on('data', data => { stdout += data; });
  controller.stderr.on('data', data => { stderr += data; });
  const completed = new Promise((resolve, reject) => {
    controller.once('error', reject);
    controller.once('close', (status, signal) => resolve({status, signal}));
  });
  try {
    if (mode !== 'success') {
      await until(() => existsSync(join(dir, 'descendant-ready')), 'Fake CLI descendant did not start');
      pids = JSON.parse(readFileSync(join(dir, 'pids.json'), 'utf8'));
      assert(pids.every(live), 'Fake CLI and descendant must actually be running before termination');
      if (mode === 'cancel') process.kill(controller.pid, 'SIGTERM');
    }
    const exit = await completed;
    assert.equal(exit.status, 0, stderr);
    assert.equal(exit.signal, null);
    assert(!stdout.includes(fakeCredential));
    assert(!stderr.includes(fakeCredential));
    assert.equal(readFileSync(join(dir, 'calls'), 'utf8'), 'one\n');
    const evidence = JSON.parse(stdout.trim());
    assert.equal(evidence.replayRejected, true);
    if (pids.length) await until(() => pids.every(pid => !live(pid)), 'CLI descendants survived wrapper termination');
    return evidence.result;
  } finally {
    // Emergency cleanup is limited to the fake command's recorded process group.
    if (pids.length && pids.some(live)) try { process.kill(-pids[0], 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    if (controller.exitCode === null && controller.signalCode === null) controller.kill('SIGKILL');
    await completed.catch(() => {});
    rmSync(dir, {recursive: true, force: true});
  }
}

test('native wrapper invokes once, suppresses child output and rejects a second invocation', async () => {
  assert.deepEqual(await execute('success'), {status: 0, signal: null, error: false});
});
test('native timeout kills fake npm and its real descendant without replacement invocation', async () => {
  assert.deepEqual(await execute('timeout'), {status: null, signal: 'SIGKILL', error: true});
});
test('native runner SIGTERM kills fake npm and its real descendant without replacement invocation', async () => {
  assert.deepEqual(await execute('cancel'), {status: null, signal: 'SIGTERM', error: true});
});
