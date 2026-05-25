const crypto = require('crypto');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method not allowed' };

  let orderId, paymentId, signature, token;
  try {
    ({ orderId, paymentId, signature, token } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  if (!orderId || !paymentId || !signature || !token) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  /* ── Verify Supabase session ── */
  const SUPABASE_URL  = 'https://yseddxycyfmnjmbmnsip.supabase.co';
  const SUPABASE_ANON = 'sb_publishable_dhQwFgU9-gRY57rksdUfpw_V0fsRv2o';

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON },
  });

  if (!userRes.ok) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid session. Please log in again.' }) };
  }

  const userData = await userRes.json();
  const userId   = userData.id;

  /* ── Verify Razorpay signature ── */
  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  if (!KEY_SECRET) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Payment not configured on server.' }) };
  }

  const expectedSig = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(orderId + '|' + paymentId)
    .digest('hex');

  if (expectedSig !== signature) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Payment verification failed. Please contact support.' }) };
  }

  /* ── Upgrade user tier to Pro in Supabase ── */
  const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': SUPABASE_ANON,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ tier: 'pro' }),
  });

  if (!updateRes.ok) {
    const err = await updateRes.text();
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Account upgrade failed: ' + err }) };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true }),
  };
};
