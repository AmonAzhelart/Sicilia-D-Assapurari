const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const COOKIE = '__admin_sid';

function verify(cookie) {
  const secret = process.env.COOKIE_SECRET;
  if (!secret || !cookie) return false;
  const dot = cookie.lastIndexOf('.');
  if (dot === -1) return false;
  const expiry = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);
  if (Date.now() > Number(expiry)) return false;
  const expected = crypto.createHmac('sha256', secret).update(expiry).digest('hex');
  try {
    const aSig = Buffer.from(sig.padEnd(64, '0'), 'hex');
    const bSig = Buffer.from(expected, 'hex');
    // Constant-time compare (same length required)
    return aSig.length === bSig.length && crypto.timingSafeEqual(aSig, bSig) && sig === expected;
  } catch {
    return false;
  }
}

function parseCookies(header) {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map(c => c.trim()).filter(Boolean).map(c => {
      const i = c.indexOf('=');
      return i === -1 ? [c, ''] : [c.slice(0, i).trim(), c.slice(i + 1).trim()];
    })
  );
}

module.exports = function handler(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  if (!verify(cookies[COOKIE])) {
    res.setHeader('Location', '/admin-login.html');
    return res.status(302).end();
  }
  const file = path.join(process.cwd(), 'Catalog_ADMIN.html');
  const html = fs.readFileSync(file, 'utf8');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.status(200).end(html);
};
