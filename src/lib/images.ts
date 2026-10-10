// Resa delle immagini prodotto, con lo stesso risultato visivo dell'originale:
// - modalita' 'full': foto a tutto riquadro su fondo scuro -> nessuna elaborazione (decodifica nativa del browser);
// - altrimenti: lo sfondo bianco viene reso trasparente su canvas e il riquadro si adatta ai bordi dell'immagine.
import { useEffect, useState, type CSSProperties } from 'react';

export type Variant = 'card' | 'search' | 'gallery' | 'viewer';

export interface Surface {
  photo: boolean;
  top?: string;
  bottom?: string;
}

export interface Processed {
  src: string;
  surface: Surface;
}

export const LIGHT: Surface = { photo: false };
const PHOTO: Surface = { photo: true, top: '#1b150f', bottom: '#14100d' };

export const LITE_QUERY =
  '(prefers-reduced-motion: reduce), (pointer: coarse) and (max-width: 1199px), (hover: none) and (max-width: 1199px), (max-width: 639px)';
const isLite = () => typeof matchMedia === 'function' && matchMedia(LITE_QUERY).matches;

const MAX_SIZE: Record<Variant, [full: number, lite: number]> = {
  card: [440, 320],
  search: [240, 180],
  gallery: [760, 520],
  viewer: [1280, 1280],
};

export const needsProcessing = (mode?: string) => mode !== 'full';

const done = new Map<string, Processed>();
const pending = new Map<string, Promise<Processed>>();
const queue: Array<() => Promise<void>> = [];
let running = false;

const keyOf = (src: string, mode: string | undefined, variant: Variant) => `${variant}|${mode || ''}|${src}`;

const whenIdle = (fn: () => void) =>
  typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 240 }) : setTimeout(fn, 16);

function pump() {
  if (running) return;
  const task = queue.shift();
  if (!task) return;
  running = true;
  whenIdle(() => {
    task().finally(() => {
      running = false;
      pump();
    });
  });
}

export function peekProcessed(src: string, mode: string | undefined, variant: Variant): Processed | undefined {
  if (!needsProcessing(mode)) return { src, surface: PHOTO };
  return done.get(keyOf(src, mode, variant));
}

export function processImage(src: string, mode: string | undefined, variant: Variant, urgent = false): Promise<Processed> {
  const key = keyOf(src, mode, variant);
  const ready = peekProcessed(src, mode, variant);
  if (ready) return Promise.resolve(ready);
  let promise = pending.get(key);
  if (!promise) {
    promise = new Promise<Processed>((resolve) => {
      const task = () => render(src, mode, variant).then((result) => {
        done.set(key, result);
        pending.delete(key);
        resolve(result);
      });
      if (urgent) queue.unshift(task);
      else queue.push(task);
      pump();
    });
    pending.set(key, promise);
  }
  return promise;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function fitCanvas(img: HTMLImageElement, max: number) {
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  return canvas;
}

async function render(src: string, mode: string | undefined, variant: Variant): Promise<Processed> {
  try {
    const img = await loadImage(src);
    if (!img.naturalWidth || !img.naturalHeight) return { src, surface: LIGHT };
    const [full, lite] = MAX_SIZE[variant];
    const canvas = fitCanvas(img, isLite() ? lite : full);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { src, surface: LIGHT };
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const surface = stripWhiteBackground(ctx, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.9));
    return { src: blob ? URL.createObjectURL(blob) : src, surface: mode === 'normal' ? LIGHT : surface };
  } catch {
    return { src, surface: LIGHT };
  }
}

const mix = (channel: number, target: number, amount: number) =>
  Math.max(0, Math.min(255, Math.round(channel + (target - channel) * amount)));

/** Rende trasparente il bianco e decide il fondo: chiaro (prodotto scontornato) o adattivo ai bordi (foto). */
function stripWhiteBackground(ctx: CanvasRenderingContext2D, width: number, height: number): Surface {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const border = Math.max(2, Math.round(Math.min(width, height) * 0.08));
  const edgePixels = Math.max(1, width * height - Math.max(0, width - border * 2) * Math.max(0, height - border * 2));
  let transparent = 0;
  let semi = 0;
  let edgeTransparent = 0;
  let edgeWeight = 0;
  let edgeR = 0;
  let edgeG = 0;
  let edgeB = 0;

  for (let y = 0; y < height; y++) {
    const edgeRow = y < border || y >= height - border;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      let a = data[i + 3];

      if (a !== 0) {
        const chroma = Math.max(r, g, b) - Math.min(r, g, b);
        const brightness = (r + g + b) / 3;
        if (brightness > 238 && chroma < 26) a = 0;
        else if (brightness > 225 && chroma < 32) a = Math.round(a * Math.max(0, 1 - (brightness - 225) / 13));
        data[i + 3] = a;
      }

      if (a <= 18) transparent++;
      else if (a < 220) semi++;

      if (edgeRow || x < border || x >= width - border) {
        if (a <= 18) edgeTransparent++;
        else {
          const w = a / 255;
          edgeR += r * w;
          edgeG += g * w;
          edgeB += b * w;
          edgeWeight += w;
        }
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);

  const total = Math.max(1, width * height);
  const transparentRatio = transparent / total;
  const needsLight = transparentRatio > 0.065 || edgeTransparent / edgePixels > 0.18
    || (transparentRatio > 0.03 && semi / total > 0.05);
  if (needsLight || edgeWeight < 12) return LIGHT;

  const r = Math.round(edgeR / edgeWeight);
  const g = Math.round(edgeG / edgeWeight);
  const b = Math.round(edgeB / edgeWeight);
  return {
    photo: true,
    top: `rgb(${mix(r, 248, 0.7)}, ${mix(g, 243, 0.7)}, ${mix(b, 234, 0.7)})`,
    bottom: `rgb(${mix(r, 232, 0.54)}, ${mix(g, 222, 0.54)}, ${mix(b, 208, 0.54)})`,
  };
}

/* ---------- Fondo delle foto "Full Screen" ---------- */

// Le foto "Full Screen" restano intere. Se i bordi hanno un colore uniforme (packshot su fondo pieno)
// il riquadro prende quel colore e la foto ci si fonde; altrimenti dietro va la foto stessa sfocata (CSS).
const fills = new Map<string, string | null>();
let probe: CanvasRenderingContext2D | null = null;
const SIZE = 32;

/**
 * Colore dei bordi se uniforme, null se no (-> sfondo sfocato), undefined se non ancora noto.
 * Con `img` (gia' caricata) lo calcola: lettura 32x32, una volta per immagine.
 */
export function edgeFill(src: string, img?: HTMLImageElement): string | null | undefined {
  if (fills.has(src) || !img) return fills.get(src);
  let fill: string | null = null;
  try {
    probe ??= Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE })
      .getContext('2d', { willReadFrequently: true });
    if (probe) {
      probe.clearRect(0, 0, SIZE, SIZE);
      probe.drawImage(img, 0, 0, SIZE, SIZE);
      const data = probe.getImageData(0, 0, SIZE, SIZE).data;
      const edge: number[] = [];
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) if (x < 2 || y < 2 || x >= SIZE - 2 || y >= SIZE - 2) edge.push((y * SIZE + x) * 4);
      }
      // colore di riferimento: la mediana dei bordi (il soggetto che tocca un lato non la sposta).
      // Nel catalogo i packshot hanno >= 60% dei bordi vicino al fondo, le foto ambientate <= 45%.
      const median = [0, 1, 2].map((c) => edge.map((i) => data[i + c]).sort((a, b) => a - b)[edge.length >> 1]);
      const near = edge.filter((i) => data[i + 3] > 200
        && Math.hypot(data[i] - median[0], data[i + 1] - median[1], data[i + 2] - median[2]) < 24).length;
      if (near / edge.length >= 0.6) fill = `rgb(${median.join(', ')})`;
    }
  } catch { /* immagine di un altro dominio: niente lettura dei pixel */ }
  fills.set(src, fill);
  return fill;
}

/**
 * Sfondo del riquadro: colore dei bordi (foto "Full Screen" uniformi), sfumatura adattiva (foto elaborate)
 * o quello del CSS (crema; per le foto "Full Screen" non uniformi c'e' sopra la copia sfocata).
 */
export function surfaceStyle(surface: Surface | undefined, full: boolean, fill: string | null | undefined): CSSProperties | undefined {
  if (full) return fill ? { backgroundColor: fill } : undefined;
  if (!surface?.photo) return undefined;
  return {
    backgroundImage: `radial-gradient(ellipse 78% 68% at 50% 42%, rgba(216, 164, 79, 0.07) 0%, rgba(255, 255, 255, 0) 72%), linear-gradient(180deg, ${surface.top} 0%, ${surface.bottom} 100%)`,
    backgroundSize: '100% 100%, 100% 100%',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };
}

/** Restituisce l'immagine pronta da mostrare (o null mentre viene elaborata). */
export function useProcessedImage(src: string, mode: string | undefined, variant: Variant, active: boolean, urgent = false) {
  const key = src ? keyOf(src, mode, variant) : '';
  const ready = src ? peekProcessed(src, mode, variant) : undefined;
  const [state, setState] = useState<{ key: string; value: Processed } | null>(null);

  useEffect(() => {
    if (!src || ready || !active) return;
    let live = true;
    processImage(src, mode, variant, urgent).then((value) => {
      if (live) setState({ key, value });
    });
    return () => {
      live = false;
    };
    // `ready` dipende da key: non serve tra le dipendenze
  }, [key, active]);

  if (!src) return null;
  return ready ?? (state?.key === key ? state.value : null);
}

/* ---------- Upload (admin) ---------- */

/** Ridimensiona a max 900px e comprime in WebP (JPEG dove WebP non e' supportato). */
export async function compressImage(file: File, max = 900, quality = 0.85): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const canvas = fitCanvas(img, max);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const webp = canvas.toDataURL('image/webp', quality);
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', quality);
  } catch {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
