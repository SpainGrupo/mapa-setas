// Microsoft Clarity con consentimiento (2026-11-07). Clarity (grabaciones de sesión anónimas y mapas de calor) SOLO se
// carga tras «Aceptar» en el aviso de cookies; «Rechazar» deja usar la app igual, sin Clarity y sin cargar nada de
// clarity.ms. La elección se guarda en localStorage y se cambia desde Ajustes › Cookies.
//  - El id del proyecto llega en el build (VITE_CLARITY_ID, público: va en el HTML de cualquier web con Clarity). Si está
//    vacío no hay aviso ni se carga nada.
//  - En e2e (?e2e=1) el id del build se ignora (para que el aviso no estorbe a los demás tests); solo vale el que se
//    deja en localStorage «setas:e2e-clarity-id».
//  - No hay CSP en esta app (ni en index.html ni en servidor.php ni en GitHub Pages): no hace falta abrir clarity.ms.
//    Si algún día se añade una, necesita https://www.clarity.ms y https://*.clarity.ms en script-src y connect-src.

export type EleccionClarity = 'si' | 'no';
export const CLAVE_CLARITY = 'setas:clarity';
export const CLAVE_CLARITY_E2E = 'setas:e2e-clarity-id';

/** Id de proyecto válido (alfanumérico corto) o ''. En e2e solo cuenta el de localStorage. */
export function idClarity(env: string | undefined, e2e: boolean, ls: Pick<Storage, 'getItem'> | null): string {
  const u = e2e ? (ls?.getItem(CLAVE_CLARITY_E2E) ?? '') : (env ?? '');
  const id = u.trim();
  return /^[a-z0-9]{6,20}$/i.test(id) ? id : '';
}

export function leerEleccion(ls: Pick<Storage, 'getItem'> | null): EleccionClarity | null {
  try { const v = ls?.getItem(CLAVE_CLARITY); return v === 'si' || v === 'no' ? v : null; } catch { return null; }
}

type FnClarity = ((...a: unknown[]) => void) & { q?: unknown[] };
interface VentanaClarity { clarity?: FnClarity }

/** Fragmento oficial de Clarity: deja la cola `clarity()` y añade el <script> de clarity.ms. */
export function cargarClarity(id: string, w: Window & VentanaClarity = window, d: Document = document) {
  if (d.querySelector('script[data-clarity]')) return;
  w.clarity = w.clarity || (function (this: unknown, ...a: unknown[]) { (w.clarity!.q = w.clarity!.q || []).push(a); } as FnClarity);
  const t = d.createElement('script');
  t.async = true; t.src = `https://www.clarity.ms/tag/${id}`; t.dataset.clarity = '1';
  (d.getElementsByTagName('script')[0]?.parentNode ?? d.head).insertBefore(t, d.getElementsByTagName('script')[0] ?? null);
}

/** Consent API v2 de Clarity. Anuncios siempre denegados (no se usan); analítica según la elección. */
export function avisarConsentimiento(e: EleccionClarity, w: Window & VentanaClarity = window) {
  try {
    w.clarity?.('consentv2', { ad_Storage: 'denied', analytics_Storage: e === 'si' ? 'granted' : 'denied' });
  } catch { /* si la API no lo admite, no pasa nada */ }
}

/** Aplica la elección: «si» carga Clarity y le dice que hay consentimiento; «no» no carga nada (y, si ya estaba, se lo dice). */
export function aplicarEleccion(id: string, e: EleccionClarity | null, w: Window & VentanaClarity = window, d: Document = document) {
  if (e === 'si') { cargarClarity(id, w, d); avisarConsentimiento('si', w); }
  else if (e === 'no') avisarConsentimiento('no', w);
}
