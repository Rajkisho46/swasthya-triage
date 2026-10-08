import test from 'node:test';
import assert from 'node:assert';
import { runHealthAISuite } from './health_ai/runner';

test('SWASTHYA TRIAGE V16 — AUTOMATED HEALTH AI FUNCTIONAL TEST SUITE', async (t) => {
  await t.test('Execute complete Health AI functional suite across desktop & mobile', async () => {
    const report = await runHealthAISuite();

    assert.strictEqual(
      report.summary.failed,
      0,
      `Expected 0 failures in Health AI functional suite, got ${report.summary.failed}. Details: ${JSON.stringify(report.failures, null, 2)}`
    );

    assert.strictEqual(
      report.summary.uniqueQuestions,
      32,
      'Expected all 32 health questions (HA-001 through HA-032) to be tested.'
    );

    assert.ok(
      report.summary.passed > 0,
      'Expected passing tests across all viewports.'
    );
  });
});
