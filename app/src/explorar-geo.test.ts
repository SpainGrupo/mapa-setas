import { describe, expect, it } from 'vitest';
import { celdasMarca, deltaAngulo, enSector, estaQuieto, listoParaDisparar, mediaCircular, proyectar, rumbosBarrido } from './explorar-geo';

const FOV = { h: 52, v: 68 };
const PANT = { w: 400, h: 800 };

describe('proyectar', () => {
  it('celda justo delante y a la altura del horizonte: centro de la pantalla', () => {
    const m = proyectar({ rumbo: 90, dist_m: 200, desnivel: 0 }, 90, 90, FOV, PANT);
    expect(m.x).toBeCloseTo(200, 5);
    expect(m.y).toBeCloseTo(400, 5);
    expect(m.visible).toBe(true);
    expect(m.lado).toBeNull();
    expect(m.dist_m).toBe(200);
    expect(m.desnivel).toBe(0);
  });
  it('a la derecha del centro si la celda está a la derecha', () => {
    expect(proyectar({ rumbo: 100, dist_m: 200, desnivel: 0 }, 90, 90, FOV, PANT).x).toBeGreaterThan(200);
    expect(proyectar({ rumbo: 80, dist_m: 200, desnivel: 0 }, 90, 90, FOV, PANT).x).toBeLessThan(200);
  });
  it('fuera del encuadre: pegada al borde con el lado', () => {
    const d = proyectar({ rumbo: 210, dist_m: 200, desnivel: 0 }, 90, 90, FOV, PANT);
    expect(d.visible).toBe(false); expect(d.lado).toBe('der'); expect(d.x).toBe(400);
    const i = proyectar({ rumbo: 330, dist_m: 200, desnivel: 0 }, 90, 90, FOV, PANT);
    expect(i.visible).toBe(false); expect(i.lado).toBe('izq'); expect(i.x).toBe(0);
  });
  it('cruce del norte: celda a 5°, teléfono a 355° → a la derecha', () => {
    const m = proyectar({ rumbo: 5, dist_m: 200, desnivel: 0 }, 355, 90, FOV, PANT);
    expect(m.visible).toBe(true);
    expect(m.x).toBeGreaterThan(200);
  });
  it('desnivel +100 a 100 m (45°) con el teléfono vertical: recortada arriba; sin desnivel conocido: horizonte', () => {
    expect(proyectar({ rumbo: 90, dist_m: 100, desnivel: 100 }, 90, 90, FOV, PANT).y).toBe(0);
    const s = proyectar({ rumbo: 90, dist_m: 100, desnivel: null }, 90, 90, FOV, PANT);
    expect(s.y).toBeCloseTo(400, 5);
    expect(s.desnivel).toBeNull();
  });
  it('inclinar el teléfono hacia arriba (beta > 90) baja la marca; hacia abajo la sube', () => {
    const c = { rumbo: 90, dist_m: 200, desnivel: 0 };
    expect(proyectar(c, 90, 100, FOV, PANT).y).toBeGreaterThan(400);
    expect(proyectar(c, 90, 80, FOV, PANT).y).toBeLessThan(400);
  });
  it('recorta y a [0, h]', () => {
    const y = proyectar({ rumbo: 90, dist_m: 100, desnivel: -500 }, 90, 90, FOV, PANT).y;
    expect(y).toBe(800);
  });
});

describe('deltaAngulo', () => {
  it('lleva la diferencia a (−180, 180]', () => {
    expect(deltaAngulo(5, 355)).toBe(10);
    expect(deltaAngulo(355, 5)).toBe(-10);
    expect(deltaAngulo(180, 0)).toBe(180);
    expect(deltaAngulo(0, 180)).toBe(180);
  });
});

describe('mediaCircular', () => {
  it('cruza el norte', () => {
    const m = mediaCircular([350, 10])!;
    expect(Math.min(m, 360 - m)).toBeCloseTo(0, 5);
  });
  it('vacía o resultante nula → null', () => {
    expect(mediaCircular([])).toBeNull();
    expect(mediaCircular([0, 180])).toBeNull();
  });
  it('ángulos iguales', () => { expect(mediaCircular([90, 90, 90])).toBeCloseTo(90, 5); });
});

describe('celdasMarca', () => {
  it('quita las de menos de 50 m y avisa «dentro» con una a menos de 80 m', () => {
    const r = celdasMarca([{ dist_m: 30 }, { dist_m: 70 }, { dist_m: 200 }]);
    expect(r.marcas.map((c) => c.dist_m)).toEqual([70, 200]);
    expect(r.dentro).toBe(true);
  });
  it('sin celdas cercanas: dentro false', () => {
    expect(celdasMarca([{ dist_m: 120 }, { dist_m: 300 }]).dentro).toBe(false);
    expect(celdasMarca([])).toEqual({ marcas: [], dentro: false });
  });
});

describe('rumbosBarrido', () => {
  it('8 rumbos desde el múltiplo de 45 más cercano', () => {
    expect(rumbosBarrido(100)).toEqual([90, 135, 180, 225, 270, 315, 0, 45]);
    expect(rumbosBarrido(359)).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
    expect(rumbosBarrido(-10)).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
  });
});

describe('listoParaDisparar', () => {
  it('exige rumbo a ±10°, teléfono casi vertical y quieto', () => {
    expect(listoParaDisparar(90, 98, 90, true)).toBe(true);
    expect(listoParaDisparar(90, 101, 90, true)).toBe(false);
    expect(listoParaDisparar(90, 90, 40, true)).toBe(false);
    expect(listoParaDisparar(90, null, 90, true)).toBe(false);
    expect(listoParaDisparar(90, 90, null, true)).toBe(false);
    expect(listoParaDisparar(90, 90, 90, false)).toBe(false);
  });
  it('cruce del norte', () => { expect(listoParaDisparar(0, 355, 90, true)).toBe(true); });
});

describe('estaQuieto', () => {
  it('5 lecturas dentro de ±1°', () => { expect(estaQuieto([90, 91, 89, 90.5, 89.5])).toBe(true); });
  it('menos de 5 lecturas: no', () => { expect(estaQuieto([90, 90, 90, 90])).toBe(false); });
  it('±10°: no', () => { expect(estaQuieto([80, 100, 80, 100, 80])).toBe(false); });
  it('cruce del norte', () => { expect(estaQuieto([359, 1, 0, 359.5, 0.5])).toBe(true); });
});

describe('enSector', () => {
  it('celdas a ±22,5° del rumbo', () => {
    const cs = [0, 20, 30, 340].map((rumbo) => ({ rumbo }));
    expect(enSector(cs, 0).map((c) => c.rumbo)).toEqual([0, 20, 340]);
  });
});
