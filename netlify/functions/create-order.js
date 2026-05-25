exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method not allowed' };

  const KEY_ID     = process.env.RAZORPAY_KEY_ID;
  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

  if (!KEY_ID || !KEY_SECRET) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Payment not configured on server.' }) };
  }

  const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');

  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount:   49900,               /* ₹499 in paise */
      currency: 'INR',
      receipt:  'rcpt_' + Date.now(),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Order creation failed: ' + err }) };
  }

  const order = await res.json();

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      orderId:  order.id,
      amount:   order.amount,
      currency: order.currency,
      keyId:    KEY_ID,      /* safe to return — Key ID is public */
    }),
  };
};
