// Validación estricta de la petición de la PWA. Todo lo que no encaja se rechaza con 400/413.
import { ErrorHttp } from "./http";
import { esCcaa, type Ccaa } from "./ccaa";

export const MAX_FOTOS = 4;
export const MAX_BYTES_FOTO = 1.5 * 1024 * 1024; // tras decodificar el base64
// 4 fotos en base64 (~4/3) + respuestas y contexto. Margen holgado pero acotado.
export const MAX_BYTES_CUERPO = Math.ceil(MAX_FOTOS * MAX_BYTES_FOTO * (4 / 3)) + 64 * 1024;

const MAX_CLAVES = 20;
const MAX_TEXTO = 120;
const MAX_CANDIDATOS_OFFLINE = 10;
const CLAVE = /^[a-z][a-z0-9_]{0,39}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const PREFIJO_DATA_URL = /^data:image\/jpe?g;base64,/i;

export type ValorGuiado = string | boolean | null;

export interface Contexto {
  arbol?: string;
  suelo?: string;
  altitud?: number;
  fecha?: string;
  lat?: number;
  lon?: number;
  /** Comunidad autónoma del punto (lista cerrada, ccaa.ts); sin ella, el prompt usa Andalucía. */
  ccaa?: Ccaa;
}

export interface CandidatoOffline {
  id: string;
  nombre: string;
  score: number;
}

export interface PeticionIdentificar {
  fotos: string[]; // base64 puro, sin prefijo data:
  respuestas_guiadas: Record<string, ValorGuiado>;
  contexto: Contexto;
  candidatos_offline: CandidatoOffline[];
}

const invalida = (m: string) => new ErrorHttp(400, "solicitud_invalida", m);

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function texto(v: unknown, campo: string): string {
  if (typeof v !== "string") throw invalida(`'${campo}' debe ser texto.`);
  const t = v.trim();
  if (t.length > MAX_TEXTO) throw invalida(`'${campo}' supera ${MAX_TEXTO} caracteres.`);
  return t;
}

function numero(v: unknown, campo: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) {
    throw invalida(`'${campo}' debe ser un número entre ${min} y ${max}.`);
  }
  return v;
}

export function bytesDecodificados(b64: string): number {
  const relleno = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return (b64.length / 4) * 3 - relleno;
}

function foto(v: unknown, i: number): string {
  if (typeof v !== "string") throw invalida(`fotos[${i}] debe ser una cadena base64.`);
  const b64 = v.replace(PREFIJO_DATA_URL, "");
  if (b64.length === 0 || b64.length % 4 !== 0 || !BASE64.test(b64)) {
    throw invalida(`fotos[${i}] no es base64 válido.`);
  }
  if (bytesDecodificados(b64) > MAX_BYTES_FOTO) {
    throw new ErrorHttp(413, "carga_demasiado_grande", `fotos[${i}] supera 1,5 MB.`);
  }
  // Cabecera JPEG: FF D8 FF
  const cab = atob(b64.slice(0, 4));
  if (cab.charCodeAt(0) !== 0xff || cab.charCodeAt(1) !== 0xd8 || cab.charCodeAt(2) !== 0xff) {
    throw invalida(`fotos[${i}] no es un JPEG.`);
  }
  return b64;
}

export function validarPeticion(cuerpo: unknown): PeticionIdentificar {
  if (!esObjeto(cuerpo)) throw invalida("El cuerpo debe ser un objeto JSON.");

  const { fotos, respuestas_guiadas, contexto, candidatos_offline } = cuerpo;

  if (!Array.isArray(fotos) || fotos.length < 1 || fotos.length > MAX_FOTOS) {
    throw invalida(`'fotos' debe tener entre 1 y ${MAX_FOTOS} imágenes.`);
  }
  const fotosOk = fotos.map(foto);

  const respuestas: Record<string, ValorGuiado> = {};
  if (respuestas_guiadas !== undefined) {
    if (!esObjeto(respuestas_guiadas)) throw invalida("'respuestas_guiadas' debe ser un objeto.");
    const claves = Object.keys(respuestas_guiadas);
    if (claves.length > MAX_CLAVES) throw invalida(`'respuestas_guiadas' admite como máximo ${MAX_CLAVES} claves.`);
    for (const k of claves) {
      if (!CLAVE.test(k)) throw invalida(`Clave no válida en 'respuestas_guiadas': ${k.slice(0, 40)}`);
      const v = respuestas_guiadas[k];
      if (v === null || typeof v === "boolean") respuestas[k] = v;
      else if (typeof v === "string") respuestas[k] = texto(v, `respuestas_guiadas.${k}`);
      else throw invalida(`'respuestas_guiadas.${k}' debe ser texto, booleano o null.`);
    }
  }

  const ctx: Contexto = {};
  if (contexto !== undefined) {
    if (!esObjeto(contexto)) throw invalida("'contexto' debe ser un objeto.");
    const permitidas = new Set(["arbol", "suelo", "altitud", "fecha", "lat", "lon", "ccaa"]);
    for (const k of Object.keys(contexto)) {
      if (!permitidas.has(k)) throw invalida(`Campo no admitido en 'contexto': ${k.slice(0, 40)}`);
    }
    if (contexto.arbol != null) ctx.arbol = texto(contexto.arbol, "contexto.arbol");
    if (contexto.suelo != null) ctx.suelo = texto(contexto.suelo, "contexto.suelo");
    if (contexto.fecha != null) {
      ctx.fecha = texto(contexto.fecha, "contexto.fecha");
      if (!/^\d{4}-\d{2}-\d{2}/.test(ctx.fecha)) throw invalida("'contexto.fecha' debe ser AAAA-MM-DD.");
    }
    if (contexto.altitud != null) ctx.altitud = numero(contexto.altitud, "contexto.altitud", -500, 9000);
    if (contexto.lat != null) ctx.lat = numero(contexto.lat, "contexto.lat", -90, 90);
    if (contexto.lon != null) ctx.lon = numero(contexto.lon, "contexto.lon", -180, 180);
    if (contexto.ccaa != null) {
      if (!esCcaa(contexto.ccaa)) throw invalida("'contexto.ccaa' no es una comunidad admitida.");
      ctx.ccaa = contexto.ccaa;
    }
  }

  const offline: CandidatoOffline[] = [];
  if (candidatos_offline !== undefined) {
    if (!Array.isArray(candidatos_offline) || candidatos_offline.length > MAX_CANDIDATOS_OFFLINE) {
      throw invalida(`'candidatos_offline' debe ser una lista de como máximo ${MAX_CANDIDATOS_OFFLINE}.`);
    }
    candidatos_offline.forEach((c, i) => {
      if (!esObjeto(c)) throw invalida(`candidatos_offline[${i}] debe ser un objeto.`);
      offline.push({
        id: texto(c.id, `candidatos_offline[${i}].id`),
        nombre: texto(c.nombre, `candidatos_offline[${i}].nombre`),
        score: numero(c.score, `candidatos_offline[${i}].score`, 0, 1),
      });
    });
  }

  return { fotos: fotosOk, respuestas_guiadas: respuestas, contexto: ctx, candidatos_offline: offline };
}
