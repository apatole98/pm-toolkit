const PizZip      = require('pizzip');
const Docxtemplater = require('docxtemplater');
const Anthropic    = require('@anthropic-ai/sdk');
const ExcelJS      = require('exceljs');

const SUPABASE_URL  = 'https://yseddxycyfmnjmbmnsip.supabase.co';
const SUPABASE_ANON = 'sb_publishable_dhQwFgU9-gRY57rksdUfpw_V0fsRv2o';

/* ─────────────────────────────────────────────────────────────────────────────
   TEMPLATE CONFIG  — one entry per document type.
───────────────────────────────────────────────────────────────────────────── */
const TEMPLATES = {

  /* ── 1. Risk Register — FREE (xlsx, exceljs) ─────────────────────────────── */
  'risk-register': {
    name: 'Risk Register — Simplified',
    file: 'Risk_Register_Simplified_Blank__1_.xlsx',
    ext:  'xlsx',
    pro:  false,
    useExceljs: true,
    prompt: (f) => `You are filling in a Risk Register for a real project management engagement.

Project details:
- Project Name: ${f.project_name}
- Team / Group: ${f.team_name}
- Industry: ${f.industry || 'IT / Technology'}
- Project description: ${f.project_description}

Generate exactly 10 realistic, specific risks for this project. Use professional project management language.

Return ONLY a valid JSON array with exactly 10 objects. No markdown, no extra text. Each object has these keys:
[
  {
    "risk_id": "R-001",
    "description": "<specific risk description>",
    "category": "<one of: Schedule | Budget | Technical | Resource | Stakeholder | Compliance | Operational>",
    "probability": "<one of: Low | Medium | High>",
    "impact": "<one of: Low | Medium | High>",
    "response_strategy": "<one of: Mitigate | Accept | Transfer | Avoid>",
    "response_action": "<specific action to take>",
    "owner": "<role responsible e.g. PMO Lead>",
    "residual_risk": "<one of: Low | Medium | High>"
  }
]`,
  },

  /* ── 2. Project Charter — FREE ───────────────────────────────────────────── */
  'charter': {
    name: 'Project Charter Template',
    file: 'Project_Charter_Template.docx',
    ext:  'docx',
    pro:  false,
    prompt: (f) => `You are filling in a Project Charter document for a real professional engagement.

User inputs:
- Project Title: ${f.project_title}
- Executive Sponsor: ${f.sponsor}
- Project Lead: ${f.project_lead}
- Budget: ${f.budget || 'TBD'}
- Start Date: ${f.start_date || 'TBD'}
- End Date: ${f.end_date || 'TBD'}
- Problem / Opportunity Statement: ${f.problem_statement}
- High-level Goal: ${f.goal_statement}

Write professional, concise project management language. No markdown formatting — use plain text.
Use \\n to separate bullet items where needed.

Return ONLY a valid JSON object with exactly these keys. No markdown fences, no extra text.
{
  "project_description": "<2-3 sentence project description>",
  "business_impact": "<Why leadership should fund this — quantify if possible>",
  "current_state": "<What is the current situation / pain>",
  "desired_state": "<What does success look like after the project>",
  "scope": "<Key in-scope deliverables, separated by \\n>",
  "out_of_scope": "<Clear out-of-scope items, separated by \\n>",
  "risk_1": "<Top risk #1 — specific and actionable>",
  "risk_2": "<Top risk #2>",
  "risk_3": "<Top risk #3>",
  "dependencies": "<Key external dependencies, separated by \\n>",
  "smart_goal": "<SMART goal — Specific, Measurable, Achievable, Relevant, Time-bound>",
  "stage1_status": "Planned",
  "stage1_date": "<target date for Assess phase>",
  "stage1_owner": "<role>",
  "stage2_status": "Planned",
  "stage2_date": "<target date for Build phase>",
  "stage2_owner": "<role>",
  "stage3_status": "Planned",
  "stage3_date": "<target date for Launch phase>",
  "stage3_owner": "<role>",
  "stage4_status": "Planned",
  "stage4_date": "<target date for Evaluate phase>",
  "stage4_owner": "<role>"
}`,
  },

  /* ── 3. Client Empathy Map — PRO ─────────────────────────────────────────── */
  'empathy-map': {
    name: 'Client Empathy Map (A3 Printable)',
    file: 'Client_Empathy_Map_A3_Printable_1.docx',
    ext:  'docx',
    pro:  true,
    prompt: (f) => `You are filling in a Client Empathy Map for a project management engagement.

User inputs:
- Account / Client Name: ${f.account_name}
- Project / Engagement: ${f.project_name}
- Client type: ${f.client_type || 'Enterprise'}
- Primary goals (user wrote): ${f.primary_goal}
- Primary fears (user wrote): ${f.primary_fear}
- Success metric (user wrote): ${f.success_metric || 'Project delivered on time and within budget'}

Write from the client's perspective. Be specific and insightful. 1-2 sentences per field.
Use plain text — no markdown, no bullet dashes.

Return ONLY a valid JSON object with exactly these keys. No markdown fences, no extra text.
{
  "account_name": "${f.account_name}",
  "project_name": "${f.project_name}",
  "date_created": "<today's date e.g. 30 May 2026>",
  "first_use_date": "<recommended first review date, 1 week from today>",
  "q1_operational_goal": "<specific operational business outcome they need>",
  "q1_compliance_goal": "<regulatory or compliance objective>",
  "q1_unspoken_goal": "<political or career goal they won't say out loud>",
  "q2_operational_fear": "<their biggest operational fear>",
  "q2_career_fear": "<career or reputational risk they carry>",
  "q2_worst_case": "<worst-case scenario if this project fails>",
  "q3_business_metric": "<the metric they'll report to leadership>",
  "q3_audit_signal": "<audit or compliance signal they watch>",
  "q3_unspoken_kpi": "<their real, unstated success measure>",
  "q3_md_report": "<what they would say to their MD if asked how it's going>",
  "q4_hidden_influencer": "<person with real influence not in our meetings>",
  "q4_regulatory_body": "<relevant regulator or oversight body>",
  "q4_fastest_escalator": "<who escalates fastest when unhappy>"
}`,
  },

  /* ── 4. Stakeholder Mapping — PRO ────────────────────────────────────────── */
  'stakeholder-mapping': {
    name: 'SmartCity Stakeholder Mapping Template',
    file: 'SmartCity_Stakeholder_Mapping_Blank_Template.docx',
    ext:  'docx',
    pro:  true,
    prompt: (f) => `You are filling in a SmartCity Stakeholder Mapping document.

User inputs:
- Project Name: ${f.project_name}
- City / Location: ${f.city_location}
- Contract Value: ${f.contract_value || 'TBD'}
- Timeline: ${f.timeline || 'TBD'}
- Our Role: ${f.our_role}
- Key Challenge: ${f.key_challenge || 'Multi-stakeholder alignment and delivery coordination'}

Write professional, concise project management language. For Power/Interest/Risk use short phrases (e.g. "High / Decision-maker", "Medium / Key approver", "Low risk — aligned"). No markdown.

Return ONLY a valid JSON object with exactly these keys. No markdown fences, no extra text.
{
  "project_name": "${f.project_name}",
  "city_location": "${f.city_location}",
  "timeline": "${f.timeline || 'TBD'}",
  "project_scenario": "<one-line project scenario description>",
  "city_population": "<city population estimate>",
  "project_scope": "<3-4 line project scope summary>",
  "our_role": "${f.our_role}",
  "critical_success_factor": "<the single most critical success factor>",
  "key_risk_flag": "<the key risk or lesson for this type of project>",
  "spv_power": "<power level>", "spv_interest": "<interest level>", "spv_risk": "<risk level>",
  "municipal_comm_power": "<>", "municipal_comm_interest": "<>", "municipal_comm_risk": "<>",
  "cm_office_power": "<>", "cm_office_interest": "<>", "cm_office_risk": "<>",
  "state_it_power": "<>", "state_it_interest": "<>", "state_it_risk": "<>",
  "mohua_power": "<>", "mohua_interest": "<>", "mohua_risk": "<>",
  "finance_audit_power": "<>", "finance_audit_interest": "<>", "finance_audit_risk": "<>",
  "discom_power": "<>", "discom_interest": "<>", "discom_risk": "<>",
  "pwd_power": "<>", "pwd_interest": "<>", "pwd_risk": "<>",
  "ward_councillors_power": "<>", "ward_councillors_interest": "<>", "ward_councillors_risk": "<>",
  "citizens_power": "<>", "citizens_interest": "<>", "citizens_risk": "<>",
  "media_power": "<>", "media_interest": "<>", "media_risk": "<>",
  "delivery_team_power": "<>", "delivery_team_interest": "<>", "delivery_team_risk": "<>"
}`,
  },

};

/* ─────────────────────────────────────────────────────────────────────────────
   HANDLER
───────────────────────────────────────────────────────────────────────────── */
exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  /* ── Parse body ── */
  let templateKey, formData, token;
  try {
    ({ templateKey, formData, token } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid request body' }) };
  }
  if (!templateKey || !formData || !token) {
    return { statusCode: 400, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Missing fields: templateKey, formData, token' }) };
  }

  const tpl = TEMPLATES[templateKey];
  if (!tpl) {
    return { statusCode: 400, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Unknown template key: ' + templateKey }) };
  }

  /* ── 1. Validate Supabase session ── */
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON },
  });
  if (!userRes.ok) {
    return { statusCode: 401, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Session expired. Please log in again.' }) };
  }
  const { id: userId } = await userRes.json();

  /* ── 2. Load profile (tier + usage) ── */
  let profile = { tier: 'free', generations_used: 0, generations_reset_at: null };
  try {
    const pRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=tier,generations_used,generations_reset_at`,
      { headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON } }
    );
    if (pRes.ok) {
      const rows = await pRes.json();
      if (rows.length > 0) profile = { ...profile, ...rows[0] };
    }
  } catch (_) {}

  /* ── 3. Tier gate (Pro templates) ── */
  if (tpl.pro && profile.tier !== 'pro') {
    return { statusCode: 403, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Pro template — upgrade to access.' }) };
  }

  /* ── 4. Free plan usage limit (5 generations / month) ── */
  let currentUsed = 0;
  let resetAt = profile.generations_reset_at ? new Date(profile.generations_reset_at) : null;
  const now = new Date();

  if (profile.tier !== 'pro') {
    currentUsed = (!resetAt || now >= resetAt) ? 0 : (profile.generations_used || 0);
    if (currentUsed >= 5) {
      return {
        statusCode: 429,
        headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Monthly limit reached (5/month on Free plan). Upgrade to Pro for unlimited.' }),
      };
    }
  }

  /* ── 5. Call Anthropic API ── */
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) {
    return { statusCode: 500, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'AI service not configured on server.' }) };
  }

  let aiData;
  try {
    const client  = new Anthropic({ apiKey: ANTHROPIC_KEY });
    const message = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages:   [{ role: 'user', content: tpl.prompt(formData) }],
    });
    const raw     = message.content[0].text.trim();
    const jsonStr = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim();
    aiData        = JSON.parse(jsonStr);
  } catch (e) {
    return { statusCode: 500, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'AI generation failed: ' + e.message }) };
  }

  /* ── 6. Fetch template from static CDN ── */
  const siteUrl = (process.env.URL || 'http://localhost:8888').replace(/\/$/, '');
  /* Risk Register uses original xlsx; others use filled placeholder docx */
  const templatePath = tpl.useExceljs
    ? `/templates/${tpl.file}`
    : `/templates/filled/${tpl.file}`;

  let templateBuffer;
  try {
    const tplRes = await fetch(`${siteUrl}${templatePath}`);
    if (!tplRes.ok) throw new Error(`HTTP ${tplRes.status}`);
    templateBuffer = Buffer.from(await tplRes.arrayBuffer());
  } catch (e) {
    return { statusCode: 500, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Template file unavailable: ' + e.message }) };
  }

  /* ── 7. Fill template ── */
  let outputBuffer;
  try {
    if (tpl.useExceljs) {
      outputBuffer = await fillExcelRiskRegister(templateBuffer, formData, aiData);
    } else {
      const zip = new PizZip(templateBuffer);
      const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
      doc.render(aiData);
      outputBuffer = doc.getZip().generate({ type: 'nodebuffer' });
    }
  } catch (e) {
    return { statusCode: 500, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Template fill error: ' + e.message }) };
  }

  /* ── 8. Update usage counter (best-effort) ── */
  try {
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        generations_used:     currentUsed + 1,
        generations_reset_at: (!resetAt || now >= resetAt)
          ? nextMonth.toISOString()
          : profile.generations_reset_at,
      }),
    });
  } catch (_) {}

  /* ── 9. Save document record (best-effort) ── */
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/documents`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        user_id:       userId,
        template_key:  templateKey,
        template_name: tpl.name,
        form_data:     formData,
      }),
    });
  } catch (_) {}

  /* ── 10. Return filled file ── */
  const outFilename = `${tpl.name.replace(/[^a-z0-9\s]/gi, '').trim().replace(/\s+/g, '_')}.${tpl.ext}`;
  const contentType = tpl.ext === 'xlsx'
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  return {
    statusCode: 200,
    headers: {
      ...cors,
      'Content-Type':        contentType,
      'Content-Disposition': `attachment; filename="${outFilename}"`,
      'X-Generations-Used':  String(currentUsed + 1),
    },
    body:            outputBuffer.toString('base64'),
    isBase64Encoded: true,
  };
};

/* ─────────────────────────────────────────────────────────────────────────────
   EXCEL HELPER — fills Risk Register xlsx with AI risk data
   Columns: A=Risk ID, B=Description, C=Category, D=Probability, E=Impact,
            F=Score (leave formula), G=Response Strategy, H=Response Action,
            I=Owner, J=Residual Risk
   Data rows: 5 – 14 (10 risks)
───────────────────────────────────────────────────────────────────────────── */
async function fillExcelRiskRegister(templateBuffer, formData, risks) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(templateBuffer);

  const ws = wb.worksheets[0];
  if (!ws) throw new Error('No worksheet found in Risk Register template');

  /* Write project header info into row 3 — cells vary per template */
  try {
    ws.getCell('A3').value = formData.team_name || formData.project_name || '';
    ws.getCell('F3').value = formData.project_name || '';
  } catch (_) {}

  const COLS = ['A','B','C','D','E','F','G','H','I','J'];
  const START_ROW = 5;

  const riskArray = Array.isArray(risks) ? risks : [];
  riskArray.slice(0, 15).forEach((r, idx) => {
    const row = START_ROW + idx;
    try {
      ws.getCell(`A${row}`).value = r.risk_id      || `R-${String(idx + 1).padStart(3, '0')}`;
      ws.getCell(`B${row}`).value = r.description  || '';
      ws.getCell(`C${row}`).value = r.category     || '';
      ws.getCell(`D${row}`).value = r.probability  || '';
      ws.getCell(`E${row}`).value = r.impact       || '';
      /* F = Score — leave existing formula, don't overwrite */
      ws.getCell(`G${row}`).value = r.response_strategy || '';
      ws.getCell(`H${row}`).value = r.response_action   || '';
      ws.getCell(`I${row}`).value = r.owner             || '';
      ws.getCell(`J${row}`).value = r.residual_risk     || '';
    } catch (_) {}
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
