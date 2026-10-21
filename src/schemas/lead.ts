import { z } from 'zod';

export const RawSignalSchema = z.object({
  id: z.string().min(1),
  source_url: z.string().url(),
  company_name: z.string().min(1),
  domain: z.string().min(1),
  raw_text: z.string().min(10),
  hiring_signal: z.boolean().default(false),
  discovered_at: z.string().datetime().default(() => new Date().toISOString())
});

export type RawSignal = z.infer<typeof RawSignalSchema>;

export const ICPTierSchema = z.enum(['P1_HOT', 'P2_WARM', 'P3_NURTURE', 'DISQUALIFIED']);
export type ICPTier = z.infer<typeof ICPTierSchema>;

export const EnrichedLeadSchema = z.object({
  signal_id: z.string(),
  company_name: z.string(),
  domain: z.string(),
  industry: z.string(),
  estimated_headcount: z.number().int().positive(),
  detected_technologies: z.array(z.string()).default([]),
  intent_signals: z.array(z.string()).default([]),
  icp_score: z.number().min(0).max(100),
  tier: ICPTierSchema,
  ai_qualification_rationale: z.string(),
  suggested_outreach_angle: z.string(),
  enriched_at: z.string().datetime().default(() => new Date().toISOString())
});

export type EnrichedLead = z.infer<typeof EnrichedLeadSchema>;

export const WebhookPayloadSchema = z.object({
  event: z.literal('lead.qualified.v1'),
  lead_id: z.string(),
  tier: ICPTierSchema,
  icp_score: z.number(),
  company: z.object({
    name: z.string(),
    domain: z.string(),
    industry: z.string()
  }),
  highlights: z.array(z.string()),
  recommended_action: z.string(),
  timestamp: z.string().datetime()
});

export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;
