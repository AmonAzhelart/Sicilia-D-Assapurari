import { COOKIE, redirect } from './_lib.js';

export default function handler(req, res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
  redirect(res, '/admin-login.html');
}
