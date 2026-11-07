import { Controller, Get } from '@nestjs/common';
import { infoDelCatalogo, type InfoDeMapaConForma } from '../../core/catalogo/catalogo.js';

/** El catálogo de mapas con su forma y sus rangos de jugadores, para el selector de la sala. */
@Controller('mapas')
export class MapasController {
  @Get()
  listar(): readonly InfoDeMapaConForma[] {
    return infoDelCatalogo();
  }
}
