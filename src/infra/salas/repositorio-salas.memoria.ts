import { RepositorioSalas, type SalaGuardada } from './repositorio-salas.js';

/**
 * Guarda en memoria, pasando por JSON como lo haría una base de datos real, para que las
 * pruebas detecten lo que no se pueda serializar. También sirve si no hay base de datos.
 */
export class RepositorioSalasMemoria extends RepositorioSalas {
  private readonly filas = new Map<string, string>();

  guardar(sala: SalaGuardada): Promise<void> {
    this.filas.set(sala.id, JSON.stringify(sala));
    return Promise.resolve();
  }

  cargarTodas(): Promise<SalaGuardada[]> {
    return Promise.resolve([...this.filas.values()].map((f) => JSON.parse(f) as SalaGuardada));
  }

  eliminar(id: string): Promise<void> {
    this.filas.delete(id);
    return Promise.resolve();
  }
}
