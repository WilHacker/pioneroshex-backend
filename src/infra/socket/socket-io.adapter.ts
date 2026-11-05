import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';

/** Una acción cabe de sobra en 16 KB; el valor por defecto (1 MB) deja mandar basura grande. */
const TAMANO_MAX_MENSAJE = 16 * 1024;

/** Socket.io con CORS limitado al frontend y mensajes pequeños. CORS no es autenticación. */
export class AdaptadorSocketIo extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly origen: string,
  ) {
    super(app);
  }

  override createIOServer(puerto: number, opciones?: ServerOptions): Server {
    return super.createIOServer(puerto, {
      ...opciones,
      cors: { origin: this.origen, credentials: true },
      maxHttpBufferSize: TAMANO_MAX_MENSAJE,
    } as ServerOptions);
  }
}
