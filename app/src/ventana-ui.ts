// Bloque «Cuándo está activa» de la ficha (Guía): tira de 12 meses con la marca de hoy, tira de 16 días con el
// semáforo de cada día (icono + texto, nunca solo color) y una línea con la estimación y su confianza.
// La lógica está en ventana-especie.ts; aquí solo el DOM.
import type { Estado } from './semaforo';
import { etiquetaDia, MESES_CORTOS } from './calendario';
import { NOMBRE_ESTADO } from './zona';
import { MESES_LARGOS, TEXTO_ORIGEN, type DiaVentana, type OrigenRef, type Ventana } from './ventana-especie';

export interface DatosCuando {
  hoy: string;
  meses: number[];
  /** Sin reglas del tiempo (solo meses, o nada): sin tira de días ni estimación. */
  conTiempo: boolean;
  dias: DiaVentana[];
  ventana: Ventana | null;
  origen: OrigenRef | null;
}

const SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const ICONO: Record<Estado, string> = { verde: 'i-check', amarillo: 'i-espera', rojo: 'i-cerrar', gris: 'i-guion' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, clase = '', texto?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  if (texto != null) n.textContent = texto;
  return n;
}
const icono = (id: string) => `<svg class="ico" aria-hidden="true"><use href="#${id}"/></svg>`;

/** El bloque, o null si no hay nada que enseñar (ni meses ni reglas del tiempo). */
export function bloqueCuando(d: DatosCuando): HTMLElement | null {
  if (!d.meses.length && !d.conTiempo) return null;
  const sec = el('section', 'cuando');
  sec.setAttribute('aria-labelledby', 'tit-cuando');
  const h = el('h2', '', 'Cuándo está activa'); h.id = 'tit-cuando';
  sec.append(h);

  if (d.conTiempo && d.ventana) {
    const linea = el('p', 'cuando-linea');
    linea.dataset.tipo = d.ventana.tipo;
    linea.append(el('b', '', d.ventana.texto));
    if (d.ventana.confianza) {
      const c = el('span', 'cuando-confianza', `Confianza ${d.ventana.confianza}`);
      c.dataset.confianza = d.ventana.confianza;
      linea.append(c);
    }
    sec.append(linea);
  }

  if (d.meses.length) {
    const mes = +d.hoy.slice(5, 7);
    const tira = el('div', 'cuando-meses');
    tira.setAttribute('role', 'img');
    tira.setAttribute('aria-label', `Temporada: ${[...d.meses].sort((a, b) => a - b).map((m) => MESES_LARGOS[m - 1]).join(', ')}. Ahora: ${MESES_LARGOS[mes - 1]}.`);
    MESES_CORTOS.forEach((t, i) => {
      const x = el('i', '', t[0].toUpperCase());
      if (d.meses.includes(i + 1)) x.classList.add('si');
      if (i + 1 === mes) x.classList.add('actual');
      tira.append(x);
    });
    sec.append(tira);
  }

  if (d.conTiempo) {
    if (d.dias.length) {
      const ol = el('ol', 'cuando-dias');
      ol.setAttribute('aria-label', `Próximos ${d.dias.length} días`);
      for (const x of d.dias) {
        const li = el('li');
        li.dataset.estado = x.estado; li.dataset.confianza = x.confianza; li.dataset.fecha = x.fecha;
        const et = etiquetaDia(d.hoy, x.fecha);
        const sem = et === 'hoy' ? 'hoy' : SEMANA[new Date(x.fecha + 'T12:00:00Z').getUTCDay()], num = String(+x.fecha.slice(8, 10));
        li.title = `${et}: ${NOMBRE_ESTADO[x.estado]}`;
        li.append(el('small', '', sem), el('b', '', num));
        li.insertAdjacentHTML('beforeend', icono(ICONO[x.estado]));
        li.append(el('span', 'sr', `${et}: ${NOMBRE_ESTADO[x.estado]}`));
        ol.append(li);
      }
      sec.append(ol);
      const ley = el('p', 'cuando-leyenda');
      ley.setAttribute('aria-hidden', 'true');
      for (const e of ['verde', 'amarillo', 'rojo', 'gris'] as Estado[]) {
        if (!d.dias.some((x) => x.estado === e)) continue;
        const s = el('span');
        s.dataset.estado = e;
        s.innerHTML = icono(ICONO[e]);
        s.append(NOMBRE_ESTADO[e]);
        ley.append(s);
      }
      if (d.dias.some((x) => x.confianza === 'baja')) ley.append(el('span', 'cuando-tendencia', 'Borde a rayas: solo tendencia'));
      sec.append(ley);
    } else {
      sec.append(el('p', 'nota cuando-sin', 'Sin datos de tiempo guardados. Con conexión, la app los descarga sola y aquí verás los próximos 16 días.'));
    }
    if (d.dias.length && d.origen) sec.append(el('p', 'nota', `${TEXTO_ORIGEN[d.origen]} Orientativo: reglas de aficionado, no ciencia exacta.`));
  }
  return sec;
}
