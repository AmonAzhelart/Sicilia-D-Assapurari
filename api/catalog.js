// Catalogo pubblico in un'unica risposta: stessi JSON di GitLab, ma con le immagini base64
// sostituite da URL /api/img (cache immutabile). Da ~12 MB a ~100 KB compressi.
import { readRepoFile, imageHash, isImageDataUrl, send } from './_lib.js';

const imageRef = (file, src) =>
  isImageDataUrl(src) ? `/api/img?f=${encodeURIComponent(file)}&h=${imageHash(src)}` : typeof src === 'string' ? src : '';

async function readCategory(file) {
  try {
    return JSON.parse(await readRepoFile(file));
  } catch (err) {
    if (err.status === 404) return {};
    throw err;
  }
}

export default async function handler(req, res) {
  try {
    const config = JSON.parse(await readRepoFile('config.json'));
    const entries = Array.isArray(config.macroCategories) ? config.macroCategories : [];
    const files = await Promise.all(entries.map((m) => readCategory(m.file)));

    const macroCategories = entries.map((m, i) => ({
      ...m,
      bgImage: imageRef('config.json', m.bgImage),
      heroImage: imageRef('config.json', m.heroImage),
      subcategories: Array.isArray(files[i].subcategories) ? files[i].subcategories : [],
      products: (Array.isArray(files[i].products) ? files[i].products : []).map((p) => ({
        ...p,
        images: (Array.isArray(p.images) ? p.images : []).map((src) => imageRef(m.file, src)),
      })),
    }));

    send(res, 200, { title: config.title || '', macroCategories },
      'public, max-age=0, s-maxage=60, stale-while-revalidate=604800');
  } catch (err) {
    console.error(err);
    send(res, 502, { error: 'Catalogo non disponibile' });
  }
}
