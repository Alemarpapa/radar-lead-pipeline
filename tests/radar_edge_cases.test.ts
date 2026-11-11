import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AILeadEnricher } from '../src/pipeline/enricher.js';
import { RawSignalSchema, WebhookPayloadSchema, type RawSignal } from '../src/schemas/lead.js';

const enricher = new AILeadEnricher();

const sig = (id: string, raw_text: string, hiring_signal = false): RawSignal => ({
  id,
  source_url: 'https://example.com/x',
  company_name: `Co ${id}`,
  domain: `${id.toLowerCase()}.example.com`,
  raw_text,
  hiring_signal,
  discovered_at: new Date().toISOString(),
});

describe('RawSignalSchema validation', () => {
  const valid = { id: 's1', source_url: 'https://example.com', company_name: 'Acme', domain: 'acme.io', raw_text: 'long enough text' };

  it('rejects bad url, too-short raw_text and non-ISO discovered_at; applies defaults otherwise', () => {
    expect(RawSignalSchema.safeParse({ ...valid, source_url: 'not-a-url' }).success).toBe(false);
    expect(RawSignalSchema.safeParse({ ...valid, raw_text: 'short' }).success).toBe(false);
    expect(RawSignalSchema.safeParse({ ...valid, discovered_at: '2026-10-19' }).success).toBe(false);

    const ok = RawSignalSchema.parse(valid);
    expect(ok.hiring_signal).toBe(false);
    expect(new Date(ok.discovered_at).toISOString()).toBe(ok.discovered_at);
  });
});

describe('AILeadEnricher scoring boundaries', () => {
  it('headcount tiers: 29 -> +10, 30 and 300 -> +30, 301 -> +15', () => {
    const score = (n: number) => enricher.enrich(sig(`HC${n}`, `A generic firm with ${n} employees.`)).icp_score;
    expect(score(29)).toBe(10);
    expect(score(30)).toBe(30);
    expect(score(300)).toBe(30);
    expect(score(301)).toBe(15);
  });

  it('lands exactly on score 40 as P3_NURTURE with the nurture angle', () => {
    const lead = enricher.enrich(sig('P3', 'A shop with 100 employees running docker.'));
    expect(lead.icp_score).toBe(40);
    expect(lead.tier).toBe('P3_NURTURE');
    expect(lead.suggested_outreach_angle).toContain('nurture campaign');
  });

  it('lands on P2_WARM (65) with industry premium, hiring signal and a single tech category; rationale explains each part', () => {
    const lead = enricher.enrich(sig('P2', 'B2B SaaS company with 50 employees using python.', true));
    expect(lead.industry).toBe('B2B SaaS');
    expect(lead.detected_technologies).toEqual(['Python & AI']);
    expect(lead.intent_signals).toEqual(['Active Engineering Hiring']);
    expect(lead.icp_score).toBe(65); // 30 headcount + 10 tech + 15 intent + 10 industry
    expect(lead.tier).toBe('P2_WARM');
    expect(lead.ai_qualification_rationale).toContain('Target industry premium: B2B SaaS (+10pts)');
  });

  it('caps tech and intent points and never exceeds 100', () => {
    const lead = enricher.enrich(sig('MAX', 'FinTech with 100 employees. Python, aws, typescript, postgresql. Hiring, series a funding, soc2 compliance.', true));
    expect(lead.detected_technologies).toHaveLength(4); // 40 raw points, capped at 30
    expect(lead.intent_signals).toHaveLength(3); // 45 raw points, capped at 30
    expect(lead.icp_score).toBe(100);
    expect(lead.tier).toBe('P1_HOT');
  });
});

describe('WebhookDispatcher + persistence (isolated sqlite)', () => {
  const originalCwd = process.cwd();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-'));
  let dbMod: typeof import('../src/db.js');
  let dispatcherMod: typeof import('../src/pipeline/dispatcher.js');

  beforeAll(async () => {
    // db.ts opens ./data/radar.sqlite relative to cwd at import time; isolate it in a temp dir.
    process.chdir(tmpDir);
    dbMod = await import('../src/db.js');
    dispatcherMod = await import('../src/pipeline/dispatcher.js');
    process.chdir(originalCwd);
    dbMod.initDatabase();
  });

  afterAll(() => {
    dbMod.db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const deliveries = () => (dbMod.db.prepare('SELECT COUNT(*) c FROM webhook_deliveries').get() as any).c as number;

  it('saveRawSignal ignores a duplicate domain and reports false', () => {
    const a = sig('DUP1', 'First sighting of this company domain.');
    const b = { ...sig('DUP2', 'Second sighting, same domain.'), domain: a.domain };
    expect(dbMod.saveRawSignal(a)).toBe(true);
    expect(dbMod.saveRawSignal(b)).toBe(false);
    expect((dbMod.db.prepare('SELECT COUNT(*) c FROM raw_signals WHERE domain = ?').get(a.domain) as any).c).toBe(1);
  });

  it('dispatches a P2_WARM lead: signed payload matches the stored delivery and passes the webhook schema', async () => {
    const raw = sig('WARM', 'B2B SaaS company with 50 employees using python.', true);
    dbMod.saveRawSignal(raw);
    const lead = enricher.enrich(raw);
    expect(lead.tier).toBe('P2_WARM');
    dbMod.saveQualifiedLead(lead);

    const result = await new dispatcherMod.WebhookDispatcher('s3cret').dispatchLead(lead, 'https://hooks.test/x');

    expect(result.success).toBe(true);
    expect(result.payload.lead_id).toBe('LEAD-WARM');
    expect(result.payload.highlights).toEqual([...lead.detected_technologies, ...lead.intent_signals]);
    expect(WebhookPayloadSchema.safeParse(result.payload).success).toBe(true);

    const row = dbMod.db.prepare('SELECT * FROM webhook_deliveries WHERE id = ?').get(result.webhookId) as any;
    expect(row.target_url).toBe('https://hooks.test/x');
    expect(row.status_code).toBe(200);
    const expected = crypto.createHmac('sha256', 's3cret').update(row.payload_json).digest('hex');
    expect(row.signature).toBe(expected);
    expect(result.signature).toBe(expected);
  });

  it('blocks P3_NURTURE leads too and records nothing; different secrets give different signatures', async () => {
    const lead = enricher.enrich(sig('NURT', 'A shop with 100 employees running docker.'));
    expect(lead.tier).toBe('P3_NURTURE');

    const before = deliveries();
    await expect(new dispatcherMod.WebhookDispatcher('s3cret').dispatchLead(lead)).rejects.toThrow(/does not meet dispatch threshold/);
    expect(deliveries()).toBe(before);

    const p = '{"a":1}';
    expect(new dispatcherMod.WebhookDispatcher('one').generateSignature(p)).not.toBe(new dispatcherMod.WebhookDispatcher('two').generateSignature(p));
  });
});
