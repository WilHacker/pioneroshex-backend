import { clave } from '../mapa/coordenadas.js';
import { crearRng, mezclar } from '../reglas/azar.js';
import { COSTOS } from '../reglas/costos.js';
import type { CartaDesarrollo } from '../reglas/mazo.js';
import { RECURSOS, type Recurso } from '../reglas/recursos.js';
import { puedeColocarCamino } from './conectividad.js';
import { faltaPara } from './falta.js';
import { evaluarGranRuta } from './gran-ruta.js';
import type { Mesa } from './mesa.js';
import { puntosDe } from './puntos.js';
import { victimasPosibles } from './victimas.js';
import type { Accion, Decision, Estado, Evento, JugadorId, ResultadoRegla } from './tipos.js';

function validarJugable(
  estado: Estado,
  jugadorId: JugadorId,
  tipoCarta: CartaDesarrollo,
): ResultadoRegla {
  const jugador = estado.jugadores.find((j) => j.id === jugadorId);
  if (!jugador) return { ok: false, motivo: 'JUGADOR_DESCONOCIDO' };
  if (estado.cartaJugadaEsteTurno) return { ok: false, motivo: 'YA_JUGASTE_CARTA_ESTE_TURNO' };
  const tieneJugable = jugador.cartasDesarrollo.includes(tipoCarta);
  if (!tieneJugable) {
    const tieneCompradaHoy = jugador.cartasCompradasEsteTurno.includes(tipoCarta);
    return {
      ok: false,
      motivo: tieneCompradaHoy ? 'CARTA_COMPRADA_ESTE_TURNO' : 'NO_TIENES_ESA_CARTA',
    };
  }
  return { ok: true };
}

/** Las cartas de desarrollo se pueden jugar antes de tirar los dados y en la fase principal. */
const fasePermiteJugarCarta = (estado: Estado): boolean =>
  estado.fase === 'FASE_PRINCIPAL' || estado.fase === 'PRE_TIRADA';

export function decidirComprarCarta(_mesa: Mesa, estado: Estado, accion: Accion): Decision {
  if (accion.tipo !== 'COMPRAR_CARTA_DESARROLLO') return { ok: false, motivo: 'FASE_INCORRECTA' };
  if (estado.fase !== 'FASE_PRINCIPAL' && estado.fase !== 'CONSTRUCCION_ESPECIAL') {
    return { ok: false, motivo: 'FASE_INCORRECTA' };
  }
  if (estado.mazo.length === 0) return { ok: false, motivo: 'MAZO_AGOTADO' };

  const jugador = estado.jugadores.find((j) => j.id === accion.jugador);
  if (!jugador) return { ok: false, motivo: 'JUGADOR_DESCONOCIDO' };

  const costo = COSTOS.CARTA;
  const falta = faltaPara(jugador.recursos, costo);
  if (falta) return { ok: false, motivo: 'RECURSOS_INSUFICIENTES', falta };

  const carta = estado.mazo[0]!;
  const eventos: Evento[] = [
    { tipo: 'CARTA_DESARROLLO_COMPRADA', jugador: accion.jugador, carta, costo: { ...costo } },
  ];

  if (carta === 'PUNTO_VICTORIA') {
    const pts = puntosDe(estado, accion.jugador, { incluirOcultos: true }) + 1;
    if (pts >= estado.config.puntosVictoria) {
      eventos.push({ tipo: 'PARTIDA_GANADA', jugador: accion.jugador, puntos: pts });
    }
  }

  return { ok: true, eventos };
}

export function decidirJugarCaballero(mesa: Mesa, estado: Estado, accion: Accion): Decision {
  if (accion.tipo !== 'JUGAR_CABALLERO') return { ok: false, motivo: 'FASE_INCORRECTA' };
  if (estado.fase !== 'FASE_PRINCIPAL' && estado.fase !== 'PRE_TIRADA') {
    return { ok: false, motivo: 'FASE_INCORRECTA' };
  }

  const validacion = validarJugable(estado, accion.jugador, 'CABALLERO');
  if (!validacion.ok) return validacion;

  const claveDestino = clave(accion.destino);
  const esCasillaValida = mesa.mapa.casillas.some((c) => clave(c) === claveDestino);
  if (!esCasillaValida) return { ok: false, motivo: 'DESTINO_INVALIDO' };

  if (estado.ladron && clave(estado.ladron) === claveDestino) {
    return { ok: false, motivo: 'MISMO_DESTINO', detalle: { ladronEn: { ...estado.ladron } } };
  }

  const rivalesConCartas = victimasPosibles(mesa, estado, accion.jugador, accion.destino);

  let recursoRobado: Recurso | null = null;
  if (rivalesConCartas.length > 0) {
    const detalle = { victimasPosibles: rivalesConCartas };
    if (accion.victima === null) return { ok: false, motivo: 'VICTIMA_REQUERIDA', detalle };
    if (!rivalesConCartas.includes(accion.victima)) {
      return { ok: false, motivo: 'VICTIMA_INVALIDA', detalle };
    }

    const victimaJugador = estado.jugadores.find((j) => j.id === accion.victima)!;
    const cartasVictima: Recurso[] = [];
    for (const r of RECURSOS) {
      for (let i = 0; i < victimaJugador.recursos[r]; i++) {
        cartasVictima.push(r);
      }
    }
    const rng = crearRng(`${estado.config.semillaAzar}:robo:${estado.tiradas}:${accion.jugador}`);
    recursoRobado = mezclar(cartasVictima, rng)[0]!;
  } else {
    if (accion.victima !== null) return { ok: false, motivo: 'SIN_VICTIMA_POSIBLE' };
  }

  const eventos: Evento[] = [
    {
      tipo: 'CABALLERO_JUGADO',
      jugador: accion.jugador,
      destino: accion.destino,
      victima: accion.victima,
      recursoRobado,
    },
  ];

  if (recursoRobado !== null && accion.victima !== null) {
    eventos.push({
      tipo: 'CARTA_ROBADA',
      ladron: accion.jugador,
      victima: accion.victima,
      recurso: recursoRobado,
    });
  }

  // Evalúa Gran Ejército
  const jActivo = estado.jugadores.find((j) => j.id === accion.jugador)!;
  const nuevosCaballeros = jActivo.caballerosJugados + 1;
  let nuevoTitularEjercito = estado.granEjercito;

  if (nuevosCaballeros >= 3) {
    if (estado.granEjercito === null) {
      nuevoTitularEjercito = accion.jugador;
      eventos.push({
        tipo: 'GRAN_EJERCITO_CAMBIADO',
        titularAnterior: null,
        nuevoTitular: accion.jugador,
        caballeros: nuevosCaballeros,
      });
    } else if (estado.granEjercito !== accion.jugador) {
      const titularActual = estado.jugadores.find((j) => j.id === estado.granEjercito)!;
      if (nuevosCaballeros > titularActual.caballerosJugados) {
        nuevoTitularEjercito = accion.jugador;
        eventos.push({
          tipo: 'GRAN_EJERCITO_CAMBIADO',
          titularAnterior: estado.granEjercito,
          nuevoTitular: accion.jugador,
          caballeros: nuevosCaballeros,
        });
      }
    }
  }

  // Comprobar victoria
  const extraPuntos =
    nuevoTitularEjercito === accion.jugador && estado.granEjercito !== accion.jugador ? 2 : 0;
  const pts = puntosDe(estado, accion.jugador, { incluirOcultos: true }) + extraPuntos;
  if (pts >= estado.config.puntosVictoria) {
    eventos.push({ tipo: 'PARTIDA_GANADA', jugador: accion.jugador, puntos: pts });
  }

  return { ok: true, eventos };
}

export function decidirJugarAbundancia(_mesa: Mesa, estado: Estado, accion: Accion): Decision {
  if (accion.tipo !== 'JUGAR_ABUNDANCIA') return { ok: false, motivo: 'FASE_INCORRECTA' };
  if (!fasePermiteJugarCarta(estado)) return { ok: false, motivo: 'FASE_INCORRECTA' };

  const validacion = validarJugable(estado, accion.jugador, 'ABUNDANCIA');
  if (!validacion.ok) return validacion;

  const [r1, r2] = accion.recursos;
  if (!RECURSOS.includes(r1) || !RECURSOS.includes(r2)) {
    return { ok: false, motivo: 'RECURSO_INVALIDO' };
  }

  // Lo que se pide de cada recurso: 2 del mismo, o 1 de cada uno.
  const pedidos: readonly (readonly [Recurso, number])[] =
    r1 === r2
      ? [[r1, 2]]
      : [
          [r1, 1],
          [r2, 1],
        ];
  for (const [recurso, pedido] of pedidos) {
    const disponible = estado.banco[recurso];
    if (disponible < pedido) {
      return { ok: false, motivo: 'BANCO_AGOTADO', detalle: { recurso, pedido, disponible } };
    }
  }

  return {
    ok: true,
    eventos: [{ tipo: 'ABUNDANCIA_JUGADA', jugador: accion.jugador, recursos: [r1, r2] }],
  };
}

export function decidirJugarMonopolio(_mesa: Mesa, estado: Estado, accion: Accion): Decision {
  if (accion.tipo !== 'JUGAR_MONOPOLIO') return { ok: false, motivo: 'FASE_INCORRECTA' };
  if (!fasePermiteJugarCarta(estado)) return { ok: false, motivo: 'FASE_INCORRECTA' };

  const validacion = validarJugable(estado, accion.jugador, 'MONOPOLIO');
  if (!validacion.ok) return validacion;

  if (!RECURSOS.includes(accion.recurso)) return { ok: false, motivo: 'RECURSO_INVALIDO' };

  let cantidadRobada = 0;
  for (const rival of estado.jugadores) {
    if (rival.id !== accion.jugador) {
      cantidadRobada += rival.recursos[accion.recurso];
    }
  }

  return {
    ok: true,
    eventos: [
      {
        tipo: 'MONOPOLIO_JUGADO',
        jugador: accion.jugador,
        recurso: accion.recurso,
        cantidadRobada,
      },
    ],
  };
}

export function decidirJugarConstruccionCarreteras(
  mesa: Mesa,
  estado: Estado,
  accion: Accion,
): Decision {
  if (accion.tipo !== 'JUGAR_CONSTRUCCION_CARRETERAS') {
    return { ok: false, motivo: 'FASE_INCORRECTA' };
  }
  if (!fasePermiteJugarCarta(estado)) return { ok: false, motivo: 'FASE_INCORRECTA' };

  const validacion = validarJugable(estado, accion.jugador, 'CONSTRUCCION_CARRETERAS');
  if (!validacion.ok) return validacion;

  const jugador = estado.jugadores.find((j) => j.id === accion.jugador)!;
  const maxCaminos = Math.min(2, jugador.piezasRestantes.caminos);
  if (maxCaminos === 0) return { ok: false, motivo: 'SIN_PIEZAS' };

  if (accion.aristas.length > maxCaminos) {
    return {
      ok: false,
      motivo: 'ARISTAS_INVALIDAS',
      detalle: { maximo: maxCaminos, pedidas: accion.aristas.length },
    };
  }

  const [a1, a2] = accion.aristas;
  const val1 = puedeColocarCamino(mesa, estado, accion.jugador, a1);
  if (!val1.ok) return val1;

  if (a2) {
    if (a1 === a2) {
      return { ok: false, motivo: 'ARISTA_OCUPADA', detalle: { dueno: accion.jugador } };
    }
    // Simula haber colocado a1
    const estadoConA1: Estado = {
      ...estado,
      caminos: { ...estado.caminos, [a1]: accion.jugador },
    };
    const val2 = puedeColocarCamino(mesa, estadoConA1, accion.jugador, a2);
    if (!val2.ok) return val2;
  }

  const caminosNuevos = a2 ? [a1, a2] : [a1];
  const eventos: Evento[] = [
    {
      tipo: 'CONSTRUCCION_CARRETERAS_JUGADA',
      jugador: accion.jugador,
      aristas: caminosNuevos,
    },
  ];

  // Evalúa Gran Ruta
  const estadoSimulado: Estado = {
    ...estado,
    caminos: {
      ...estado.caminos,
      ...Object.fromEntries(caminosNuevos.map((id) => [id, accion.jugador])),
    },
  };
  const resRuta = evaluarGranRuta(mesa, estadoSimulado);
  let extraPuntos = 0;
  if (resRuta.titular !== estado.granRuta) {
    eventos.push({
      tipo: 'GRAN_RUTA_CAMBIADA',
      titularAnterior: estado.granRuta,
      nuevoTitular: resRuta.titular,
      longitud: resRuta.longitud,
    });
    if (resRuta.titular === accion.jugador) extraPuntos = 2;
  }

  const pts = puntosDe(estado, accion.jugador, { incluirOcultos: true }) + extraPuntos;
  if (pts >= estado.config.puntosVictoria) {
    eventos.push({ tipo: 'PARTIDA_GANADA', jugador: accion.jugador, puntos: pts });
  }

  return { ok: true, eventos };
}
