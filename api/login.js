const crypto = require('crypto');

const COOKIE = '__admin_sid';
const TTL_MS = 8 * 60 * 60 * 1000; // 8 ore

function safeCompare(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  // Esegui sempre la comparazione per evitare timing leak sulla lunghezza
  const ref = crypto.timingSafeEqual(ba.slice(0, 1), ba.slice(0, 1));
  if (ba.length !== bb.length) return false && ref;
  return crypto.timingSafeEqual(ba, bb);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const adminPassword = process.env.ADMIN_PASSWORD;
  const secret = process.env.COOKIE_SECRET;
  if (!adminPassword || !secret) return res.status(500).end('Server misconfigured');

  const body = await readBody(req);
  const params = new URLSearchParams(body);
  const password = params.get('password') || '';

  if (!safeCompare(password, adminPassword)) {
    res.setHeader('Location', '/admin-login.html?error=1');
    return res.status(302).end();
  }

  const expiry = Date.now() + TTL_MS;
  const sig = crypto.createHmac('sha256', secret).update(String(expiry)).digest('hex');
  const token = `${expiry}.${sig}`;

  res.setHeader('Set-Cookie',
    `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${TTL_MS / 1000}`
  );
  res.setHeader('Location', '/Catalog_ADMIN.html');
  res.status(302).end();
};
