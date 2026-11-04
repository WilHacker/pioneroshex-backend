import { defineConfig } from 'prisma/config';

// Prisma 7 ya no carga .env por su cuenta. Se usa el loader nativo de Node
// (no pisa variables ya definidas, así que en CI y Docker mandan las del entorno).
try {
  process.loadEnvFile();
} catch {
  // Sin archivo .env: se usan las variables del entorno.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL },
});
