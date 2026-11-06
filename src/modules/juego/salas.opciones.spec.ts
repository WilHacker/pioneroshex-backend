import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { RepositorioSalasMemoria } from '../../infra/salas/repositorio-salas.memoria.js';
import { PartidasService } from './partidas.service.js';
import { SalasService } from './salas.service.js';

function crear() {
  const repo = new RepositorioSalasMemoria();
  const partidas = new PartidasService();
  const salas = new SalasService(partidas, repo, { ahora: () => 1_000 });
  return { repo, partidas, salas };
}

const estado = async (promesa: Promise<unknown>): Promise<number> => {
  try {
    await promesa;
  } catch (e) {
    return (e as HttpException).getStatus();
  }
  throw new Error('no falló');
};

describe('SalasService: sala pública y opciones', () => {
  it('una sala nueva es privada y sin opciones; la pública se pide al crearla', async () => {
    const { salas } = crear();
    const privada = await salas.crear('Ana');
    const publica = await salas.crear('Beto', true);

    expect(salas.estado(privada.salaId)).toMatchObject({ publica: false, opciones: {} });
    expect(salas.estado(publica.salaId).publica).toBe(true);
  });

  it('el anfitrión cambia las opciones y todos las ven', async () => {
    const { salas } = crear();
    const a = await salas.crear('Ana');

    await salas.cambiar(a.salaId, a.token, { puntosVictoria: 12, modoDados: 'EQUILIBRADO' });
    await salas.cambiar(a.salaId, a.token, { publica: true, robberHandLimit: 9 });

    expect(salas.estado(a.salaId)).toMatchObject({
      publica: true,
      opciones: { puntosVictoria: 12, modoDados: 'EQUILIBRADO', robberHandLimit: 9 },
    });
  });

  it('solo el anfitrión cambia opciones (403), con token válido (401) y antes de empezar (409)', async () => {
    const { salas } = crear();
    const a = await salas.crear('Ana');
    const b = await salas.unirse(a.salaId, 'Beto');

    expect(await estado(salas.cambiar(a.salaId, 'falso', {}))).toBe(401);
    expect(await estado(salas.cambiar(a.salaId, b.token, {}))).toBe(403);
    expect(await estado(salas.cambiar('00000000', a.token, {}))).toBe(404);
    await salas.empezar(a.salaId, a.token, {});
    expect(await estado(salas.cambiar(a.salaId, a.token, {}))).toBe(409);
  });

  it('al empezar usa las opciones guardadas y lo que se pase al empezar tiene prioridad', async () => {
    const { salas } = crear();
    const a = await salas.crear('Ana');
    await salas.unirse(a.salaId, 'Beto');
    await salas.cambiar(a.salaId, a.token, { puntosVictoria: 12, modoDados: 'EQUILIBRADO' });

    await salas.empezar(a.salaId, a.token, { puntosVictoria: 8 });

    const config = salas.partida(a.salaId)?.estado.config;
    expect(config?.puntosVictoria).toBe(8);
    expect(config?.modoDados).toBe('EQUILIBRADO');
  });

  it('las opciones y la visibilidad sobreviven a un reinicio', async () => {
    const { repo, partidas, salas } = crear();
    const a = await salas.crear('Ana', true);
    await salas.cambiar(a.salaId, a.token, { puntosVictoria: 14 });

    const otra = new SalasService(partidas, repo, { ahora: () => 2_000 });
    await otra.onModuleInit();
    otra.onModuleDestroy();

    expect(otra.estado(a.salaId)).toMatchObject({
      publica: true,
      opciones: { puntosVictoria: 14 },
    });
  });
});

describe('SalasService: salas abiertas', () => {
  it('lista solo las públicas que no han empezado, sin ids de jugador ni tokens', async () => {
    const { salas } = crear();
    const abierta = await salas.crear('Ana', true);
    await salas.unirse(abierta.salaId, 'Beto');
    await salas.crear('Cleo');
    const empezada = await salas.crear('Dani', true);
    await salas.unirse(empezada.salaId, 'Eva');
    await salas.empezar(empezada.salaId, empezada.token, {});

    expect(salas.abiertas()).toEqual([
      { id: abierta.salaId, anfitrion: 'Ana', jugadores: 2, maximo: 10 },
    ]);
  });

  it('muestra como máximo 50 salas', async () => {
    const { salas } = crear();
    await Promise.all(Array.from({ length: 52 }, (_, i) => salas.crear(`J${i}`, true)));

    expect(salas.abiertas()).toHaveLength(50);
  });
});
