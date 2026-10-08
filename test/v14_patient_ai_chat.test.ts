import test from 'node:test';
import assert from 'node:assert';
import { patientChatClient } from '../src/services/ai/patientChatClient';

test('SWASTHYA TRIAGE V14 — NATURAL & INTELLIGENT CLINICAL CONVERSATIONAL AI SUITE', async (t) => {
  await t.test('SCENARIO 1: Natural Headache Response (1-2 Questions, No Robotic Checklist)', async () => {
    const res = await patientChatClient.sendMessage({
      messages: [
        { role: 'user', content: "I've had a headache since yesterday." }
      ],
      preferredLanguage: 'English'
    });

    assert.strictEqual(res.is_healthcare_related, true);
    assert.ok(
      res.reply.toLowerCase().includes('where') || res.reply.toLowerCase().includes('narrow this down'),
      'Must ask natural question about location and onset style'
    );
    assert.ok(
      !res.reply.toLowerCase().includes('to help structure your'),
      'Must NOT contain robotic questionnaire phrasing'
    );
    assert.ok(
      !res.reply.toLowerCase().includes('for clinical review:'),
      'Must NOT contain clinical review checklist header'
    );
  });

  await t.test('SCENARIO 2: Context Awareness & Adaptive Memory (Does NOT Repeat Questions)', async () => {
    const history = [
      { role: 'user' as const, content: "I've had a headache since yesterday." },
      { role: 'assistant' as const, content: "I can help you narrow this down. Where exactly does the headache hurt, and did it start suddenly or build up gradually?" },
      { role: 'user' as const, content: "It's on the right side and started gradually." }
    ];

    const res = await patientChatClient.sendMessage({
      messages: history,
      preferredLanguage: 'English'
    });

    assert.strictEqual(res.is_healthcare_related, true);
    assert.ok(
      !res.reply.toLowerCase().includes('when did it start'),
      'Must NOT ask when it started again because it already knows'
    );
    assert.ok(
      res.reply.toLowerCase().includes('scale') || res.reply.toLowerCase().includes('severe') || res.reply.toLowerCase().includes('different'),
      'Must adaptively ask severity or previous history'
    );
  });

  await t.test('SCENARIO 3: Associated Symptom Continuity (Nausea connects to Headache)', async () => {
    const history = [
      { role: 'user' as const, content: "I've had a headache since yesterday." },
      { role: 'assistant' as const, content: "I can help you narrow this down. Where exactly does the headache hurt, and did it start suddenly or build up gradually?" },
      { role: 'user' as const, content: "It's on the right side and started gradually." },
      { role: 'assistant' as const, content: "Thanks. How severe is it right now on a scale of 0–10?" },
      { role: 'user' as const, content: "I also feel nauseous." }
    ];

    const res = await patientChatClient.sendMessage({
      messages: history,
      preferredLanguage: 'English'
    });

    assert.strictEqual(res.is_healthcare_related, true);
    assert.ok(
      res.reply.toLowerCase().includes('nausea') || res.reply.toLowerCase().includes('migraine') || res.reply.toLowerCase().includes('light'),
      'Must connect nausea to headache context naturally'
    );
  });

  await t.test('SCENARIO 4: Urgency Red Flag Detection (Worst Headache of Life)', async () => {
    const res = await patientChatClient.sendMessage({
      messages: [
        { role: 'user', content: "Actually it's the worst headache I've ever had and it came suddenly." }
      ],
      preferredLanguage: 'English'
    });

    assert.strictEqual(res.urgency_detected, true, 'Urgency must be activated for sudden worst headache');
    assert.strictEqual(res.urgency_level, 'emergency');
    assert.ok(res.suggested_actions.includes('Seek Emergency Care'));
    assert.ok(
      res.reply.toLowerCase().includes('urgent') || res.reply.toLowerCase().includes('emergency'),
      'Must recommend urgent medical evaluation'
    );
  });

  await t.test('SCENARIO 5: Healthcare-Only Restriction (Reject Coding/Off-topic)', async () => {
    const res = await patientChatClient.sendMessage({
      messages: [
        { role: 'user', content: "Write Python code to sort an array." }
      ],
      preferredLanguage: 'English'
    });

    assert.strictEqual(res.is_healthcare_related, false);
    assert.ok(
      res.reply.includes('Swasthya Triage Health Assistant') || res.reply.includes('healthcare-related'),
      'Must politely redirect off-topic request to healthcare domain'
    );
  });

  await t.test('SCENARIO 6: Natural Fever Follow-Up (Duration & Temperature)', async () => {
    const res = await patientChatClient.sendMessage({
      messages: [
        { role: 'user', content: "I have fever." }
      ],
      preferredLanguage: 'English'
    });

    assert.strictEqual(res.is_healthcare_related, true);
    assert.ok(
      res.reply.toLowerCase().includes('how long') || res.reply.toLowerCase().includes('temperature'),
      'Must ask about duration and temperature naturally'
    );
  });

  await t.test('SCENARIO 7: Conversational Medical Report Explanation', async () => {
    const res = await patientChatClient.sendMessage({
      messages: [
        { role: 'user', content: "I uploaded my CBC lab report." }
      ],
      attachments: [
        {
          file_name: 'cbc_report.pdf',
          file_type: 'application/pdf',
          extracted_text: 'HEMOGLOBIN: 9.8 g/dL (Ref: 13.0 - 17.0)',
          file_size_bytes: 120000,
        }
      ],
      preferredLanguage: 'English'
    });

    assert.strictEqual(res.is_healthcare_related, true);
    assert.ok(
      res.reply.toLowerCase().includes('hemoglobin') || res.reply.toLowerCase().includes('reference range'),
      'Must discuss the lab report findings conversationally'
    );
    assert.ok(
      res.reply.toLowerCase().includes('explain') || res.reply.toLowerCase().includes('result'),
      'Must offer conversational step-by-step explanation'
    );
  });

  await t.test('SCENARIO 8: Voice Transcription Input & Contextual Healthcare Reply', async () => {
    const res = await patientChatClient.sendMessage({
      messages: [
        {
          role: 'user',
          content: "I've been feeling weak and dizzy since yesterday.",
          voice_used: true
        }
      ],
      preferredLanguage: 'English'
    });

    assert.strictEqual(res.is_healthcare_related, true);
    assert.ok(
      res.reply.toLowerCase().includes('constant') || res.reply.toLowerCase().includes('stand up') || res.reply.toLowerCase().includes('move'),
      'Must ask natural follow-up regarding constant vs positional dizziness'
    );
  });
});
