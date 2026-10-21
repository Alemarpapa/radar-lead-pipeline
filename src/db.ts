import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import type { RawSignal, EnrichedLead, WebhookPayload } from './schemas/lead.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'radar.sqlite');
export const db: Database.Database = new Database(DB_PATH);

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS raw_signals (
      id TEXT PRIMARY KEY,
      source_url TEXT NOT NULL,
      company_name TEXT NOT NULL,
      domain TEXT NOT NULL UNIQUE,
      raw_text TEXT NOT NULL,
      hiring_signal INTEGER NOT NULL,
      discovered_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS qualified_leads (
      id TEXT PRIMARY KEY,
      signal_id TEXT NOT NULL,
      company_name TEXT NOT NULL,
      domain TEXT NOT NULL UNIQUE,
      industry TEXT NOT NULL,
      estimated_headcount INTEGER NOT NULL,
      detected_technologies TEXT NOT NULL,
      intent_signals TEXT NOT NULL,
      icp_score REAL NOT NULL,
      tier TEXT NOT NULL CHECK(tier IN ('P1_HOT', 'P2_WARM', 'P3_NURTURE', 'DISQUALIFIED')),
      ai_qualification_rationale TEXT NOT NULL,
      suggested_outreach_angle TEXT NOT NULL,
      enriched_at TEXT NOT NULL,
      FOREIGN KEY(signal_id) REFERENCES raw_signals(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL,
      target_url TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      signature TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      delivered_at TEXT NOT NULL,
      FOREIGN KEY(lead_id) REFERENCES qualified_leads(id) ON DELETE CASCADE
    );
  `);
}

export function saveRawSignal(signal: RawSignal): boolean {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO raw_signals (id, source_url, company_name, domain, raw_text, hiring_signal, discovered_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const res = stmt.run(
    signal.id,
    signal.source_url,
    signal.company_name,
    signal.domain,
    signal.raw_text,
    signal.hiring_signal ? 1 : 0,
    signal.discovered_at
  );
  return res.changes > 0;
}

export function saveQualifiedLead(lead: EnrichedLead): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO qualified_leads (
      id, signal_id, company_name, domain, industry,
      estimated_headcount, detected_technologies, intent_signals,
      icp_score, tier, ai_qualification_rationale, suggested_outreach_angle, enriched_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    `LEAD-${lead.signal_id}`,
    lead.signal_id,
    lead.company_name,
    lead.domain,
    lead.industry,
    lead.estimated_headcount,
    JSON.stringify(lead.detected_technologies),
    JSON.stringify(lead.intent_signals),
    lead.icp_score,
    lead.tier,
    lead.ai_qualification_rationale,
    lead.suggested_outreach_angle,
    lead.enriched_at
  );
}

export function recordWebhookDelivery(
  id: string,
  leadId: string,
  targetUrl: string,
  payload: WebhookPayload,
  signature: string,
  statusCode: number
): void {
  const stmt = db.prepare(`
    INSERT INTO webhook_deliveries (id, lead_id, target_url, payload_json, signature, status_code, delivered_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    leadId,
    targetUrl,
    JSON.stringify(payload),
    signature,
    statusCode,
    new Date().toISOString()
  );
}
