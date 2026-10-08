import test from 'node:test';
import assert from 'node:assert';
import { runHealthAISuite } from './health_ai/runner';
import { HEALTH_AI_DATASET } from './health_ai/dataset';

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
      HEALTH_AI_DATASET.length,
      `Expected all ${HEALTH_AI_DATASET.length} health questions to be tested.`
    );

    assert.ok(
      report.summary.passed > 0,
      'Expected passing tests across all viewports.'
    );
  });
});
