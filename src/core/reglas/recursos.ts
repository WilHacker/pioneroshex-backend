/** Recursos del juego. Nombres en español provisionales (ver Backlog). */
export const RECURSOS = ['MADERA', 'LADRILLO', 'OVEJA', 'TRIGO', 'MINERAL'] as const;

export type Recurso = (typeof RECURSOS)[number];
