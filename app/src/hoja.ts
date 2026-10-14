// Hoja inferior arrastrable (bottom sheet) con retenes, a la manera de iOS: sigue el dedo 1:1 desde donde se agarra,
// al soltar proyecta la inercia (deceleración 0,998) y elige el retén más cercano a la proyección, y llega con un
// muelle que hereda la velocidad del dedo. Se puede agarrar en pleno movimiento: el muelle parte siempre del valor
// que se ve en pantalla. Más allá del retén más alto opone resistencia progresiva (rubber band).
// Con «reducir movimiento» no hay muelles: la hoja salta al retén.
//
// La hoja se muestra y se oculta con el atributo `hidden` (como el resto de la app): al quitarlo entra desde abajo.

const reducido = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Proyección de Apple (Designing Fluid Interfaces): distancia que recorrería con esa velocidad. */
export const proyectar = (v: number, d = 0.998) => ((v / 1000) * d) / (1 - d);
/** Resistencia al pasar del límite: cuanto más lejos, menos sigue al dedo. */
export const goma = (x: number, dim: number, k = 0.55) => (x * dim * k) / (dim + k * Math.abs(x));
/** Retén más cercano a `y` (índice). */
export const masCercano = (y: number, ys: number[]) => ys.reduce((m, v, i) => (Math.abs(v - y) < Math.abs(ys[m] - y) ? i : m), 0);

export interface OpcionesHoja {
  /** Alturas visibles de los retenes, en px, de menor a mayor. Se recortan a la altura natural de la hoja. */
  retenes: (alto: number) => number[];
  /** Retén al abrir (índice; por defecto el más alto). */
  inicial?: number;
  /** Arrastrar hacia abajo la cierra (pone `hidden`). */
  cerrable?: boolean;
  alCerrar?: () => void;
}

interface Muelle { amort: number; resp: number }
const MUELLE_GESTO: Muelle = { amort: 0.85, resp: 0.32 };   // tras un gesto con inercia: un pelín de rebote
const MUELLE_SUAVE: Muelle = { amort: 1, resp: 0.3 };       // apertura programática: sin rebote

export class Hoja {
  private y = 0;                 // desplazamiento hacia abajo (0 = hoja entera visible)
  private v = 0;                 // px/s
  private raf = 0;
  private alto = 0;
  private reten = -1;

  constructor(private el: HTMLElement, asa: HTMLElement, private op: OpcionesHoja) {
    new MutationObserver(() => (this.el.hidden ? this.parar() : this.entrar())).observe(el, { attributes: true, attributeFilter: ['hidden'] });
    new ResizeObserver(() => this.reajustar()).observe(el);
    this.instalarGesto(asa);
    if (!el.hidden) requestAnimationFrame(() => this.entrar());
  }

  private ys(): number[] {
    const h = this.alto || this.el.offsetHeight;
    return this.op.retenes(h).map((r) => Math.max(0, h - Math.min(r, h))).sort((a, b) => b - a);   // de más bajo a más alto
  }
  private cerradoY() { return (this.alto || this.el.offsetHeight) + 24; }
  private pintar() {
    this.el.style.transform = `translate3d(0, ${this.y.toFixed(2)}px, 0)`;
    // Lo que baja por debajo de su sitio (detrás de la barra de pestañas) no se ve: se recorta.
    const bajo = Math.max(0, this.y);
    this.el.style.clipPath = bajo > 0.5 ? `inset(0 0 ${bajo.toFixed(1)}px 0 round 28px 28px 0 0)` : '';
    this.el.dataset.reten = String(this.reten);
  }
  private parar() { cancelAnimationFrame(this.raf); this.raf = 0; }

  /** Al mostrarse: entra desde abajo hasta el retén inicial. */
  private entrar() {
    this.alto = this.el.offsetHeight;
    const ys = this.ys();
    this.reten = Math.min(this.op.inicial ?? ys.length - 1, ys.length - 1);
    if (reducido()) { this.y = ys[this.reten]; this.pintar(); return; }
    this.y = this.cerradoY(); this.v = 0;
    this.pintar();
    this.animar(ys[this.reten], MUELLE_SUAVE);
  }

  /** El contenido cambió de alto: mantiene el retén actual sin saltos. */
  private reajustar() {
    if (this.el.hidden) return;
    const antes = this.alto;
    this.alto = this.el.offsetHeight;
    if (antes === this.alto || this.reten < 0) return;
    const ys = this.ys();
    this.reten = Math.min(this.reten, ys.length - 1);
    if (this.raf) { this.animar(ys[this.reten], MUELLE_SUAVE); return; }   // re-objetivo sin perder la velocidad
    this.y = ys[this.reten];
    this.pintar();
  }

  /** Lleva la hoja a un retén (índice de menor a mayor altura). */
  ir(i: number) {
    const ys = this.ys();
    this.reten = Math.max(0, Math.min(i, ys.length - 1));
    if (reducido()) { this.parar(); this.y = ys[this.reten]; this.pintar(); return; }
    this.animar(ys[this.reten], MUELLE_SUAVE);
  }

  private animar(destino: number, m: Muelle, alFinal?: () => void) {
    this.parar();
    const k = (2 * Math.PI / m.resp) ** 2, c = (4 * Math.PI * m.amort) / m.resp;
    let t0 = performance.now();
    const paso = (t: number) => {
      let dt = Math.min(0.064, (t - t0) / 1000); t0 = t;
      while (dt > 0) {                                   // subpasos de 4 ms: estable con cualquier frecuencia
        const h = Math.min(dt, 0.004); dt -= h;
        const a = -k * (this.y - destino) - c * this.v;
        this.v += a * h; this.y += this.v * h;
      }
      if (Math.abs(this.y - destino) < 0.4 && Math.abs(this.v) < 8) {
        this.y = destino; this.v = 0; this.raf = 0; this.pintar(); alFinal?.(); return;
      }
      this.pintar();
      this.raf = requestAnimationFrame(paso);
    };
    this.raf = requestAnimationFrame(paso);
  }

  private instalarGesto(asa: HTMLElement) {
    let id = -1, y0 = 0, base = 0, arrastrando = false;
    let hist: { y: number; t: number }[] = [];
    asa.style.touchAction = 'none';
    asa.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest('button, a, input, select, textarea, label, summary')) return;
      id = e.pointerId; y0 = e.clientY; arrastrando = false;
      this.parar();                                      // agarrar en pleno vuelo: parte de lo que se ve
      base = this.y;
      hist = [{ y: e.clientY, t: e.timeStamp }];
    });
    asa.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      const dy = e.clientY - y0;
      if (!arrastrando) {
        if (Math.abs(dy) < 6) return;                     // umbral antes de comprometerse con el arrastre
        arrastrando = true; asa.setPointerCapture(id); this.el.classList.add('arrastrando'); document.documentElement.classList.add('arrastrando-hoja');
        getSelection()?.removeAllRanges();
      }
      const ys = this.ys(), alto = this.alto || this.el.offsetHeight;
      let y = base + dy;
      const tope = Math.min(...ys);                       // retén más alto
      if (y < tope) y = tope + goma(y - tope, alto);
      if (!this.op.cerrable && y > Math.max(...ys)) y = Math.max(...ys) + goma(y - Math.max(...ys), alto);
      this.y = y; this.pintar();
      hist.push({ y: e.clientY, t: e.timeStamp });
      if (hist.length > 6) hist.shift();
    });
    const soltar = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1;
      if (!arrastrando) return;
      arrastrando = false; this.el.classList.remove('arrastrando'); document.documentElement.classList.remove('arrastrando-hoja');
      const a = hist[0], b = hist[hist.length - 1];
      const v = b.t > a.t ? ((b.y - a.y) / (b.t - a.t)) * 1000 : 0;
      this.v = v;
      const ys = this.ys();
      const candidatos = this.op.cerrable ? [...ys, this.cerradoY()] : ys;
      const i = masCercano(this.y + proyectar(v), candidatos);
      if (this.op.cerrable && i === ys.length) {
        if (reducido()) { this.el.hidden = true; this.op.alCerrar?.(); return; }
        this.animar(this.cerradoY(), MUELLE_GESTO, () => { this.el.hidden = true; this.op.alCerrar?.(); });
        return;
      }
      this.reten = i;
      if (reducido()) { this.y = ys[i]; this.v = 0; this.pintar(); return; }
      this.animar(ys[i], MUELLE_GESTO);
    };
    asa.addEventListener('pointerup', soltar);
    asa.addEventListener('pointercancel', soltar);
  }
}
