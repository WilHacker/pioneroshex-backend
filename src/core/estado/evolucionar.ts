import { produce, type Draft } from 'immer';
import type { Costo } from '../reglas/costos.js';
import { RECURSOS, type Recurso } from '../reglas/recursos.js';
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
    case 'DESCARTE_REQUERIDO':
      estado.descartesPendientes[evento.jugador] = evento.cantidad;
      return;
    case 'RECURSOS_DESCARTADOS': {
      const jugador = jugadorDe(estado, evento.jugador);
      pagar(estado, jugador, evento.recursos);
      delete estado.descartesPendientes[evento.jugador];
      return;
    }
    case 'LADRON_MOVIDO':
      estado.ladron = { ...evento.destino };
      return;
    case 'CARTA_ROBADA':
      if (evento.recurso !== null) {
        jugadorDe(estado, evento.victima).recursos[evento.recurso] -= 1;
        jugadorDe(estado, evento.ladron).recursos[evento.recurso] += 1;
      }
      return;
    case 'RECURSOS_REPARTIDOS':
      jugadorDe(estado, evento.jugador).recursos[evento.recurso] += evento.cantidad;
      estado.banco[evento.recurso] -= evento.cantidad;
      return;
    case 'CAMBIO_CON_BANCA_REALIZADO': {
      const jugador = jugadorDe(estado, evento.jugador);
      jugador.recursos[evento.entrega] -= evento.cantidadEntregada;
      jugador.recursos[evento.recibe] += evento.cantidadRecibida;
      estado.banco[evento.entrega] += evento.cantidadEntregada;
      estado.banco[evento.recibe] -= evento.cantidadRecibida;
      return;
    }
    case 'TRATO_PROPUESTO':
      estado.tratos.push({
        ...evento.trato,
        entrega: { ...evento.trato.entrega },
        pide: { ...evento.trato.pide },
        rechazadoPor: [...evento.trato.rechazadoPor],
      });
      return;
    case 'TRATO_ACEPTADO': {
      const proponente = jugadorDe(estado, evento.proponente);
      const aceptante = jugadorDe(estado, evento.aceptante);
      for (const r of RECURSOS) {
        proponente.recursos[r] -= evento.entrega[r];
        aceptante.recursos[r] += evento.entrega[r];
        aceptante.recursos[r] -= evento.pide[r];
        proponente.recursos[r] += evento.pide[r];
      }
      estado.tratos = estado.tratos.filter((t) => t.id !== evento.tratoId);
      // Elimina tratos del proponente o aceptante que ya no puedan cumplirse
      estado.tratos = estado.tratos.filter((t) => {
        const p = estado.jugadores.find((j) => j.id === t.proponente);
        if (!p) return false;
        return RECURSOS.every((r) => p.recursos[r] >= t.entrega[r]);
      });
      return;
    }
    case 'TRATO_RECHAZADO': {
      const trato = estado.tratos.find((t) => t.id === evento.tratoId);
      if (trato) {
        if (trato.destinatario !== null) {
          estado.tratos = estado.tratos.filter((t) => t.id !== evento.tratoId);
        } else {
          const actualizados = [...trato.rechazadoPor, evento.jugador];
          const rivales = estado.jugadores.filter((j) => j.id !== trato.proponente);
          if (actualizados.length >= rivales.length) {
            estado.tratos = estado.tratos.filter((t) => t.id !== evento.tratoId);
          } else {
            trato.rechazadoPor = actualizados;
          }
        }
      }
      return;
    }
    case 'TRATO_CANCELADO':
      estado.tratos = estado.tratos.filter((t) => t.id !== evento.tratoId);
      return;
    case 'FASE_ESPECIAL_INICIADA':
      estado.fase = 'CONSTRUCCION_ESPECIAL';
      estado.turnoEspecialDe = evento.primerConstructor;
      estado.tratos = [];
      return;
    case 'CONSTRUCCION_ESPECIAL_PASADA':
      if (evento.siguienteConstructor !== null) {
        estado.turnoEspecialDe = evento.siguienteConstructor;
      } else {
        estado.turnoEspecialDe = null;
      }
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
      estado.turnoEspecialDe = null;
      estado.tratos = [];
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
