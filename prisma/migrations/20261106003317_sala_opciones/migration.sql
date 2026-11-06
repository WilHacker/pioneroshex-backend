-- AlterTable
ALTER TABLE "salas" ADD COLUMN     "opciones" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "publica" BOOLEAN NOT NULL DEFAULT false;
