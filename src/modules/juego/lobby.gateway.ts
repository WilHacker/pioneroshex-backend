import { Inject, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { z } from 'zod';
import { SalasService, type SalaPublica } from './salas.service.js';

/** Eventos del namespace `/lobby` (nombres provisionales, como los del juego). */
/** El estado público de una sala de espera, más quién tiene su pestaña abierta. */
export const EVENTO_SALA_ESTADO = 'sala:estado';
/** La sala dejó de existir (todos salieron o caducó). */
export const EVENTO_SALA_CERRADA = 'sala:cerrada';
/** Las salas públicas abiertas y los números de la portada. */
export const EVENTO_PORTADA = 'portada:salas';
export const EVENTO_LOBBY_ERROR = 'lobby:error';

const SALA_PREFIJO = 'sala:';
const SALA_PORTADA = 'portada';

/** Sin `salaId` el socket mira la portada; con `salaId`, esa sala. El token es opcional. */
const esquemaEntrada = z.object({
  salaId: z.string().min(1).max(40).optional(),
  token: z.string().max(200).optional(),
});

export interface SalaConPresencia extends SalaPublica {
  /** Jugadores con al menos una pestaña conectada a esta sala. */
  readonly conectados: readonly string[];
}

interface Mirada {
  readonly salaId: string;
  readonly jugadorId: string | undefined;
}

/**
 * Empuja a los navegadores lo que antes tenían que preguntar cada pocos segundos: el estado de la
 * sala de espera y la lista de salas abiertas. Las acciones (crear, entrar, salir…) siguen por HTTP.
 * Todo lo que sale aquí ya es público (lo mismo que devuelve `GET /salas/:id`); nunca hay tokens.
 */
@WebSocketGateway({ namespace: 'lobby' })
export class LobbyGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(LobbyGateway.name);
  @WebSocketServer() private readonly servidor: Namespace | undefined;
  private readonly miradas = new WeakMap<Socket, Mirada>();
  /** sala → jugador → cuántas pestañas suyas hay conectadas. */
  private readonly conectados = new Map<string, Map<string, number>>();
  private darDeBaja: (() => void) | undefined;

  constructor(@Inject(SalasService) private readonly salas: SalasService) {}

  onModuleInit(): void {
    this.darDeBaja = this.salas.alCambiar((salaId) => {
      this.difundirSala(salaId);
      this.difundirPortada();
    });
  }

  onModuleDestroy(): void {
    this.darDeBaja?.();
  }

  handleConnection(socket: Socket): void {
    const entrada = esquemaEntrada.safeParse(socket.handshake.auth);
    if (!entrada.success) {
      this.rechazar(socket, 'PETICION_INVALIDA');
      return;
    }
    const { salaId, token } = entrada.data;
    if (salaId === undefined) {
      void socket.join(SALA_PORTADA);
      socket.emit(EVENTO_PORTADA, this.portada());
      return;
    }
    const sala = this.estadoDe(salaId);
    if (sala === undefined) {
      this.rechazar(socket, 'SALA_NO_EXISTE');
      return;
    }
    // Un token que no vale no es un error: quien aún no entró (o ya lo sacaron) también mira la sala.
    const jugadorId = token === undefined ? undefined : this.salas.autenticar(salaId, token);
    void socket.join(SALA_PREFIJO + salaId);
    this.miradas.set(socket, { salaId, jugadorId });
    socket.emit(EVENTO_SALA_ESTADO, sala);
    if (jugadorId !== undefined) {
      this.sumar(salaId, jugadorId, 1);
      this.difundirSala(salaId);
    }
  }

  handleDisconnect(socket: Socket): void {
    const mirada = this.miradas.get(socket);
    this.miradas.delete(socket);
    if (mirada?.jugadorId === undefined) return;
    this.sumar(mirada.salaId, mirada.jugadorId, -1);
    this.difundirSala(mirada.salaId);
  }

  private sumar(salaId: string, jugadorId: string, delta: 1 | -1): void {
    const sala = this.conectados.get(salaId) ?? new Map<string, number>();
    const cuantas = (sala.get(jugadorId) ?? 0) + delta;
    if (cuantas > 0) sala.set(jugadorId, cuantas);
    else sala.delete(jugadorId);
    if (sala.size > 0) this.conectados.set(salaId, sala);
    else this.conectados.delete(salaId);
  }

  /** El estado público de la sala con la presencia, o `undefined` si ya no existe. */
  private estadoDe(salaId: string): SalaConPresencia | undefined {
    try {
      return {
        ...this.salas.estado(salaId),
        conectados: [...(this.conectados.get(salaId)?.keys() ?? [])],
      };
    } catch {
      return undefined;
    }
  }

  private difundirSala(salaId: string): void {
    const sala = this.estadoDe(salaId);
    const destino = this.servidor?.to(SALA_PREFIJO + salaId);
    if (sala === undefined) {
      this.conectados.delete(salaId);
      destino?.emit(EVENTO_SALA_CERRADA);
      return;
    }
    destino?.emit(EVENTO_SALA_ESTADO, sala);
  }

  private difundirPortada(): void {
    this.servidor?.to(SALA_PORTADA).emit(EVENTO_PORTADA, this.portada());
  }

  private portada(): {
    salas: ReturnType<SalasService['abiertas']>;
    resumen: ReturnType<SalasService['resumen']>;
  } {
    return { salas: this.salas.abiertas(), resumen: this.salas.resumen() };
  }

  private rechazar(socket: Socket, motivo: string): void {
    this.logger.debug(`Conexión al lobby rechazada: ${motivo}`);
    socket.emit(EVENTO_LOBBY_ERROR, { motivo });
    socket.disconnect(true);
  }
}
