import { Inject, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { z } from 'zod';
import type { MotivoAccion } from '../../core/estado/tipos.js';
import { accionDeJugador, esquemaAccionEntrante } from '../../schemas/accion.js';
import { crearLimitador } from '../../infra/http/limitador.js';
import type { PartidaActor } from './partida-actor.js';
import { SalasService } from './salas.service.js';

/** Eventos de socket (nombres provisionales, ver CLAUDE.md). */
export const EVENTO_ACCION = 'juego:accion';
export const EVENTO_INICIO = 'juego:inicio';
export const EVENTO_NOTIFICACION = 'juego:notificacion';
export const EVENTO_ERROR = 'juego:error';

const ACCIONES_MAX_POR_VENTANA = 30;
const VENTANA_MS = 10_000;

const esquemaCredenciales = z.object({
  salaId: z.string().min(1).max(40),
  token: z.string().min(1).max(200),
});

/** Lo que recibe el cliente como acuse de una acción. Nunca lleva estado ni eventos con secretos. */
export type RespuestaAccion =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly motivo:
        | MotivoAccion
        | 'NO_AUTORIZADO'
        | 'ACCION_INVALIDA'
        | 'DEMASIADAS_ACCIONES'
        | 'ERROR_INTERNO';
      readonly falta?: unknown;
      readonly detalle?: unknown;
    };

interface Sesion {
  readonly jugadorId: string;
  readonly actor: PartidaActor;
  readonly baja: () => void;
  readonly permitir: () => boolean;
}

@WebSocketGateway()
export class JuegoGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(JuegoGateway.name);
  private readonly sesiones = new WeakMap<Socket, Sesion>();

  constructor(@Inject(SalasService) private readonly salas: SalasService) {}

  /** El jugador se identifica con el token de su sala; sin él no se entra. */
  handleConnection(socket: Socket): void {
    const credenciales = esquemaCredenciales.safeParse(socket.handshake.auth);
    const jugadorId = credenciales.success
      ? this.salas.autenticar(credenciales.data.salaId, credenciales.data.token)
      : undefined;
    if (!credenciales.success || jugadorId === undefined) {
      this.rechazar(socket, 'NO_AUTORIZADO');
      return;
    }
    const actor = this.salas.partida(credenciales.data.salaId);
    if (!actor) {
      this.rechazar(socket, 'PARTIDA_NO_EMPEZADA');
      return;
    }
    const baja = actor.suscribir(jugadorId, (notificacion) =>
      socket.emit(EVENTO_NOTIFICACION, notificacion),
    );
    this.sesiones.set(socket, {
      jugadorId,
      actor,
      baja,
      permitir: crearLimitador(ACCIONES_MAX_POR_VENTANA, VENTANA_MS),
    });
    const { acciones, sitios } = actor.ayuda(jugadorId);
    socket.emit(EVENTO_INICIO, {
      jugadorId,
      mesa: actor.mesaPublica,
      vista: actor.vista(jugadorId),
      acciones,
      sitios,
    });
  }

  handleDisconnect(socket: Socket): void {
    this.sesiones.get(socket)?.baja();
    this.sesiones.delete(socket);
  }

  @SubscribeMessage(EVENTO_ACCION)
  async accion(
    @ConnectedSocket() socket: Socket,
    @MessageBody() cuerpo: unknown,
  ): Promise<RespuestaAccion> {
    const sesion = this.sesiones.get(socket);
    if (!sesion) return { ok: false, motivo: 'NO_AUTORIZADO' };
    if (!sesion.permitir()) return { ok: false, motivo: 'DEMASIADAS_ACCIONES' };
    const entrante = esquemaAccionEntrante.safeParse(cuerpo);
    if (!entrante.success) return { ok: false, motivo: 'ACCION_INVALIDA' };
    try {
      // El jugador sale de la sesión autenticada, nunca de lo que mande el cliente.
      const resultado = await sesion.actor.enviar(accionDeJugador(entrante.data, sesion.jugadorId));
      if (resultado.ok) return { ok: true };
      return resultado;
    } catch (error: unknown) {
      this.logger.error(
        `Falló una acción de "${sesion.jugadorId}": ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return { ok: false, motivo: 'ERROR_INTERNO' };
    }
  }

  private rechazar(socket: Socket, motivo: string): void {
    socket.emit(EVENTO_ERROR, { motivo });
    socket.disconnect(true);
  }
}
