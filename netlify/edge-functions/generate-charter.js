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

  let inputs, token;
  try {
    ({ inputs, token } = await request.json());
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

  /* ── Check API key ── */
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured on server.' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

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
      messages: [{ role: 'user', content: buildPrompt(inputs || {}) }],
    }),
  });

  if (!aiRes.ok) {
    const err = await aiRes.text();
    return new Response(JSON.stringify({ error: 'AI error: ' + err }), {
      status: 502, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  /* ── Pipe SSE stream → plain text stream ── */
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
          } catch { /* skip malformed lines */ }
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

function buildPrompt(i) {
  return `You are a senior Project Management consultant. Generate a complete, professional Project Charter document.

PROJECT DETAILS:
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
## 2. Project Objectives & Success Criteria
## 3. Project Scope (In-Scope & Out-of-Scope)
## 4. Project Timeline & Key Milestones
## 5. Project Team & Roles
## 6. Stakeholder Summary
## 7. Budget Summary
## 8. Key Risks & Assumptions
## 9. Project Approval

Make it specific, professional, and directly usable. Do not use placeholder text — infer reasonable details from what was provided.`;
}

export const config = { path: '/api/generate-charter' };
