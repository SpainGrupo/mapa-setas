// Auditoría de seguridad 2026-11-08: la CSP del build (vite.config.ts) no debe abrir la puerta a scripts inyectados.
import { describe, expect, it } from 'vitest';
import { politicaCsp } from '../vite.config';

describe('Content-Security-Policy del build', () => {
  const p = politicaCsp(["'sha256-abc='"]);
  const directiva = (n: string) => p.split('; ').find((d) => d.startsWith(n + ' ')) ?? '';
  it('script-src sin unsafe-inline ni unsafe-eval; el script del tema entra por hash', () => {
    const s = directiva('script-src');
    expect(s).not.toMatch(/'unsafe-inline'|'unsafe-eval'|\*(?!\.clarity\.ms)|https:(?!\/\/)/);
    expect(s).toContain("'sha256-abc='");
    expect(s).toContain("'wasm-unsafe-eval'");   // onnxruntime
    expect(s).toContain('https://www.clarity.ms');   // Clarity solo tras aceptar
  });
  it('object-src none, base-uri y form-action self, sin iframes', () => {
    expect(directiva('object-src')).toBe("object-src 'none'");
    expect(directiva('base-uri')).toBe("base-uri 'self'");
    expect(directiva('form-action')).toBe("form-action 'self'");
    expect(directiva('frame-src')).toBe("frame-src 'none'");
  });
});
