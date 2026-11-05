import { clave } from '../mapa/coordenadas.js';
import { crearRng, mezclar } from '../reglas/azar.js';
import { RECURSOS, type Recurso } from '../reglas/recursos.js';
import type { Mesa } from './mesa.js';
import type { Accion, CausaAccion, Decision, Estado, Evento, JugadorId } from './tipos.js';
import { decidirFinDeTurno, decidirPasarConstruccionEspecial, decidirTirada } from './turno.js';

export function decidirLadrón(
  mesa: Mesa,
  estado: Estado,
  accion: Accion,
  causa: CausaAccion = 'VOLUNTARIA',
): Decision {
  if (accion.tipo !== 'MOVER_LADRON') return { ok: false, motivo: 'FASE_INCORRECTA' };
  if (estado.fase !== 'MOVER_LADRON') return { ok: false, motivo: 'FASE_INCORRECTA' };

  // Verifica que el destino esté en el mapa
  const claveDestino = clave(accion.destino);
  const esCasillaValida = mesa.mapa.casillas.some((c) => clave(c) === claveDestino);
  if (!esCasillaValida) {
    return { ok: false, motivo: 'DESTINO_INVALIDO' };
  }

  // Verifica que no sea la misma casilla actual
  if (estado.ladron && clave(estado.ladron) === claveDestino) {
    return { ok: false, motivo: 'MISMO_DESTINO' };
  }

  // Encuentra rivales con edificios en vértices de la casilla destino
  const verticesCasilla = mesa.mapa.vertices.filter((v) =>
    v.casillas.some((c) => clave(c) === claveDestino),
  );

  const rivalesConEdificios = new Set<JugadorId>();
  for (const vertice of verticesCasilla) {
    const edificio = estado.edificios[vertice.id];
    if (edificio && edificio.dueno !== accion.jugador) {
      rivalesConEdificios.add(edificio.dueno);
    }
  }

  // Filtra rivales que tienen al menos 1 carta en mano
  const rivalesConCartas: JugadorId[] = [];
  for (const rId of rivalesConEdificios) {
    const jugador = estado.jugadores.find((j) => j.id === rId);
    if (jugador) {
      const totalCartas = RECURSOS.reduce((s, r) => s + jugador.recursos[r], 0);
      if (totalCartas > 0) {
        rivalesConCartas.push(rId);
      }
    }
  }

  const eventos: Evento[] = [
    {
      tipo: 'LADRON_MOVIDO',
      jugador: accion.jugador,
      destino: accion.destino,
      causa,
    },
  ];

  if (rivalesConCartas.length > 0) {
    if (accion.victima === null) {
      return { ok: false, motivo: 'VICTIMA_REQUERIDA' };
    }
    if (!rivalesConCartas.includes(accion.victima)) {
      return { ok: false, motivo: 'VICTIMA_INVALIDA' };
    }

    // Roba una carta al azar de la víctima de forma determinista
    const victimaJugador = estado.jugadores.find((j) => j.id === accion.victima)!;
    const cartasVictima: Recurso[] = [];
    for (const r of RECURSOS) {
      for (let i = 0; i < victimaJugador.recursos[r]; i++) {
        cartasVictima.push(r);
      }
    }

    const rng = crearRng(`${estado.config.semillaAzar}:robo:${estado.tiradas}`);
    const cartaRobada = mezclar(cartasVictima, rng)[0]!;

    eventos.push({
      tipo: 'CARTA_ROBADA',
      ladron: accion.jugador,
      victima: accion.victima,
      recurso: cartaRobada,
    });
  } else {
    if (accion.victima !== null) {
      return { ok: false, motivo: 'SIN_VICTIMA_POSIBLE' };
    }
  }

  eventos.push({
    tipo: 'FASE_CAMBIADA',
    fase: 'FASE_PRINCIPAL',
    turnoDe: estado.turnoDe,
    pasoPreparacion: estado.pasoPreparacion,
  });

  return { ok: true, eventos };
}

/**
 * Acción forzada para cuando expira el temporizador de inactividad de un jugador.
 * En PRE_TIRADA: tira los dados.
 * En MOVER_LADRON: mueve el ladrón al desierto (o a la primera casilla válida) sin robar.
 * En FASE_PRINCIPAL: termina el turno.
 */
export function decidirSaltoInactividad(mesa: Mesa, estado: Estado, accion: Accion): Decision {
  if (accion.tipo !== 'SALTAR_TURNO_POR_INACTIVIDAD') {
    return { ok: false, motivo: 'FASE_INCORRECTA' };
  }

  if (estado.fase === 'PRE_TIRADA') {
    return decidirTirada(
      mesa,
      estado,
      { tipo: 'TIRAR_DADOS', jugador: accion.jugador },
      'INACTIVIDAD',
    );
  }

  if (estado.fase === 'MOVER_LADRON') {
    // Mueve a una casilla válida diferente de la actual sin robar
    const actual = estado.ladron ? clave(estado.ladron) : null;
    const destinoHex =
      mesa.mapa.casillas.find((c) => clave(c) !== actual) ?? mesa.mapa.casillas[0]!;
    return decidirLadrón(
      mesa,
      estado,
      { tipo: 'MOVER_LADRON', jugador: accion.jugador, destino: destinoHex, victima: null },
      'INACTIVIDAD',
    );
  }

  if (estado.fase === 'FASE_PRINCIPAL') {
    return decidirFinDeTurno(
      mesa,
      estado,
      { tipo: 'TERMINAR_TURNO', jugador: accion.jugador },
      'INACTIVIDAD',
    );
  }

  if (estado.fase === 'CONSTRUCCION_ESPECIAL') {
    return decidirPasarConstruccionEspecial(
      mesa,
      estado,
      { tipo: 'PASAR_CONSTRUCCION_ESPECIAL', jugador: accion.jugador },
      'INACTIVIDAD',
    );
  }

  return { ok: false, motivo: 'FASE_INCORRECTA' };
}
