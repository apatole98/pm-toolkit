export default async (request) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: cors });
  }
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let inputs, token, docType;
  try {
    ({ inputs, token, docType } = await request.json());
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  if (!token) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  /* ── Verify Supabase session ── */
  const SUPABASE_URL  = 'https://yseddxycyfmnjmbmnsip.supabase.co';
  const SUPABASE_ANON = 'sb_publishable_dhQwFgU9-gRY57rksdUfpw_V0fsRv2o';

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON },
  });
  if (!userRes.ok) {
    return new Response(JSON.stringify({ error: 'Invalid session. Please log in again.' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  /* ── API key ── */
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured on server.' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  /* ── Build prompt for this doc type ── */
  const prompt = buildPrompt(docType, inputs || {});

  /* ── Call Anthropic with streaming ── */
  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!aiRes.ok) {
    const err = await aiRes.text();
    return new Response(JSON.stringify({ error: 'AI error: ' + err }), {
      status: 502, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  /* ── Pipe SSE → plain text stream ── */
  const { readable, writable } = new TransformStream();
  const writer  = writable.getWriter();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  (async () => {
    const reader = aiRes.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              await writer.write(encoder.encode(parsed.delta.text));
            }
          } catch { /* skip malformed */ }
        }
      }
    } finally {
      writer.close();
    }
  })();

  return new Response(readable, {
    headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' },
  });
};

/* ════════════════════════════════════════
   PROMPT BUILDERS — one per doc type
════════════════════════════════════════ */
function buildPrompt(docType, i) {
  switch (docType) {
    case 'charter':     return charterPrompt(i);
    case 'risk':        return riskPrompt(i);
    case 'status':      return statusPrompt(i);
    case 'escalation':  return escalationPrompt(i);
    case 'stakeholder': return stakeholderPrompt(i);
    case 'raid':        return raidPrompt(i);
    default:            return 'Generate a professional PM document based on: ' + JSON.stringify(i);
  }
}

function charterPrompt(i) {
  return `You are a senior Project Management consultant. Generate a complete, professional Project Charter.

PROJECT DETAILS:
- Project Name: ${i['c-name'] || 'Not specified'}
- Objective: ${i['c-objective'] || 'Not specified'}
- Sponsor: ${i['c-sponsor'] || 'Not specified'}
- Project Manager: ${i['c-pm'] || 'Not specified'}
- Start Date: ${i['c-start'] || 'Not specified'}
- End Date: ${i['c-end'] || 'Not specified'}
- Scope: ${i['c-scope'] || 'Not specified'}
- Stakeholders: ${i['c-stakeholders'] || 'Not specified'}
- Budget: ${i['c-budget'] || 'Not specified'}

Generate a complete Project Charter with sections:
# Project Charter: [Project Name]
## 1. Project Overview
## 2. Project Objectives & Success Criteria
## 3. Project Scope (In-Scope & Out-of-Scope)
## 4. Project Timeline & Key Milestones
## 5. Project Team & Roles
## 6. Stakeholder Summary
## 7. Budget Summary
## 8. Key Risks & Assumptions
## 9. Project Approval

Be specific, professional, and directly usable. Infer reasonable details from what was provided.`;
}

function riskPrompt(i) {
  return `You are a senior Project Management consultant. Generate a complete Risk Register.

PROJECT DETAILS:
- Project Name: ${i['r-project'] || 'Not specified'}
- Description: ${i['r-desc'] || 'Not specified'}
- Current Phase: ${i['r-phase'] || 'Not specified'}
- Industry/Domain: ${i['r-industry'] || 'Not specified'}
- Known Risk Areas: ${i['r-known'] || 'None provided'}

Generate a comprehensive Risk Register with:
# Risk Register: [Project Name]
## Overview
## Risk Summary Table
(For each risk include: Risk ID, Description, Category, Likelihood (H/M/L), Impact (H/M/L), Risk Score, Mitigation Strategy, Owner, Status)
## Top Priority Risks — Detailed Analysis
(Expand on the top 5 risks with full mitigation plans)
## Risk Monitoring Plan

Include at least 10-12 risks covering technical, resource, timeline, budget, stakeholder, and external categories. Be specific to the project described.`;
}

function statusPrompt(i) {
  return `You are a senior Project Management consultant. Generate a professional Status Report.

PROJECT DETAILS:
- Project Name: ${i['s-project'] || 'Not specified'}
- Reporting Period: ${i['s-period'] || 'Not specified'}
- Overall Health: ${i['s-health'] || 'Not specified'}
- Completed This Period: ${i['s-done'] || 'Not specified'}
- Planned Next Period: ${i['s-next'] || 'Not specified'}
- Blockers/Issues: ${i['s-blockers'] || 'None'}

Generate a professional Status Report with:
# Project Status Report: [Project Name]
## Executive Summary
## Overall Project Health: [status with RAG indicator]
## Accomplishments This Period
## Plan for Next Period
## Key Metrics & Milestones
## Issues & Blockers
## Risks & Decisions Required
## Team Notes

Use clear, concise language suitable for senior stakeholders.`;
}

function escalationPrompt(i) {
  return `You are a senior Project Management consultant. Generate a complete Escalation Matrix.

PROJECT DETAILS:
- Project Name: ${i['e-project'] || 'Not specified'}
- Description: ${i['e-desc'] || 'Not specified'}
- Project Manager: ${i['e-pm'] || 'Not specified'}
- Sponsor: ${i['e-sponsor'] || 'Not specified'}
- Team Structure: ${i['e-team'] || 'Not specified'}
- Key Stakeholders: ${i['e-stakeholders'] || 'Not specified'}

Generate a complete Escalation Matrix with:
# Escalation Matrix: [Project Name]
## Purpose & Scope
## Escalation Levels
(Level 1: Team Lead, Level 2: Project Manager, Level 3: Sponsor/Director, Level 4: Executive)
## Escalation Triggers by Category
(Technical, Budget, Timeline, Resource, Stakeholder, Risk, Quality)
## Escalation Matrix Table
(Issue Type | Threshold | Escalate To | Timeframe | Method | Resolution Target)
## Escalation Process Flow
## Contact Directory
## Escalation Log Template

Be specific and actionable. Each escalation path should have clear thresholds.`;
}

function stakeholderPrompt(i) {
  return `You are a senior Project Management consultant. Generate a complete Stakeholder Register.

PROJECT DETAILS:
- Project Name: ${i['sh-project'] || 'Not specified'}
- Project Objectives: ${i['sh-objectives'] || 'Not specified'}
- Known Stakeholders: ${i['sh-known'] || 'Not specified'}
- Industry/Domain: ${i['sh-industry'] || 'Not specified'}
- Project Phase: ${i['sh-phase'] || 'Not specified'}

Generate a comprehensive Stakeholder Register with:
# Stakeholder Register: [Project Name]
## Overview
## Stakeholder Summary Table
(Name/Role | Organization | Interest | Influence (H/M/L) | Impact (H/M/L) | Engagement Level | Current Attitude)
## Detailed Stakeholder Profiles
(For each key stakeholder: background, interests, concerns, engagement strategy, communication preference)
## Stakeholder Engagement Plan
## Communication Matrix
(Stakeholder | What | How | Frequency | Owner)
## Stakeholder Influence Map

Include both internal and external stakeholders. Be thorough and specific.`;
}

function raidPrompt(i) {
  return `You are a senior Project Management consultant. Generate a complete RAID Log.

PROJECT DETAILS:
- Project Name: ${i['rd-project'] || 'Not specified'}
- Description: ${i['rd-desc'] || 'Not specified'}
- Current Phase: ${i['rd-phase'] || 'Not specified'}
- Team Size: ${i['rd-team'] || 'Not specified'}
- Known Issues: ${i['rd-issues'] || 'None provided'}
- Key Dependencies: ${i['rd-dependencies'] || 'None provided'}

Generate a comprehensive RAID Log with:
# RAID Log: [Project Name]
## Overview & Purpose

## RISKS
(ID | Risk Description | Likelihood | Impact | Score | Mitigation | Owner | Status)
Include 8-10 risks.

## ASSUMPTIONS
(ID | Assumption | Basis | Impact if Wrong | Validation Method | Owner | Status)
Include 6-8 assumptions.

## ISSUES
(ID | Issue Description | Priority | Impact | Resolution Plan | Owner | Target Date | Status)
Include 5-6 issues.

## DEPENDENCIES
(ID | Dependency | Type | From | To | Impact | Status | Notes)
Include 5-6 dependencies.

## RAID Review Schedule
## Change Log Template

Be specific to the project. Each item should be actionable.`;
}

export const config = { path: '/api/generate-document' };
