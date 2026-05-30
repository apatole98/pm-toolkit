const PizZip    = require('pizzip');
const Docxtemplater = require('docxtemplater');
const Anthropic = require('@anthropic-ai/sdk');

const SUPABASE_URL  = 'https://yseddxycyfmnjmbmnsip.supabase.co';
const SUPABASE_ANON = 'sb_publishable_dhQwFgU9-gRY57rksdUfpw_V0fsRv2o';

/* ─────────────────────────────────────────────────────────────────────────────
   TEMPLATE CONFIG  — one entry per document type.
   Add new templates here as they are built.
───────────────────────────────────────────────────────────────────────────── */
const TEMPLATES = {

  'client-comms': {
    name: 'Client Communication Framework',
    file: 'Client_Communication_Framework.docx',
    ext:  'docx',
    pro:  false,
    prompt: (f) => `You are filling in the Expectation Setting Canvas section of an ESDS Client Communication Framework document for a real professional engagement.

User's inputs:
- Client / Account Name: ${f.account_name}
- Project / Engagement: ${f.project_name}
- Date: ${f.date || new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
- Deliverables (user wrote): ${f.will_deliver_raw}
- Out of scope (user wrote): ${f.will_not_deliver_raw}
- Needs from client (user wrote): ${f.need_from_client_raw}

Write professional, concise project management language. Use short bullet lines (no markdown bullets — use plain newlines between items). Be specific — do not be generic.

Return ONLY a valid JSON object with exactly these keys. No markdown fences, no extra text. Use \\n between bullet items (not markdown dashes).

{"account_name":"<exact client name>","date":"<date e.g. 15 Jun 2026>","will_deliver":"<SLA commitments and deliverables, items separated by \\n>","will_not_deliver":"<out-of-scope items, items separated by \\n>","need_from_client":"<what ESDS needs from client, items separated by \\n>","consequences":"<escalation path and remediation, items separated by \\n>"}`,
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
    const client   = new Anthropic({ apiKey: ANTHROPIC_KEY });
    const message  = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages:   [{ role: 'user', content: tpl.prompt(formData) }],
    });
    const raw      = message.content[0].text.trim();
    const jsonStr  = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim();
    aiData         = JSON.parse(jsonStr);
  } catch (e) {
    return { statusCode: 500, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'AI generation failed: ' + e.message }) };
  }

  /* ── 6. Fetch filled placeholder template from static CDN ── */
  const siteUrl = (process.env.URL || 'http://localhost:8888').replace(/\/$/, '');
  let templateBuffer;
  try {
    const tplRes = await fetch(`${siteUrl}/templates/filled/${tpl.file}`);
    if (!tplRes.ok) throw new Error(`HTTP ${tplRes.status}`);
    templateBuffer = Buffer.from(await tplRes.arrayBuffer());
  } catch (e) {
    return { statusCode: 500, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Template file unavailable: ' + e.message }) };
  }

  /* ── 7. Fill template with docxtemplater ── */
  let outputBuffer;
  try {
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
    doc.render(aiData);
    outputBuffer = doc.getZip().generate({ type: 'nodebuffer' });
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
        generations_used:      currentUsed + 1,
        generations_reset_at:  (!resetAt || now >= resetAt)
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
  const outFilename   = `${tpl.name.replace(/[^a-z0-9\s]/gi, '').trim().replace(/\s+/g, '_')}.${tpl.ext}`;
  const contentType   = tpl.ext === 'xlsx'
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
    body:           outputBuffer.toString('base64'),
    isBase64Encoded: true,
  };
};
