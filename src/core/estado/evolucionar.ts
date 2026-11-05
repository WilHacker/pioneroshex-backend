import { produce, type Draft } from 'immer';
import type { Costo } from '../reglas/costos.js';
import type { Recurso } from '../reglas/recursos.js';
import type { Estado, Evento, Jugador, JugadorId } from './tipos.js';

function jugadorDe(estado: Draft<Estado>, id: JugadorId): Draft<Jugador> {
  const jugador = estado.jugadores.find((j) => j.id === id);
  if (!jugador) throw new Error(`Jugador inexistente: ${id}`);
  return jugador;
}

/** El jugador paga el costo al banco. */
function pagar(estado: Draft<Estado>, jugador: Draft<Jugador>, costo: Costo): void {
  for (const [recurso, n] of Object.entries(costo) as [Recurso, number][]) {
    jugador.recursos[recurso] -= n;
    estado.banco[recurso] += n;
  }
}

function aplicarEvento(estado: Draft<Estado>, evento: Evento): void {
  switch (evento.tipo) {
    case 'POBLADO_COLOCADO': {
      const jugador = jugadorDe(estado, evento.jugador);
      estado.edificios[evento.vertice] = { dueno: evento.jugador, tipo: 'POBLADO' };
      jugador.piezasRestantes.poblados -= 1;
      pagar(estado, jugador, evento.costo);
      if (evento.origen === 'PREPARACION') estado.pobladoPendiente = evento.vertice;
      return;
    }
    case 'CIUDAD_COLOCADA': {
      const jugador = jugadorDe(estado, evento.jugador);
      estado.edificios[evento.vertice] = { dueno: evento.jugador, tipo: 'CIUDAD' };
      jugador.piezasRestantes.poblados += 1;
      jugador.piezasRestantes.ciudades -= 1;
      pagar(estado, jugador, evento.costo);
      return;
    }
    case 'CAMINO_COLOCADO': {
      const jugador = jugadorDe(estado, evento.jugador);
      estado.caminos[evento.arista] = evento.jugador;
      jugador.piezasRestantes.caminos -= 1;
      pagar(estado, jugador, evento.costo);
      if (evento.origen === 'PREPARACION') estado.pobladoPendiente = null;
      return;
    }
    case 'DADOS_TIRADOS':
      jugadorDe(estado, evento.jugador);
      estado.dados = [...evento.dados];
      estado.tiradas += 1;
      return;
    case 'RECURSOS_REPARTIDOS':
      jugadorDe(estado, evento.jugador).recursos[evento.recurso] += evento.cantidad;
      estado.banco[evento.recurso] -= evento.cantidad;
      return;
    case 'PRODUCCION_BLOQUEADA':
      return;
    case 'FASE_CAMBIADA':
      estado.fase = evento.fase;
      estado.turnoDe = evento.turnoDe;
      estado.pasoPreparacion = evento.pasoPreparacion;
      return;
    case 'TURNO_TERMINADO':
      jugadorDe(estado, evento.jugador);
      estado.turnoDe = evento.siguiente;
      estado.fase = 'PRE_TIRADA';
      estado.dados = null;
      return;
    case 'PARTIDA_GANADA':
      jugadorDe(estado, evento.jugador);
      estado.fase = 'FIN';
      estado.ganador = evento.jugador;
      return;
    default: {
      const imposible: never = evento;
      throw new Error(`Evento desconocido: ${JSON.stringify(imposible)}`);
    }
  }
}

/** Aplica un evento ya validado y devuelve un estado nuevo (inmutable); suma 1 a `version`. */
export function evolucionar(estado: Estado, evento: Evento): Estado {
  return produce(estado, (borrador) => {
    aplicarEvento(borrador, evento);
    borrador.version += 1;
  });
}
