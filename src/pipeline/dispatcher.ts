import crypto from 'node:crypto';
import type { EnrichedLead, WebhookPayload } from '../schemas/lead.js';
import { recordWebhookDelivery } from '../db.js';

export interface DispatchResult {
  success: boolean;
  webhookId: string;
  statusCode: number;
  signature: string;
  payload: WebhookPayload;
}

export class WebhookDispatcher {
  private secret: string;

  constructor(secret: string = 'radar_secret_default_key_2026') {
    this.secret = secret;
  }

  /**
   * Generates HMAC SHA256 signature for payload verification
   */
  public generateSignature(payloadString: string): string {
    return crypto
      .createHmac('sha256', this.secret)
      .update(payloadString)
      .digest('hex');
  }

  /**
   * Dispatches qualified lead event to external webhook endpoint (Slack, Discord, CRM)
   */
  public async dispatchLead(
    lead: EnrichedLead,
    targetUrl: string = 'https://api.company.internal/webhooks/radar-leads'
  ): Promise<DispatchResult> {
    // Guardrail: Only dispatch P1_HOT and P2_WARM leads to active channels
    if (lead.tier !== 'P1_HOT' && lead.tier !== 'P2_WARM') {
      throw new Error(`[DISPATCH GUARDRAIL] Lead tier '${lead.tier}' does not meet dispatch threshold.`);
    }

    const webhookId = `WH-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

    const payload: WebhookPayload = {
      event: 'lead.qualified.v1',
      lead_id: `LEAD-${lead.signal_id}`,
      tier: lead.tier,
      icp_score: lead.icp_score,
      company: {
        name: lead.company_name,
        domain: lead.domain,
        industry: lead.industry
      },
      highlights: [
        ...lead.detected_technologies,
        ...lead.intent_signals
      ],
      recommended_action: lead.suggested_outreach_angle,
      timestamp: new Date().toISOString()
    };

    const payloadStr = JSON.stringify(payload);
    const signature = this.generateSignature(payloadStr);

    // Emulate production webhook delivery
    const statusCode = 200; // Simulated HTTP OK
    recordWebhookDelivery(webhookId, `LEAD-${lead.signal_id}`, targetUrl, payload, signature, statusCode);

    return {
      success: true,
      webhookId,
      statusCode,
      signature,
      payload
    };
  }
}
