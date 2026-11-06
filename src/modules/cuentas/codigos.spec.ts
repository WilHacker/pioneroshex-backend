import { describe, expect, it } from 'vitest';
import { generarCodigos, hashCodigo, hashToken, nuevoToken, normalizarCodigo } from './codigos.js';

describe('códigos de recuperación', () => {
  it('genera 8 códigos distintos con el formato AAAA-BBBB-CCCC-DDDD sin letras confusas', () => {
    const codigos = generarCodigos();

    expect(codigos).toHaveLength(8);
    expect(new Set(codigos).size).toBe(8);
    for (const codigo of codigos)
      expect(codigo).toMatch(/^([A-HJ-NP-Z2-9]{4}-){3}[A-HJ-NP-Z2-9]{4}$/);
  });

  it('normaliza mayúsculas, espacios y guiones al comparar', () => {
    expect(normalizarCodigo(' abcd-efgh-jklm-npqr ')).toBe('ABCDEFGHJKLMNPQR');
    expect(normalizarCodigo('abcd efgh jklm npqr')).toBe('ABCDEFGHJKLMNPQR');
    expect(hashCodigo('abcd-efgh-jklm-npqr')).toBe(hashCodigo('ABCD EFGH JKLM NPQR'));
  });

  it('un código con otro largo o con letras ilegales no sirve', () => {
    expect(normalizarCodigo('ABC')).toBeNull();
    expect(normalizarCodigo('ABCD-EFGH-JKLM-NPQR-STUV')).toBeNull();
    expect(normalizarCodigo('ABCD-EFGH-JKLM-NPQ0')).toBeNull();
  });

  it('el hash es SHA-256 en hexadecimal y no contiene el código', () => {
    const hash = hashCodigo('ABCD-EFGH-JKLM-NPQR');

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('ABCD');
  });
});

describe('tokens de sesión', () => {
  it('son largos, distintos y su hash es estable', () => {
    const a = nuevoToken();
    const b = nuevoToken();

    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(hashToken(b));
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});
