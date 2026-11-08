// Fotos del chat «Pregunta a Claude».
//  - Cada foto se reduce en un canvas a 1280 px de lado como máximo y JPEG ~0,8: así pierde el EXIF (modelo del
//    teléfono, fecha, posición) y cabe de sobra en el límite del Worker (1,5 MB por foto, 3 por mensaje).
//  - ANTES de reducirla se lee la posición GPS del EXIF (si la trae): se ofrece al usuario como «ubicación de la
//    foto» y solo viaja si él no la quita. Las fotos no se guardan: ni en el Worker ni en el historial del chat.
import { codificarHastaCaber, dimensionesFoto } from './camara';
import type { Coordenadas } from './enlace-maps';

export const MAX_FOTOS = 3;
export const LADO_FOTO_CHAT = 1280;
export const CALIDADES_FOTO_CHAT = [0.8, 0.7, 0.6, 0.5] as const;
/** Por debajo del límite del Worker (1,5 MB decodificada). */
export const BYTES_MAX_FOTO_CHAT = 1_200_000;
/** El EXIF vive al principio del archivo: no hace falta leerlo entero. */
const BYTES_EXIF = 256 * 1024;

export interface FotoAdjunta {
  id: string;
  media_type: 'image/jpeg';
  /** JPEG reducido en base64, sin prefijo (lo que va al Worker). */
  data: string;
  /** URL blob: para la miniatura; hay que liberarla con URL.revokeObjectURL. */
  miniatura: string;
  /** Posición del EXIF de la foto original, si la traía. */
  gps: Coordenadas | null;
}

// ---------------------------------------------------------------- GPS del EXIF

/** Latitud/longitud del EXIF de un JPEG (bloque APP1 → IFD0 → GPS IFD), o null. Nunca lanza. */
export function leerGpsExif(buf: ArrayBuffer): Coordenadas | null {
  try {
    const v = new DataView(buf);
    if (v.byteLength < 12 || v.getUint16(0) !== 0xffd8) return null;
    let p = 2;
    while (p + 4 <= v.byteLength) {
      if (v.getUint8(p) !== 0xff) return null;
      const marca = v.getUint8(p + 1);
      if (marca === 0xd8 || (marca >= 0xd0 && marca <= 0xd7) || marca === 0x01) { p += 2; continue; }
      if (marca === 0xda || marca === 0xd9) return null;   // empieza la imagen: ya no hay EXIF
      const largo = v.getUint16(p + 2);
      if (largo < 2) return null;
      if (marca === 0xe1 && p + 10 <= v.byteLength && v.getUint32(p + 4) === 0x45786966 && v.getUint16(p + 8) === 0) {
        return gpsDeTiff(v, p + 10, Math.min(v.byteLength, p + 2 + largo));
      }
      p += 2 + largo;
    }
  } catch { /* EXIF corrupto o truncado */ }
  return null;
}

function gpsDeTiff(v: DataView, base: number, fin: number): Coordenadas | null {
  if (base + 8 > fin) return null;
  const le = v.getUint16(base) === 0x4949;
  if (!le && v.getUint16(base) !== 0x4d4d) return null;
  const u16 = (o: number) => { if (o < base || o + 2 > fin) throw new RangeError('fuera'); return v.getUint16(o, le); };
  const u32 = (o: number) => { if (o < base || o + 4 > fin) throw new RangeError('fuera'); return v.getUint32(o, le); };
  if (u16(base + 2) !== 42) return null;
  const entradas = (ifd: number) => {
    const n = u16(base + ifd);
    const m = new Map<number, { tipo: number; cuenta: number; valor: number }>();
    for (let i = 0; i < Math.min(n, 256); i++) {
      const o = base + ifd + 2 + i * 12;
      m.set(u16(o), { tipo: u16(o + 2), cuenta: u32(o + 4), valor: o + 8 });
    }
    return m;
  };
  const gpsPtr = entradas(u32(base + 4)).get(0x8825);
  if (!gpsPtr) return null;
  const gps = entradas(u32(gpsPtr.valor));
  const letra = (id: number) => {
    const e = gps.get(id);
    return e && e.tipo === 2 && e.cuenta >= 1 ? String.fromCharCode(v.getUint8(e.valor)) : '';
  };
  const grados = (id: number) => {
    const e = gps.get(id);
    if (!e || e.tipo !== 5 || e.cuenta !== 3) return NaN;
    const o = base + u32(e.valor);
    const r = (k: number) => { const d = u32(o + k * 8 + 4); return d === 0 ? NaN : u32(o + k * 8) / d; };
    return r(0) + r(1) / 60 + r(2) / 3600;
  };
  let lat = grados(2), lon = grados(4);
  if (letra(1).toUpperCase() === 'S') lat = -lat;
  if (letra(3).toUpperCase() === 'W') lon = -lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6 };
}

// ---------------------------------------------------------------- reducir

async function decodificar(b: Blob): Promise<{ img: CanvasImageSource; w: number; h: number; cerrar: () => void }> {
  try {
    const bmp = await createImageBitmap(b, { imageOrientation: 'from-image' });
    return { img: bmp, w: bmp.width, h: bmp.height, cerrar: () => bmp.close() };
  } catch {
    const u = URL.createObjectURL(b);
    const im = new Image();
    im.src = u;
    try { await im.decode(); } catch {
      URL.revokeObjectURL(u);
      throw new Error('No se pudo leer la foto (formato no compatible). Prueba con una foto JPEG.');
    }
    return { img: im, w: im.naturalWidth, h: im.naturalHeight, cerrar: () => URL.revokeObjectURL(u) };
  }
}

const aBase64 = (b: Blob) => new Promise<string>((ok, mal) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ''));
  r.onerror = () => mal(r.error);
  r.readAsDataURL(b);
});

let contador = 0;

/** Foto del usuario → JPEG reducido sin EXIF en base64 + miniatura + posición GPS leída antes de quitar el EXIF. */
export async function prepararFoto(archivo: Blob): Promise<FotoAdjunta> {
  let gps: Coordenadas | null = null;
  try { gps = leerGpsExif(await new Promise<ArrayBuffer>((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(r.result as ArrayBuffer);
    r.onerror = () => mal(r.error);
    r.readAsArrayBuffer(archivo.slice(0, BYTES_EXIF));
  })); } catch { gps = null; }
  const d = await decodificar(archivo);
  let jpeg: Blob;
  try {
    const t = dimensionesFoto(d.w, d.h, LADO_FOTO_CHAT);
    const cv = document.createElement('canvas');
    cv.width = t.w; cv.height = t.h;
    const c = cv.getContext('2d');
    if (!c) throw new Error('Este navegador no puede preparar la foto.');
    c.drawImage(d.img, 0, 0, t.w, t.h);
    jpeg = await codificarHastaCaber((q) => new Promise<Blob>((ok, mal) => cv.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo comprimir la foto.'))), 'image/jpeg', q)), BYTES_MAX_FOTO_CHAT, CALIDADES_FOTO_CHAT);
  } finally { d.cerrar(); }
  if (jpeg.size > BYTES_MAX_FOTO_CHAT * 1.2) throw new Error('La foto pesa demasiado incluso reducida.');
  return { id: `f${Date.now().toString(36)}${(contador++).toString(36)}`, media_type: 'image/jpeg', data: await aBase64(jpeg), miniatura: URL.createObjectURL(jpeg), gps };
}

/**
 * Prepara las fotos elegidas sin pasar de MAX_FOTOS contando las que ya hay. Las que fallan se cuentan aparte;
 * `preparar` se puede sustituir (tests).
 */
export async function adjuntarFotos(archivos: Blob[], yaHay: number, preparar: (b: Blob) => Promise<FotoAdjunta> = prepararFoto): Promise<{ fotos: FotoAdjunta[]; fallidas: number; sobran: number }> {
  const sitio = Math.max(0, MAX_FOTOS - yaHay);
  const elegidas = archivos.slice(0, sitio);
  const fotos: FotoAdjunta[] = [];
  let fallidas = 0;
  for (const a of elegidas) {
    try { fotos.push(await preparar(a)); } catch { fallidas++; }
  }
  return { fotos, fallidas, sobran: archivos.length - elegidas.length };
}
