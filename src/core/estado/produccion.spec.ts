import { describe, expect, it } from 'vitest';
import { clave } from '../mapa/coordenadas.js';
import type { Hex } from '../mapa/coordenadas.js';
import { crearPartida } from './crear.js';
import { RECURSO_POR_TERRENO, repartirProduccion } from './produccion.js';
import { casillaConFicha, conCambios, mesaDePrueba } from './pruebas.js';
import type { Edificio, Estado, Evento, TipoEdificio } from './tipos.js';

const mesa = mesaDePrueba();
const base = crearPartida(mesa, ['a', 'b', 'c', 'd']);
const [j0, j1] = base.jugadores.map((j) => j.id) as [string, string];

const casilla8 = casillaConFicha(mesa, 8)!;
const recurso8 = RECURSO_POR_TERRENO[casilla8.terreno]!;
const verticesDe = (hex: Hex): string[] =>
  mesa.mapa.vertices
    .filter((v) => v.casillas.some((c) => clave(c) === clave(hex)))
    .map((v) => v.id);
const [v1, v2] = verticesDe(casilla8.hex) as [string, string];

const conEdificios = (edificios: Record<string, Edificio>, extra: Partial<Estado> = {}): Estado =>
  conCambios(base, { edificios, ...extra });
const edificio = (dueno: string, tipo: TipoEdificio = 'POBLADO'): Edificio => ({ dueno, tipo });
const bancoCon = (n: number): Estado['banco'] => ({ ...base.banco, [recurso8]: n });
const repartos = (eventos: readonly Evento[], recurso = recurso8): Evento[] =>
  eventos.filter((e) => e.tipo === 'RECURSOS_REPARTIDOS' && e.recurso === recurso);

describe('RECURSO_POR_TERRENO', () => {
  it('mapea cada terreno a su recurso y el desierto a null', () => {
    expect(RECURSO_POR_TERRENO).toEqual({
      BOSQUE: 'MADERA',
      PASTO: 'OVEJA',
      CAMPO: 'TRIGO',
      COLINA: 'LADRILLO',
      MONTANA: 'MINERAL',
      DESIERTO: null,
    });
  });
});

describe('repartirProduccion', () => {
  it('con suma 7 no reparte nada', () => {
    expect(repartirProduccion(mesa, conEdificios({ [v1]: edificio(j0) }), 7)).toEqual([]);
  });

  it('un poblado cobra 1 recurso con su fuente', () => {
    const eventos = repartos(repartirProduccion(mesa, conEdificios({ [v1]: edificio(j0) }), 8));
    expect(eventos).toEqual([
      {
        tipo: 'RECURSOS_REPARTIDOS',
        jugador: j0,
        recurso: recurso8,
        cantidad: 1,
        pedido: 1,
        recortado: 0,
        causa: {
          tipo: 'PRODUCCION',
          tirada: 8,
          fuentes: [
            { casilla: clave(casilla8.hex), vertice: v1, edificio: 'POBLADO', cantidad: 1 },
          ],
        },
      },
    ]);
  });

  it('una ciudad cobra 2', () => {
    const eventos = repartos(
      repartirProduccion(mesa, conEdificios({ [v1]: edificio(j0, 'CIUDAD') }), 8),
    );
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ cantidad: 2 });
  });

  it('dos jugadores en la misma casilla generan dos eventos', () => {
    const eventos = repartos(
      repartirProduccion(mesa, conEdificios({ [v1]: edificio(j0), [v2]: edificio(j1) }), 8),
    );
    expect(eventos).toHaveLength(2);
    expect(eventos).toContainEqual(expect.objectContaining({ jugador: j0 }));
    expect(eventos).toContainEqual(expect.objectContaining({ jugador: j1 }));
  });

  it('una suma sin casillas con esa ficha no reparte', () => {
    expect(repartirProduccion(mesa, conEdificios({ [v1]: edificio(j0) }), 13)).toEqual([]);
  });

  it('el ladrón bloquea la casilla donde está', () => {
    const estado = conEdificios({ [v1]: edificio(j0) }, { ladron: casilla8.hex });
    expect(repartos(repartirProduccion(mesa, estado, 8))).toEqual([]);
  });

  describe('banco corto', () => {
    const dos = { [v1]: edificio(j0), [v2]: edificio(j1) };

    it('si no alcanza para todos, nadie cobra ese recurso', () => {
      const eventos = repartirProduccion(mesa, conEdificios(dos, { banco: bancoCon(1) }), 8);
      expect(eventos).toEqual([
        { tipo: 'PRODUCCION_BLOQUEADA', recurso: recurso8, pedido: 2, disponible: 1 },
      ]);
    });

    it('si solo un jugador lo espera, recibe lo que quede', () => {
      const estado = conEdificios({ [v1]: edificio(j0, 'CIUDAD') }, { banco: bancoCon(1) });
      const eventos = repartirProduccion(mesa, estado, 8);
      expect(eventos).toHaveLength(1);
      expect(eventos[0]).toMatchObject({ jugador: j0, cantidad: 1, pedido: 2, recortado: 1 });
    });

    it('con el banco vacío no se emite un reparto de 0', () => {
      const estado = conEdificios({ [v1]: edificio(j0) }, { banco: bancoCon(0) });
      expect(repartirProduccion(mesa, estado, 8)).toEqual([]);
    });

    it('con banco suficiente todos cobran', () => {
      const eventos = repartirProduccion(mesa, conEdificios(dos, { banco: bancoCon(2) }), 8);
      expect(repartos(eventos)).toHaveLength(2);
      expect(eventos.some((e) => e.tipo === 'PRODUCCION_BLOQUEADA')).toBe(false);
    });
  });

  it('un vértice entre casillas con la misma ficha da una sola entrada con todas las fuentes', () => {
    const vertice = mesa.mapa.vertices.find((v) => v.casillas.length === 3)!;
    const claves = new Set(vertice.casillas.map(clave));
    const casillas = mesa.tablero.casillas.map((c) =>
      claves.has(clave(c.hex)) ? { ...c, terreno: 'BOSQUE' as const, ficha: 6 } : c,
    );
    const mesaMod = { ...mesa, tablero: { ...mesa.tablero, casillas } };
    const eventos = repartirProduccion(mesaMod, conEdificios({ [vertice.id]: edificio(j0) }), 6);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ recurso: 'MADERA', cantidad: 3 });
    expect(eventos[0]).toMatchObject({
      causa: {
        fuentes: expect.arrayContaining(
          vertice.casillas.map((c) => expect.objectContaining({ casilla: clave(c) })),
        ),
      },
    });
    expect(eventos[0]).toMatchObject({
      causa: { fuentes: expect.toSatisfy((f: unknown[]) => f.length === 3) },
    });
  });

  it('no muta el estado recibido', () => {
    const estado = conEdificios({ [v1]: edificio(j0) });
    const copia = structuredClone(estado);
    repartirProduccion(mesa, estado, 8);
    expect(estado).toEqual(copia);
  });
});
