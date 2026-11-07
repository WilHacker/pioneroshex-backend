import { CATALOGO, infoDelCatalogo, infoDelMapa, mapaDelCatalogo } from './catalogo.js';

describe('infoDelMapa (memoizada)', () => {
  it('devuelve el mismo objeto cada vez: no reconstruye el mapa en cada petición', () => {
    const lagos = mapaDelCatalogo('lagos')!;
    expect(infoDelMapa(lagos)).toBe(infoDelMapa(lagos));
  });
});

describe('infoDelCatalogo', () => {
  const lista = infoDelCatalogo();

  it('trae todos los mapas, en el orden del catálogo', () => {
    expect(lista.map((m) => m.id)).toEqual(CATALOGO.map((m) => m.id));
  });

  it('es la misma lista cada vez (se calcula una sola vez)', () => {
    expect(infoDelCatalogo()).toBe(lista);
  });

  it('cada entrada lleva la forma para dibujar la vista previa: una pareja [q, r] por casilla', () => {
    for (const info of lista) {
      expect(info.forma).toHaveLength(info.casillas);
      expect(info.forma.every(([q, r]) => Number.isInteger(q) && Number.isInteger(r))).toBe(true);
    }
  });

  it('trae el tamaño y los rangos de jugadores', () => {
    const clasico = lista.find((m) => m.id === 'clasico')!;
    expect(clasico).toMatchObject({
      nombre: 'Clásico',
      casillas: 19,
      vertices: 54,
      maximoTecnico: 7,
      maximoRecomendado: 4,
      minimoRecomendado: 2,
    });
  });

  it('el catálogo entero cabe en pocos kilobytes (se manda en una sola petición)', () => {
    expect(JSON.stringify(lista).length).toBeLessThan(40_000);
  });
});
