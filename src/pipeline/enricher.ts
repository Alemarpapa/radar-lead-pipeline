import type { RawSignal, EnrichedLead, ICPTier } from '../schemas/lead.js';

export class AILeadEnricher {
  private static TECH_KEYWORDS: Record<string, string[]> = {
    'TypeScript / Node.js': ['typescript', 'node.js', 'nodejs', 'express', 'nestjs'],
    'Python & AI': ['python', 'pytorch', 'langchain', 'openai', 'llm', 'rag', 'pydantic'],
    'Cloud & DevOps': ['aws', 'kubernetes', 'docker', 'terraform', 'gcp'],
    'Data Infrastructure': ['postgresql', 'snowflake', 'databricks', 'clickhouse', 'sqlite']
  };

  private static HIGH_VALUE_INDUSTRIES = [
    'FinTech & Payments',
    'B2B SaaS',
    'Healthcare AI',
    'Logistics & Supply Chain'
  ];

  /**
   * Enriches a raw web signal with AI-guided qualification, scoring, and personalized outreach angles
   */
  public enrich(signal: RawSignal): EnrichedLead {
    const textLower = signal.raw_text.toLowerCase();

    // 1. Detect Technologies
    const detectedTech: string[] = [];
    for (const [category, keywords] of Object.entries(AILeadEnricher.TECH_KEYWORDS)) {
      if (keywords.some(kw => textLower.includes(kw))) {
        detectedTech.push(category);
      }
    }

    // 2. Detect Intent & Expansion Signals
    const intentSignals: string[] = [];
    if (signal.hiring_signal || textLower.includes('hiring') || textLower.includes('careers') || textLower.includes('engineering team')) {
      intentSignals.push('Active Engineering Hiring');
    }
    if (textLower.includes('series a') || textLower.includes('seed funding') || textLower.includes('venture') || textLower.includes('funding')) {
      intentSignals.push('Recent Capital Influx / Growth Phase');
    }
    if (textLower.includes('security') || textLower.includes('soc2') || textLower.includes('compliance') || textLower.includes('audit')) {
      intentSignals.push('Enterprise Compliance & Guardrail Focus');
    }

    // 3. Classify Industry
    let industry = 'General B2B Technology';
    for (const ind of AILeadEnricher.HIGH_VALUE_INDUSTRIES) {
      const keyword = ind.split(' ')[0].toLowerCase();
      if (textLower.includes(keyword)) {
        industry = ind;
        break;
      }
    }

    // 4. Heuristic Headcount Extraction
    let headcount = 75; // Default sweet spot
    const hcMatch = textLower.match(/(\d+)\s*(?:employees|team members|people)/);
    if (hcMatch) {
      headcount = parseInt(hcMatch[1], 10);
    }

    // 5. Calculate Deterministic ICP Score
    let score = 0;
    const rationaleParts: string[] = [];

    // Headcount criteria (sweet spot 30 - 300)
    if (headcount >= 30 && headcount <= 300) {
      score += 30;
      rationaleParts.push(`Optimal headcount tier (${headcount} staff = +30pts)`);
    } else if (headcount > 300) {
      score += 15;
      rationaleParts.push(`Enterprise headcount (${headcount} staff = +15pts)`);
    } else {
      score += 10;
      rationaleParts.push(`Early-stage headcount (${headcount} staff = +10pts)`);
    }

    // Tech stack alignment
    if (detectedTech.length > 0) {
      const techPoints = Math.min(detectedTech.length * 10, 30);
      score += techPoints;
      rationaleParts.push(`Modern stack match: ${detectedTech.join(', ')} (+${techPoints}pts)`);
    }

    // Intent signals
    if (intentSignals.length > 0) {
      const intentPoints = Math.min(intentSignals.length * 15, 30);
      score += intentPoints;
      rationaleParts.push(`Strong intent triggers: ${intentSignals.join(' | ')} (+${intentPoints}pts)`);
    }

    // Industry bonus
    if (AILeadEnricher.HIGH_VALUE_INDUSTRIES.includes(industry)) {
      score += 10;
      rationaleParts.push(`Target industry premium: ${industry} (+10pts)`);
    }

    score = Math.min(score, 100);

    // 6. Assign Tier
    let tier: ICPTier = 'DISQUALIFIED';
    if (score >= 80) {
      tier = 'P1_HOT';
    } else if (score >= 60) {
      tier = 'P2_WARM';
    } else if (score >= 40) {
      tier = 'P3_NURTURE';
    }

    // 7. Generate Personalized Outreach Angle
    let suggestedAngle = '';
    if (tier === 'P1_HOT') {
      suggestedAngle = `Target CTO/VP of Engineering. Pitch autonomous AI Ops Bridges & Document Ingestion to accelerate their current hiring roadmap with zero production downtime.`;
    } else if (tier === 'P2_WARM') {
      suggestedAngle = `Target Product Lead. Highlight how deterministic Structured Outputs can automate their manual workflow without LLM hallucinations.`;
    } else {
      suggestedAngle = `Add to quarterly nurture campaign focused on AI developer infrastructure case studies.`;
    }

    return {
      signal_id: signal.id,
      company_name: signal.company_name,
      domain: signal.domain,
      industry,
      estimated_headcount: headcount,
      detected_technologies: detectedTech,
      intent_signals: intentSignals,
      icp_score: score,
      tier,
      ai_qualification_rationale: rationaleParts.join('; '),
      suggested_outreach_angle: suggestedAngle,
      enriched_at: new Date().toISOString()
    };
  }
}
