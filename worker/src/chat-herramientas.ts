// Herramientas del chat «Pregunta a Claude» (spec docs/specs/2026-10-20-pregunta-a-claude-design.md §4).
// Fuente única: el worker las manda a Claude y la app las ejecuta en local (app/src/chat-herramientas.ts
// importa NOMBRES_HERRAMIENTAS desde aquí en sus tests para detectar desajustes).
// Todos los campos son obligatorios en el esquema (strict); los opcionales admiten null.
// Los rangos (dia 0–15, n ≤ 10…) los valida la app y responde con is_error si no se cumplen.

const especieOGrupo = {
  especie: { type: ["string", "null"], description: "Id de especie (p. ej. boletus_aereus). null si se pide un grupo." },
  grupo: { type: ["string", "null"], description: "Id de grupo (boletus, amanita, niscalos, rebozuelos…). null si se pide una especie." },
} as const;

const dia = { type: "integer", description: "Día relativo a hoy: 0 = hoy … 15. Fuera de rango devuelve error." } as const;

const filtros = {
  radio_km: { type: ["number", "null"], description: "Distancia máxima en línea recta desde la posición del usuario, en km. null = sin límite." },
  solo_publicos: { type: ["boolean", "null"], description: "true = solo monte público. null = usar el filtro actual de la app." },
  max_dificultad: {
    anyOf: [{ type: "string", enum: ["facil", "moderada", "dificil", "muy_dificil"] }, { type: "null" }],
    description: "Dificultad a pie máxima. null = usar el filtro actual de la app.",
  },
} as const;

export const HERRAMIENTAS = [
  {
    name: "buscar_sitios",
    description:
      "Mejores sitios del día para una especie o un grupo, con la misma puntuación, semáforo y razón que enseña la app. Úsala antes de recomendar cualquier sitio.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["especie", "grupo", "dia", "radio_km", "solo_publicos", "max_dificultad", "orden", "n"],
      properties: {
        ...especieOGrupo,
        dia,
        ...filtros,
        orden: { anyOf: [{ type: "string", enum: ["probabilidad", "distancia", "dificultad"] }, { type: "null" }], description: "Orden de la lista. null = probabilidad." },
        n: { type: "integer", description: "Cuántos sitios (1–10)." },
      },
    },
  },
  {
    name: "semaforo",
    description: "Estado del tiempo para una especie en un sitio un día: color, humedad acumulada, banda de altitud, próxima ventana y avisos.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["especie", "sitio_id", "dia"],
      properties: {
        especie: { type: "string", description: "Id de especie." },
        sitio_id: { type: "string", description: "Id de sitio tal como lo devolvió buscar_sitios o proponer_sitios_nuevos." },
        dia,
      },
    },
  },
  {
    name: "ruta_a",
    description: "Cómo llegar a un sitio: aparcamiento, tiempo a pie, subida y perfil resumido. La app enseña botones para ir en coche y para la ruta a pie.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["sitio_id"],
      properties: { sitio_id: { type: "string", description: "Id de sitio devuelto por otra herramienta." } },
    },
  },
  {
    name: "mostrar_en_mapa",
    description: "Marca y encuadra uno o varios sitios en el mapa que hay detrás del chat.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["sitio_ids"],
      properties: { sitio_ids: { type: "array", items: { type: "string" }, description: "Ids de sitio (máximo 10)." } },
    },
  },
  {
    name: "guardar_en_mis_sitios",
    description: "Guarda un sitio en Mis sitios del usuario. Solo cuando el usuario lo pida. Es reversible (la app enseña «Deshacer»).",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["sitio_id", "nota", "estrellas"],
      properties: {
        sitio_id: { type: "string", description: "Id de sitio devuelto por otra herramienta." },
        nota: { type: ["string", "null"], description: "Nota breve (máximo 200 caracteres)." },
        estrellas: { type: ["integer", "null"], description: "1, 2 o 3. null = 1." },
      },
    },
  },
  {
    name: "notas_de_ruta",
    description: "Notas que el usuario grabó en sus rutas (texto, estrellas, posición, fecha), resumen de la ruta y lista de Mis sitios.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["ruta", "n"],
      properties: {
        ruta: { type: ["string", "null"], description: "Id de ruta, o null para la última." },
        n: { type: ["integer", "null"], description: "Máximo de notas (1–30). null = 30." },
      },
    },
  },
  {
    name: "proponer_sitios_nuevos",
    description:
      "Sitios ya puntuados por la app que el usuario no tiene a la vista: fuera del top visible, de Mis sitios y lejos de sus notas de ruta. Es la única fuente válida de «sitios nuevos».",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["especie", "grupo", "dia", "radio_km", "n"],
      properties: {
        ...especieOGrupo,
        dia,
        radio_km: filtros.radio_km,
        n: { type: "integer", description: "Cuántos (1–5)." },
      },
    },
  },
  {
    name: "estado_en_punto",
    description:
      "Qué dice la app en unas coordenadas concretas (por ejemplo una ubicación compartida por el usuario): para cada seta de la región, semáforo, probabilidad estimada y motivo ese día; si el punto es monte público o privado; y aparcamiento y tiempo a pie. Solo lectura.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["lat", "lon", "dia"],
      properties: {
        lat: { type: "number", description: "Latitud en grados decimales (la de la ubicación compartida)." },
        lon: { type: "number", description: "Longitud en grados decimales." },
        dia,
      },
    },
  },
  {
    name: "proponer_guardar_ubicacion",
    description:
      "Cuando el usuario cuenta un hallazgo en una ubicación que compartió («aquí estaban», «con gusanos»), propone guardarla en Mis sitios. NO guarda nada: la app enseña un botón «Guardar» y solo guarda si el usuario lo pulsa. Las coordenadas deben ser las de una ubicación compartida en esta conversación.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["lat", "lon", "especie", "nota", "estrellas"],
      properties: {
        lat: { type: "number", description: "Latitud de la ubicación compartida." },
        lon: { type: "number", description: "Longitud de la ubicación compartida." },
        especie: { type: ["string", "null"], description: "Id de especie de la región si el usuario la dijo; null si no." },
        nota: { type: ["string", "null"], description: "Nota breve con lo que contó el usuario (máximo 200 caracteres), p. ej. «Con gusanos»." },
        estrellas: { type: ["integer", "null"], description: "1, 2 o 3. null = 1." },
      },
    },
  },
] as const;

export type NombreHerramienta = (typeof HERRAMIENTAS)[number]["name"];
export const NOMBRES_HERRAMIENTAS: readonly NombreHerramienta[] = HERRAMIENTAS.map((h) => h.name);
