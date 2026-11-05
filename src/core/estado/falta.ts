import type { Costo } from '../reglas/costos.js';
import { RECURSOS, type Recurso } from '../reglas/recursos.js';

/** Lo que falta de cada recurso para cubrir `requerido` con `recursos`, o null si alcanza. */
export function faltaPara(
  recursos: Readonly<Record<Recurso, number>>,
  requerido: Readonly<Partial<Record<Recurso, number>>>,
): Costo | null {
  const falta = RECURSOS.map((r) => [r, (requerido[r] ?? 0) - recursos[r]] as const).filter(
    ([, diferencia]) => diferencia > 0,
  );
  return falta.length > 0 ? Object.fromEntries(falta) : null;
}
