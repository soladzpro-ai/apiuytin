import { spawn } from 'node:child_process';

const iterations = '500';
const virtualUsers = '20000000';
const scripts = ['tests/looptest.mjs', 'tests/profile-settings.mjs'];

function run(script) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [script], {
      cwd: process.cwd(),
      env: { ...process.env, TEST_ITERATIONS: iterations, ULTRA_VIRTUAL_USERS: virtualUsers },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; process.stdout.write(`[${script}] ${chunk}`); });
    child.stderr.on('data', chunk => { stderr += chunk; process.stderr.write(`[${script}] ${chunk}`); });
    child.on('close', code => resolve({ script, code: code ?? 1, stdout, stderr }));
    child.on('error', error => resolve({ script, code: 1, stdout, stderr: `${stderr}${error.stack || error.message}` }));
  });
}

console.log(`ULTRA_START iterations=${iterations} virtual_users=${virtualUsers} execution_model=bounded_child_processes`);
const results = await Promise.all(scripts.map(run));
const failed = results.filter(result => result.code !== 0);
if (failed.length) {
  console.error(`ULTRA_FAIL failed=${failed.map(result => result.script).join(',')}`);
  process.exitCode = 1;
} else {
  console.log(`ULTRA_PASS scripts=${results.length} iterations=${iterations} virtual_users=${virtualUsers} note=20m_virtual_users_bounded_not_20m_real_sockets`);
}
