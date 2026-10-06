// API admin (richiede il cookie di sessione):
//   GET  -> verifica sessione
//   POST -> scrive/elimina un file JSON del catalogo su GitLab. Il token resta sul server.
import zlib from 'node:zlib';
import { isAdmin, send, readBody, writeRepoFile, deleteRepoFile, SAFE_FILE } from './_lib.js';

export default async function handler(req, res) {
  if (!isAdmin(req)) return send(res, 401, { error: 'Sessione scaduta' });
  if (req.method === 'GET') return send(res, 200, { ok: true });
  if (req.method !== 'POST') return send(res, 405, { error: 'Metodo non consentito' });
  if (!process.env.GITLAB_TOKEN) return send(res, 500, { error: 'GITLAB_TOKEN non configurato sul server' });

  const file = String(req.headers['x-file'] || '');
  if (!SAFE_FILE.test(file)) return send(res, 400, { error: 'Nome file non valido' });
  let message = `Aggiornamento ${file}`;
  try {
    message = decodeURIComponent(String(req.headers['x-message'] || '')) || message;
  } catch { /* messaggio di default */ }

  try {
    if (req.headers['x-action'] === 'delete') {
      await deleteRepoFile(file, message);
    } else {
      let body = await readBody(req);
      if (req.headers['x-gzip'] === '1') body = zlib.gunzipSync(body, { maxOutputLength: 64 * 1024 * 1024 });
      const content = body.toString('utf8');
      JSON.parse(content); // mai scrivere nel repo un JSON corrotto
      await writeRepoFile(file, content, message);
    }
    send(res, 200, { ok: true });
  } catch (err) {
    console.error(err);
    send(res, err.status === 413 ? 413 : 502, { error: err.message });
  }
}
