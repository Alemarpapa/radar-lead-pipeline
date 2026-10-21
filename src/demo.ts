import { initDatabase, saveRawSignal, saveQualifiedLead, db } from './db.js';
import { AILeadEnricher } from './pipeline/enricher.js';
import { WebhookDispatcher } from './pipeline/dispatcher.js';
import type { RawSignal } from './schemas/lead.js';

const SAMPLE_SIGNALS: RawSignal[] = [
  {
    id: 'SIG-101',
    source_url: 'https://news.ycombinator.com/item?id=finscale-launch',
    company_name: 'FinScale Payments Corp',
    domain: 'finscale.io',
    raw_text: `
      FinScale Payments Corp recently closed a $12M Series A round.
      Our team of 140 employees is expanding rapidly in New York and remote.
      We are actively hiring Senior AI Infrastructure Engineers and Fullstack Developers.
      Our backend is powered by TypeScript, Node.js, Python, PostgreSQL, and AWS Kubernetes.
      We require strict SOC2 security compliance and automated audit trails.
    `,
    hiring_signal: true,
    discovered_at: new Date().toISOString()
  },
  {
    id: 'SIG-102',
    source_url: 'https://techcrunch.com/nexus-logistics-update',
    company_name: 'Nexus Logistics Cloud',
    domain: 'nexuslogistics.tech',
    raw_text: `
      Nexus Logistics provides modern B2B SaaS transportation management.
      We have 85 team members across North America.
      Our platform utilizes Docker, TypeScript, and Snowflake for real-time tracking.
      Looking for AI automation pipelines to process freight invoices.
    `,
    hiring_signal: false,
    discovered_at: new Date().toISOString()
  },
  {
    id: 'SIG-103',
    source_url: 'https://localdirectory.com/bakery-artisan',
    company_name: 'Artisan Corner Bakery',
    domain: 'artisancorner.com',
    raw_text: `
      Artisan Corner Bakery offers traditional sourdough and pastries.
      Family owned business with 6 team members in downtown Portland.
      Visit our retail shop Monday through Saturday.
    `,
    hiring_signal: false,
    discovered_at: new Date().toISOString()
  }
];

async function runDemo() {
  console.log('================================================================');
  console.log('📡 RadarAI: Autonomous Web Intelligence & Lead Pipeline');
  console.log('================================================================\n');

  initDatabase();
  const enricher = new AILeadEnricher();
  const dispatcher = new WebhookDispatcher();

  console.log(`📥 Ingesting ${SAMPLE_SIGNALS.length} raw market intelligence signals...\n`);

  for (const signal of SAMPLE_SIGNALS) {
    const isNew = saveRawSignal(signal);
    console.log(`[CRAWLER] Signal: ${signal.company_name} (${signal.domain}) - ${isNew ? 'NEW' : 'EXISTING'}`);

    // AI Enrichment
    const enriched = enricher.enrich(signal);
    saveQualifiedLead(enriched);

    console.log(`   🏷️  Industry: ${enriched.industry} | Team: ~${enriched.estimated_headcount}`);
    console.log(`   🎯 ICP Score: ${enriched.icp_score}/100 [${enriched.tier}]`);
    console.log(`   💡 Angle:    "${enriched.suggested_outreach_angle}"`);

    // Webhook Guardrail Dispatch
    try {
      const dispatch = await dispatcher.dispatchLead(enriched);
      console.log(`   🚀 Webhook Dispatched: [HTTP ${dispatch.statusCode}] ID: ${dispatch.webhookId}`);
      console.log(`      HMAC Signature: ${dispatch.signature.slice(0, 24)}...`);
    } catch (err: any) {
      console.log(`   🛡️  ${err.message}`);
    }
    console.log('----------------------------------------------------------------');
  }

  // Database Tabular Overview
  console.log('\n📊 PERSISTED QUALIFIED LEADS (radar.sqlite):');
  const leads = db.prepare(`
    SELECT company_name, domain, industry, icp_score, tier FROM qualified_leads
  `).all();
  console.table(leads);

  console.log('\n📬 WEBHOOK DISPATCH AUDIT LOG:');
  const webhooks = db.prepare(`
    SELECT id, lead_id, target_url, status_code, delivered_at FROM webhook_deliveries
  `).all();
  console.table(webhooks);

  console.log('\n✨ RadarAI pipeline execution complete.');
}

runDemo().catch(console.error);
