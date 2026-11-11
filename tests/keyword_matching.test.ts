import { describe, it, expect } from 'vitest';
import { AILeadEnricher } from '../src/pipeline/enricher.js';

const enricher = new AILeadEnricher();
const tech = (raw_text: string) =>
  enricher.enrich({
    id: 'k1',
    source_url: 'https://example.com/x',
    company_name: 'Kw Co',
    domain: 'kw.example.com',
    raw_text,
    hiring_signal: false,
    discovered_at: new Date().toISOString(),
  }).detected_technologies;

describe('tech keyword matching uses whole words', () => {
  it('does not match keywords hidden inside other words (storage, law books)', () => {
    expect(tech('We sell storage units and law books to local customers.')).toEqual([]);
  });

  it('still matches real keywords, including ones with punctuation', () => {
    const found = tech('Our stack: Node.js, AWS and PostgreSQL; we also use RAG with OpenAI.');
    expect(found).toEqual(expect.arrayContaining(['TypeScript / Node.js', 'Cloud & DevOps', 'Data Infrastructure', 'Python & AI']));
  });
});
