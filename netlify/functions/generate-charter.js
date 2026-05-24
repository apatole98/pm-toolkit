exports.handler = async function (event) {

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { inputs, token } = JSON.parse(event.body || '{}');

    if (!token) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Not authenticated' }) };
    }

    /* ── Verify user is logged in via Supabase ── */
    const supabaseUrl  = 'https://yseddxycyfmnjmbmnsip.supabase.co';
    const supabaseAnon = 'sb_publishable_dhQwFgU9-gRY57rksdUfpw_V0fsRv2o';

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': supabaseAnon,
      },
    });

    if (!userRes.ok) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid session. Please log in again.' }) };
    }

    /* ── Call Anthropic Claude API ── */
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured on server.' }) };
    }

    const prompt = buildPrompt(inputs || {});

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
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'AI generation failed: ' + errText }) };
    }

    const aiData = await aiRes.json();
    const content = aiData.content[0].text;

    return { statusCode: 200, headers, body: JSON.stringify({ content }) };

  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error: ' + e.message }) };
  }
};

function buildPrompt(i) {
  return `You are a senior Project Management consultant. Generate a complete, professional Project Charter document.

PROJECT DETAILS PROVIDED BY USER:
- Project Name: ${i['c-name'] || 'Not specified'}
- Objective: ${i['c-objective'] || 'Not specified'}
- Project Sponsor: ${i['c-sponsor'] || 'Not specified'}
- Project Manager: ${i['c-pm'] || 'Not specified'}
- Start Date: ${i['c-start'] || 'Not specified'}
- Target End Date: ${i['c-end'] || 'Not specified'}
- In-Scope Items: ${i['c-scope'] || 'Not specified'}
- Key Stakeholders: ${i['c-stakeholders'] || 'Not specified'}
- Estimated Budget: ${i['c-budget'] || 'Not specified'}

Generate a complete Project Charter with these sections:

# Project Charter: [Project Name]

## 1. Project Overview
[Brief executive summary of the project]

## 2. Project Objectives & Success Criteria
[SMART objectives and measurable success criteria]

## 3. Project Scope
### In Scope
[Detailed list of what is included]
### Out of Scope
[Explicit exclusions to prevent scope creep]

## 4. Project Timeline & Key Milestones
[Key phases and milestone dates based on start/end dates provided]

## 5. Project Team & Roles
[Sponsor, PM, and inferred team roles with responsibilities]

## 6. Stakeholder Summary
[Stakeholders listed with their interest and influence level]

## 7. Budget Summary
[Budget breakdown estimate based on the provided figure]

## 8. Key Risks & Assumptions
[Top 5 risks with likelihood/impact, and key assumptions]

## 9. Project Approval
[Sign-off section with sponsor and PM names]

Make it specific, professional, and directly usable. Do not use placeholder text — infer reasonable details from what was provided.`;
}
