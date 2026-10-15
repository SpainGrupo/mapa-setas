// Comunidades autónomas que admite la segunda opinión. Lista cerrada (la misma que IdCcaa en la app,
// app/src/manifest-region.ts): del cliente solo llega la clave; el texto del prompt sale siempre de aquí.
export const NOMBRE_CCAA = {
  andalucia: "Andalucía",
  comunitat_valenciana: "la Comunitat Valenciana",
  region_murcia: "la Región de Murcia",
  castilla_la_mancha: "Castilla-La Mancha",
} as const;
export type Ccaa = keyof typeof NOMBRE_CCAA;
/** hasOwnProperty y no `in`: `in` dejaría pasar '__proto__', 'toString'… */
export const esCcaa = (v: unknown): v is Ccaa => typeof v === "string" && Object.prototype.hasOwnProperty.call(NOMBRE_CCAA, v);
