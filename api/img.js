// Serve un'immagine base64 contenuta in un JSON del catalogo come file binario.
// L'URL contiene l'hash del contenuto, quindi la risposta e' cacheabile per sempre.
import { readRepoFile, imageHash, isImageDataUrl, SAFE_FILE } from './_lib.js';

const TTL = 5 * 60_000;
const MIN_REFRESH = 30_000; // limita i refetch su hash sconosciuti
const indexes = new Map(); // file -> { at, images: Map<hash, dataUrl> }

function collect(node, out) {
  if (isImageDataUrl(node)) out.set(imageHash(node), node);
  else if (node && typeof node === 'object') for (const value of Object.values(node)) collect(value, out);
}

async function loadIndex(file) {
  const images = new Map();
  collect(JSON.parse(await readRepoFile(file)), images);
  const entry = { at: Date.now(), images };
  indexes.set(file, entry);
  return entry;
}

function fail(res, status, cacheControl) {
  res.statusCode = status;
  res.setHeader('Cache-Control', cacheControl);
  res.end();
}

export default async function handler(req, res) {
  const params = new URL(req.url, 'http://localhost').searchParams;
  const file = params.get('f') || '';
  const hash = params.get('h') || '';
  if (!SAFE_FILE.test(file) || !/^[a-f0-9]{16}$/.test(hash)) return fail(res, 400, 'no-store');

  try {
    let entry = indexes.get(file);
    if (!entry || Date.now() - entry.at > TTL) entry = await loadIndex(file);
    let src = entry.images.get(hash);
    if (!src && Date.now() - entry.at > MIN_REFRESH) src = (await loadIndex(file)).images.get(hash);
    if (!src) return fail(res, 404, 'public, max-age=60');

    res.statusCode = 200;
    res.setHeader('Content-Type', src.slice(5, src.indexOf(';')));
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(Buffer.from(src.slice(src.indexOf(',') + 1), 'base64'));
  } catch (err) {
    console.error(err);
    fail(res, 502, 'no-store');
  }
}
