import { COOKIE, sign, safeEqual, readBody, redirect } from './_lib.js';

const TTL_MS = 8 * 60 * 60 * 1000; // 8 ore

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end();
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  const secret = process.env.COOKIE_SECRET;
  if (!adminPassword || !secret) {
    res.statusCode = 500;
    return res.end('Server misconfigured');
  }

  const password = new URLSearchParams((await readBody(req, 16 * 1024)).toString()).get('password') || '';
  if (!safeEqual(password, adminPassword)) {
    await new Promise((r) => setTimeout(r, 400)); // rallenta i tentativi a forza bruta
    return redirect(res, '/admin-login.html?error=1');
  }

  const expiry = Date.now() + TTL_MS;
  res.setHeader('Set-Cookie',
    `${COOKIE}=${expiry}.${sign(expiry, secret)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${TTL_MS / 1000}`);
  redirect(res, '/admin');
}
