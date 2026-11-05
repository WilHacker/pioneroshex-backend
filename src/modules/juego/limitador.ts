/**
 * Limitador de ventana deslizante: devuelve una función que dice si se permite una llamada más.
 * Cada socket tiene el suyo, para que un cliente que inunda de acciones no sature al servidor.
 */
export function crearLimitador(
  maximo: number,
  ventanaMs: number,
  ahora: () => number = Date.now,
): () => boolean {
  let marcas: number[] = [];
  return () => {
    const ahoraMs = ahora();
    marcas = marcas.filter((marca) => ahoraMs - marca < ventanaMs);
    if (marcas.length >= maximo) return false;
    marcas.push(ahoraMs);
    return true;
  };
}
