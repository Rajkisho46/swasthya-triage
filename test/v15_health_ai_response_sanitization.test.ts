import test from 'node:test';
import assert from 'node:assert';
import { sanitizeHealthAIResponse, sanitizeHealthAIList } from '../src/utils/sanitizeHealthAI';

test('SWASTHYA TRIAGE V15 — HEALTH AI RESPONSE SANITIZATION & NORMALIZATION SUITE', async (t) => {
  await t.test('1. Cleans bold, italic, and inline markdown syntax without altering text', () => {
    const raw = '**Hemoglobin:** 8.2 g/dL - Low\n*White Blood Cells:* 14,200 /uL - High\n__Platelets:__ 95,000 /uL - Low';
    const result = sanitizeHealthAIResponse(raw);
    assert.strictEqual(
      result,
      'Hemoglobin: 8.2 g/dL - Low\nWhite Blood Cells: 14,200 /uL - High\nPlatelets: 95,000 /uL - Low'
    );
  });

  await t.test('2. Removes bullet markers (-, *, +, •) while preserving line breaks', () => {
    const raw = '- Drink enough water\n- Rest properly\n- Monitor your symptoms';
    const result = sanitizeHealthAIResponse(raw);
    assert.strictEqual(
      result,
      'Drink enough water\nRest properly\nMonitor your symptoms'
    );
  });

  await t.test('3. Fixes the specific bullet header markdown leak (*- **Parameter:**)', () => {
    const raw = [
      '- **Hemoglobin/Hematocrit:** Often checked for anemia.',
      '- **White Blood Cell (WBC) Count:** Can be elevated.',
      '- **Platelets:** Important for clotting.'
    ].join('\n');

    const result = sanitizeHealthAIResponse(raw);
    const expected = [
      'Hemoglobin/Hematocrit: Often checked for anemia.',
      'White Blood Cell (WBC) Count: Can be elevated.',
      'Platelets: Important for clotting.'
    ].join('\n');

    assert.strictEqual(result, expected);
  });

  await t.test('4. Strips decorative emojis and unicode symbols (⚠, →, 📋, etc.)', () => {
    const raw = [
      '### 📋 What this means',
      '⚠ Seek urgent medical attention if symptoms worsen.',
      '→ Follow up with your doctor.'
    ].join('\n');

    const result = sanitizeHealthAIResponse(raw);
    const expected = [
      'What this means',
      'Seek urgent medical attention if symptoms worsen.',
      'Follow up with your doctor.'
    ].join('\n');

    assert.strictEqual(result, expected);
  });

  await t.test('5. Preserves legitimate medical hyphens, ranges, units, and punctuation', () => {
    const raw = '**Status:** Follow-up for COVID-19 required.\n**Scale:** Pain is 4-6 on a 0-10 scale.\n**Reference:** 13.0-17.0 g/dL (98% baseline, 10-20 minutes).';
    const result = sanitizeHealthAIResponse(raw);
    assert.ok(result.includes('Follow-up'));
    assert.ok(result.includes('COVID-19'));
    assert.ok(result.includes('4-6'));
    assert.ok(result.includes('0-10'));
    assert.ok(result.includes('13.0-17.0 g/dL'));
    assert.ok(result.includes('98%'));
    assert.ok(result.includes('10-20 minutes'));
    assert.ok(!result.includes('**'));
  });

  await t.test('6. Converts headings to clean plain text and preserves clean paragraph spacing', () => {
    const raw = `### What this means
Mild headaches can occur due to dehydration, lack of sleep, stress, or eye strain.

### What you can do
- Rest in a quiet environment.
- Drink enough water.
- Take a break from screens.

### When to seek medical attention
Seek medical attention if the headache becomes severe.`;

    const result = sanitizeHealthAIResponse(raw);
    const expected = `What this means
Mild headaches can occur due to dehydration, lack of sleep, stress, or eye strain.

What you can do
Rest in a quiet environment.
Drink enough water.
Take a break from screens.

When to seek medical attention
Seek medical attention if the headache becomes severe.`;

    assert.strictEqual(result, expected.replace(/\r\n/g, '\n'));
  });

  await t.test('7. sanitizeHealthAIList cleanly sanitizes array of clinical points', () => {
    const rawList = [
      '**Hemoglobin:** 10.2 g/dL (Below reference range: 13.0 - 17.0 g/dL)',
      '• **Total WBC Count:** 14,500 /uL (Above reference range: 4,000 - 11,000 /uL)',
      '→ Bring this original report to your consultation.'
    ];

    const cleanedList = sanitizeHealthAIList(rawList);
    assert.deepStrictEqual(cleanedList, [
      'Hemoglobin: 10.2 g/dL (Below reference range: 13.0 - 17.0 g/dL)',
      'Total WBC Count: 14,500 /uL (Above reference range: 4,000 - 11,000 /uL)',
      'Bring this original report to your consultation.'
    ]);
  });
});
