/**
 * Convierte un texto de semilla (por ejemplo `"ANDES-2026"`) en un entero de 32 bits sin signo
 * con FNV-1a. `pure-rand` solo acepta semillas numéricas.
 */
export function semillaDesdeTexto(texto: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
