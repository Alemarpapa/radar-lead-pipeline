import { describe, it, expect, beforeAll } from 'vitest';
import { AILeadEnricher } from '../src/pipeline/enricher.js';
import { WebhookDispatcher } from '../src/pipeline/dispatcher.js';
import { RawSignalSchema, type RawSignal } from '../src/schemas/lead.js';

describe('RadarAI - Autonomous Pipeline Test Suite', () => {
  let enricher: AILeadEnricher;
  let dispatcher: WebhookDispatcher;

  beforeAll(() => {
    enricher = new AILeadEnricher();
    dispatcher = new WebhookDispatcher('test_secret_key');
  });

  it('should validate and parse valid RawSignal schema', () => {
    const rawData = {
      id: 'SIG-TEST-1',
      source_url: 'https://example.com/company',
      company_name: 'Test Systems Inc',
      domain: 'testsystems.io',
      raw_text: 'We build cloud native microservices with TypeScript and Python.',
      hiring_signal: true,
      discovered_at: new Date().toISOString()
    };

    const parsed = RawSignalSchema.safeParse(rawData);
    expect(parsed.success).toBe(true);
  });

  it('should qualify high-intent tech company as P1_HOT lead with score >= 80', () => {
    const signal: RawSignal = {
      id: 'SIG-TEST-HOT',
      source_url: 'https://growth.tech/jobs',
      company_name: 'ScaleFin AI LLC',
      domain: 'scalefin.ai',
      raw_text: `
        ScaleFin AI is a FinTech startup with 120 employees.
        Recently closed Series A funding. We are actively hiring Senior AI Engineers.
        Tech stack includes TypeScript, Python, PyTorch, Kubernetes, and PostgreSQL.
      `,
      hiring_signal: true,
      discovered_at: new Date().toISOString()
    };

    const lead = enricher.enrich(signal);
    expect(lead.tier).toBe('P1_HOT');
    expect(lead.icp_score).toBeGreaterThanOrEqual(80);
    expect(lead.detected_technologies).toContain('Python & AI');
    expect(lead.detected_technologies).toContain('TypeScript / Node.js');
  });

  it('should disqualify non-tech early businesses', () => {
    const signal: RawSignal = {
      id: 'SIG-TEST-LOW',
      source_url: 'https://localplumber.com',
      company_name: 'Quick Plumbing Services',
      domain: 'quickplumbing.com',
      raw_text: 'Local plumbing repair with 3 team members in suburban area.',
      hiring_signal: false,
      discovered_at: new Date().toISOString()
    };

    const lead = enricher.enrich(signal);
    expect(lead.tier).toBe('DISQUALIFIED');
    expect(lead.icp_score).toBeLessThan(40);
  });

  it('should enforce guardrail blocking webhooks for disqualified leads', async () => {
    const disqualifiedLead = enricher.enrich({
      id: 'SIG-DISQ',
      source_url: 'https://smallshop.com',
      company_name: 'Small Shop',
      domain: 'smallshop.com',
      raw_text: 'Neighborhood flower shop with 2 people.',
      hiring_signal: false,
      discovered_at: new Date().toISOString()
    });

    await expect(dispatcher.dispatchLead(disqualifiedLead)).rejects.toThrow(
      /DISPATCH GUARDRAIL/
    );
  });

  it('should generate valid HMAC SHA256 signatures for webhook verification', () => {
    const payload = JSON.stringify({ event: 'test', data: 123 });
    const sig1 = dispatcher.generateSignature(payload);
    const sig2 = dispatcher.generateSignature(payload);

    expect(sig1).toBe(sig2);
    expect(sig1.length).toBe(64); // SHA256 hex length
  });
});
