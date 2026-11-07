// Cámara de «Explorar aquí» (2026-10-25). Vivo: getUserMedia con la cámara trasera dentro de un <video>; si falla o no
// existe (PWA instalada sin permiso, navegador sin API), modo «archivo»: una foto por dirección con
// <input type=file accept=image/* capture=environment>, sin vista en vivo.
//  - Toda foto se re-codifica en un canvas: JPEG de 1024 px de lado mayor y calidad 0,8 (0,7 y 0,6 si pasa de 400 KB).
//    Al pasar por el canvas se pierde el EXIF (posición, modelo del teléfono): privacidad.
//  - Esto aún no se ha probado en la PWA instalada del iPhone (fase 0): ¿pide permiso cada vez?, ¿sobrevive a una recarga?
export const LADO_MAX = 1024;
export const BYTES_MAX = 400 * 1024;
export const CALIDADES = [0.8, 0.7, 0.6] as const;
/** Espera máxima a que el vídeo en vivo dé el primer fotograma. */
const ESPERA_VIDEO_MS = 8000;

export interface Camara {
  video: HTMLVideoElement | null;
  modo: 'vivo' | 'archivo';
  parar(): void;
  /** Resolución real del vídeo en vivo (para el diagnóstico), null en modo archivo. */
  resolucion?: () => { w: number; h: number } | null;
}

/** Tamaño de la foto final: el lado mayor a `max` (sin ampliar nunca). */
export function dimensionesFoto(w: number, h: number, max = LADO_MAX): { w: number; h: number } {
  const e = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * e)), h: Math.max(1, Math.round(h * e)) };
}

/** Codifica con la primera calidad que quepa en `bytes`; si ninguna cabe, devuelve la última (la de menor calidad). */
export async function codificarHastaCaber(codificar: (calidad: number) => Promise<Blob>, bytes = BYTES_MAX, calidades: readonly number[] = CALIDADES): Promise<Blob> {
  let b: Blob | null = null;
  for (const q of calidades) {
    b = await codificar(q);
    if (b.size <= bytes) return b;
  }
  return b!;
}

function aJpeg(fuente: CanvasImageSource, w: number, h: number): Promise<Blob> {
  const d = dimensionesFoto(w, h);
  const cv = document.createElement('canvas');
  cv.width = d.w; cv.height = d.h;
  const c = cv.getContext('2d');
  if (!c) return Promise.reject(new Error('Este navegador no puede preparar la foto.'));
  c.drawImage(fuente, 0, 0, d.w, d.h);
  return codificarHastaCaber((q) => new Promise<Blob>((ok, no) => cv.toBlob((b) => (b ? ok(b) : no(new Error('No se pudo codificar la foto.'))), 'image/jpeg', q)));
}

const camaraArchivo = (): Camara => ({ video: null, modo: 'archivo', parar() { /* nada que parar */ } });

/** Abre la cámara trasera dentro de `contenedor`; sin cámara en vivo, modo archivo. Nunca lanza. */
export async function abrirCamara(contenedor: HTMLElement): Promise<Camara> {
  const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  if (!md || typeof md.getUserMedia !== 'function') return camaraArchivo();
  let flujo: MediaStream;
  try {
    flujo = await md.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } }, audio: false });
  } catch (e) {
    console.warn('cámara: getUserMedia', e);
    return camaraArchivo();
  }
  const v = document.createElement('video');
  v.className = 'ex-video';
  v.muted = true; v.autoplay = true; v.playsInline = true;
  v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
  v.srcObject = flujo;
  contenedor.replaceChildren(v);
  const parar = () => { flujo.getTracks().forEach((t) => t.stop()); v.srcObject = null; v.remove(); };
  try {
    await Promise.race([
      v.play().then(() => new Promise<void>((ok) => { if (v.readyState >= 2 && v.videoWidth) ok(); else v.addEventListener('loadeddata', () => ok(), { once: true }); })),
      new Promise<never>((_, no) => setTimeout(() => no(new Error('sin imagen')), ESPERA_VIDEO_MS)),
    ]);
  } catch (e) {
    console.warn('cámara: sin imagen', e);
    parar();
    return camaraArchivo();
  }
  return { video: v, modo: 'vivo', parar, resolucion: () => (v.videoWidth ? { w: v.videoWidth, h: v.videoHeight } : null) };
}

/** El usuario elige o hace una foto con el selector del sistema; null si lo cancela. */
function elegirArchivo(): Promise<File | null> {
  return new Promise((ok) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = 'image/*'; i.setAttribute('capture', 'environment');
    i.style.display = 'none';
    document.body.append(i);
    const fin = (f: File | null) => { i.remove(); ok(f); };
    i.addEventListener('change', () => fin(i.files?.[0] ?? null), { once: true });
    i.addEventListener('cancel', () => fin(null), { once: true });
    i.click();
  });
}

/**
 * Fotograma actual (vivo) o foto elegida (archivo) → JPEG de ≤ 1024 px y ≤ 400 KB. Lanza si no hay foto
 * (cancelada o sin imagen) para que quien llama pueda decir «no se hizo la foto».
 */
export async function capturar(c: Camara): Promise<Blob> {
  if (c.modo === 'vivo' && c.video) {
    if (!c.video.videoWidth) throw new Error('La cámara aún no da imagen.');
    return aJpeg(c.video, c.video.videoWidth, c.video.videoHeight);
  }
  const f = await elegirArchivo();
  if (!f) throw new Error('No se hizo la foto.');
  const img = await createImageBitmap(f, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  try { return await aJpeg(img, img.width, img.height); } finally { img.close(); }
}
