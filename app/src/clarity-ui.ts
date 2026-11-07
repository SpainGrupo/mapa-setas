// Aviso de cookies de Microsoft Clarity (2026-11-07): ventana modal grande y centrada al primer arranque, por encima de
// todo y sin cierre con Escape hasta elegir. «Aceptar» carga Clarity; «Rechazar» no carga nada y la app se usa igual.
// Cambio posterior: Ajustes › Cookies. La lógica sin DOM está en clarity.ts.
import { CLAVE_CLARITY, aplicarEleccion, idClarity, leerEleccion, type EleccionClarity } from './clarity';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const almacen = () => { try { return localStorage; } catch { return null; } };

export function iniciarClarity(e2e: boolean) {
  const id = idClarity(import.meta.env.VITE_CLARITY_ID, e2e, almacen());
  if (!id) return;   // sin id de proyecto: ni aviso, ni «Cookies» en Ajustes, ni red a clarity.ms
  const dlg = $<HTMLDialogElement>('#dlg-cookies'), seccion = $('#ajustes-cookies');
  let eleccion = leerEleccion(almacen());
  seccion.hidden = false;

  const pintarEstado = () => {
    $('#cookies-estado').textContent = eleccion === 'si' ? 'Microsoft Clarity: aceptado.' : eleccion === 'no' ? 'Microsoft Clarity: rechazado.' : 'Microsoft Clarity: sin elegir.';
  };
  const elegir = (e: EleccionClarity) => {
    eleccion = e;
    try { almacen()?.setItem(CLAVE_CLARITY, e); } catch { /* solo esta sesión */ }
    aplicarEleccion(id, e);
    pintarEstado();
    dlg.close();
  };
  const abrir = () => {
    $('#cookies-actual').textContent = eleccion === 'si' ? 'Ahora: aceptado.' : eleccion === 'no' ? 'Ahora: rechazado.' : '';
    $('#cookies-actual').hidden = !eleccion;
    $('#cookies-cerrar').hidden = !eleccion;   // sin elegir no hay salida: solo «Aceptar» o «Rechazar»
    if (!dlg.open) dlg.showModal();
  };

  $('#cookies-aceptar').addEventListener('click', () => elegir('si'));
  $('#cookies-rechazar').addEventListener('click', () => elegir('no'));
  $('#cookies-cerrar').addEventListener('click', () => dlg.close());
  // Escape no la cierra mientras no se haya elegido.
  dlg.addEventListener('cancel', (ev) => { if (!eleccion) ev.preventDefault(); });
  $('#btn-cookies').addEventListener('click', abrir);

  // Por encima de todo: si otra ventana modal (p. ej. «Antes de empezar») se abre después, la de cookies vuelve delante.
  new MutationObserver((registros) => {
    if (eleccion || !dlg.open) return;
    // Solo cuenta lo que se acaba de abrir y no es esta ventana (sus propios cambios no vuelven a disparar nada).
    if (registros.some((r) => r.target !== dlg && (r.target as HTMLDialogElement).open)) { dlg.close(); dlg.showModal(); }
  }).observe(document.body, { attributes: true, attributeFilter: ['open'], subtree: true });

  pintarEstado();
  aplicarEleccion(id, eleccion);
  if (!eleccion) abrir();
}
