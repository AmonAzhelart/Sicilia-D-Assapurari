const COOKIE = '__admin_sid';

module.exports = function handler(req, res) {
  res.setHeader('Set-Cookie',
    `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`
  );
  res.setHeader('Location', '/admin-login.html');
  res.status(302).end();
};
