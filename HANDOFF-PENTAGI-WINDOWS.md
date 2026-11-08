# Handoff: probar PentAGI contra el mapa de setas desde el PC con Windows

Pendiente desde el 2026-11-08. En el Mac no se pudo terminar porque PentAGI necesita unos 20 GB libres y el Mac tiene unos 11.

## Objetivo
Pasar PentAGI (pentest automático con IA, https://github.com/vxcontrol/pentagi) contra **nuestra propia** app y nuestro propio Worker. Después, revisar los hallazgos, arreglar lo que proceda y publicar como siempre: push, `npx wrangler deploy` si se toca `worker/`, y `app/scripts/publicar.sh`.

## Qué se hizo en el Mac (no repetir allí)
- Se instalaron Colima, docker y docker-compose con brew. Colima está parado.
- PentAGI está clonado en `~/herramientas/pentagi`.
- Se revisó su `docker-compose`:
  - Publica los puertos solo en 127.0.0.1.
  - Monta el socket de Docker del host en un contenedor que corre como root. Por eso conviene usarlo en una máquina o VM de pruebas.

## Pasos en Windows
1. Instalar Docker Desktop con el backend WSL2 y dejar ≥20 GB libres.
2. Clonar PentAGI y copiar `.env.example` a `.env`.
   - La clave de Anthropic está en `benalto-danilozano/.env.bak-2026-10-07`. **No imprimirla nunca**: copiarla con un script, sin mostrarla en pantalla.
   - Mejor aún, crear una clave aparte con un límite de gasto bajo.
3. `docker compose up -d` y abrir la interfaz en `https://localhost:8443`.
4. Montar los objetivos, **solo locales**:
   - **App:** clonar `SpainGrupo/mapa-setas`, hacer `npm ci && npm run build` en `app/` y servir `app/dist` en local, por ejemplo con `npx serve`.
   - **Worker:** ejecutar `npx wrangler dev` en `worker/` usando Haiku. Antes, bajar en `wrangler.toml` estos límites: `CHAT_DIARIO`, `CHAT_PETICIONES_DIA`, `CHAT_IP_DAILY_USD` y `MAPAS_DAILY_LIMIT`.
5. Encargar a PentAGI:
   - prompt injection en `/chat`, incluido el texto dentro de fotos;
   - saltarse los límites diarios y por IP (IPv6 /64);
   - SSRF en `/resolver-enlace`;
   - CORS y CSP;
   - XSS en las respuestas del chat y en Mis sitios.

## Reglas
- **Nunca atacar producción.** Producción es `spaingrupo.github.io` y `setas-identificar.setas-worker.workers.dev`.
- Para los hallazgos:
  - contrastarlos con la auditoría del 8/11 (`docs/investigacion/2026-11-08-auditoria-seguridad.md`);
  - añadir un test en `worker/test/` por cada fallo real.
- La app nunca afirma que una seta sea comestible, y los arreglos no deben debilitar esos avisos.
- No commitear `app/e2e/capturas` ni `_config/icm-state.json`.
- Al acabar: `docker compose down`, y borrar la clave del `.env` de PentAGI si era la principal.
