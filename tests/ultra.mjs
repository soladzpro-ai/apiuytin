import { spawn } from 'node:child_process';

const iterations = '500';
const virtualUsers = '20000000';
const virtualUserCount = Number(virtualUsers);
const scripts = ['tests/looptest.mjs', 'tests/profile-settings.mjs'];
// Four isolated workers are the stable local default on Windows; raise
// ULTRA_WORKERS explicitly when the host has enough process capacity.
const workerCount = Number(process.env.ULTRA_WORKERS || 4);
const childTimeoutMs = Number(process.env.ULTRA_CHILD_TIMEOUT_MS || 180000);
const expected = {
  'tests/looptest.mjs': { iterations: 500, total: 47500, expected: 47500, virtualUsers: null },
  'tests/profile-settings.mjs': { iterations: 500, total: 29500, expected: 29500, virtualUsers: 20000000 }
};

if (!Number.isSafeInteger(workerCount) || workerCount < 1 || workerCount > 64) throw new Error('ULTRA_WORKERS must be an integer from 1 to 64');
if (!Number.isSafeInteger(childTimeoutMs) || childTimeoutMs < 1000) throw new Error('ULTRA_CHILD_TIMEOUT_MS must be an integer of at least 1000');
if (!Number.isSafeInteger(virtualUserCount) || virtualUserCount < 10_000_000) throw new Error('virtualUsers must be an integer of at least 10000000');

function run(script, { runIterations = iterations, label = script, streamOutput = true, env = {} } = {}) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [script], {
      cwd: process.cwd(),
      env: { ...process.env, TEST_ITERATIONS: String(runIterations), ULTRA_VIRTUAL_USERS: virtualUsers, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ script, label, ...result });
    };
    const timeout = setTimeout(() => {
      child.kill();
      finish({ code: 1, stdout, stderr: `${stderr}child timeout after ${childTimeoutMs}ms` });
    }, childTimeoutMs);
    child.stdout.on('data', chunk => { stdout += chunk; if (streamOutput) process.stdout.write(`[${label}] ${chunk}`); });
    child.stderr.on('data', chunk => { stderr += chunk; if (streamOutput) process.stderr.write(`[${label}] ${chunk}`); });
    child.on('close', code => finish({ code: code ?? 1, stdout, stderr }));
    child.on('error', error => finish({ code: 1, stdout, stderr: `${stderr}${error.stack || error.message}` }));
  });
}

function validateOutput(result, runIterations, expectedCohort = null) {
  if (result.code !== 0) return `${result.label}:exit=${result.code}`;
  const contract = expected[result.script];
  const line = result.stdout.split(/\r?\n/).find(value => value.includes(result.script.includes('looptest') ? 'LOOPTEST_PASS' : 'PROFILE_MATRIX_PASS')) || '';
  const iterationsMatch = line.match(/iterations=(\d+)/);
  const totalMatch = line.match(/total=(\d+)/);
  const expectedMatch = line.match(/expected=(\d+)/);
  const expectedTotal = contract ? contract.total * runIterations / contract.iterations : NaN;
  if (!contract || Number(iterationsMatch?.[1]) !== runIterations || Number(totalMatch?.[1]) !== expectedTotal || Number(expectedMatch?.[1]) !== expectedTotal) {
    return `${result.label}:output-contract-mismatch`;
  }
  if (contract.virtualUsers !== null && !line.includes(`virtual_users=100000/500000/${contract.virtualUsers}`)) return `${result.label}:virtual-user-contract-mismatch`;
  if (expectedCohort && !line.includes(`virtual_user_cohort=${expectedCohort.offset}/${expectedCohort.count}`)) return `${result.label}:virtual-user-cohort-mismatch`;
  return null;
}

const cohorts = Array.from({ length: workerCount }, (_, index) => {
  const base = Math.floor(virtualUserCount / workerCount);
  const remainder = virtualUserCount % workerCount;
  const count = base + (index < remainder ? 1 : 0);
  const offset = index * base + Math.min(index, remainder);
  return { offset, count };
});
if (cohorts.reduce((total, cohort) => total + cohort.count, 0) !== virtualUserCount || cohorts.some((cohort, index) => cohort.offset !== (index === 0 ? 0 : cohorts[index - 1].offset + cohorts[index - 1].count))) throw new Error('virtual-user cohorts must be contiguous and cover the full population');
console.log(`ULTRA_START iterations=${iterations} virtual_users=${virtualUsers} execution_model=bounded_child_processes isolated_workers=${workerCount} virtual_user_partitioning=contiguous child_timeout_ms=${childTimeoutMs}`);
const workerScripts = Array.from({ length: workerCount }, (_, index) => scripts[index % scripts.length]);
const workerJobs = workerScripts.map((script, index) => ({ script, cohort: cohorts[index], index }));
const [baselineResults, concurrentResults] = await Promise.all([
  Promise.all(scripts.map(script => run(script, { env: script.includes('profile-settings') ? { ULTRA_VIRTUAL_USER_OFFSET: '0', ULTRA_VIRTUAL_USER_COUNT: virtualUsers } : {} }))),
  Promise.all(workerJobs.map(job => run(job.script, {
    runIterations: 1,
    label: `worker-${job.index + 1}/${job.script}`,
    streamOutput: false,
    env: { ULTRA_VIRTUAL_USER_OFFSET: String(job.cohort.offset), ULTRA_VIRTUAL_USER_COUNT: String(job.cohort.count) }
  }).then(result => ({ ...result, cohort: job.cohort }))))
]);
const failed = [
  ...baselineResults.map(result => validateOutput(result, Number(iterations), result.script.includes('profile-settings') ? { offset: 0, count: virtualUserCount } : null)),
  ...concurrentResults.map(result => validateOutput(result, 1, result.script.includes('profile-settings') ? result.cohort : null))
].filter(Boolean);
if (failed.length) {
  console.error(`ULTRA_FAIL failed=${failed.join(',')}`);
  process.exitCode = 1;
} else {
  const baselineTotal = Object.values(expected).reduce((sum, value) => sum + value.total, 0);
  const concurrentTotal = workerJobs.reduce((sum, job) => sum + expected[job.script].total / expected[job.script].iterations, 0);
  console.log(`ULTRA_PASS scripts=${scripts.length} iterations=${iterations} virtual_users=${virtualUsers} total=${baselineTotal} isolated_workers=${workerCount} concurrent_cases=${concurrentTotal} virtual_users_assigned=${cohorts.reduce((sum, cohort) => sum + cohort.count, 0)} note=20m_virtual_users_bounded_not_20m_real_sockets`);
}
