-- CreateTable
CREATE TABLE "partidas" (
    "id" TEXT NOT NULL,
    "terminadaEn" TIMESTAMP(3) NOT NULL,
    "puntosVictoria" INTEGER NOT NULL,
    "jugadores" INTEGER NOT NULL,
    "ganador" TEXT NOT NULL,

    CONSTRAINT "partidas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participaciones" (
    "partidaId" TEXT NOT NULL,
    "posicion" INTEGER NOT NULL,
    "usuarioId" TEXT,
    "nombre" TEXT NOT NULL,
    "puntos" INTEGER NOT NULL,
    "gano" BOOLEAN NOT NULL,

    CONSTRAINT "participaciones_pkey" PRIMARY KEY ("partidaId","posicion")
);

-- CreateIndex
CREATE INDEX "participaciones_usuarioId_idx" ON "participaciones"("usuarioId");

-- AddForeignKey
ALTER TABLE "participaciones" ADD CONSTRAINT "participaciones_partidaId_fkey" FOREIGN KEY ("partidaId") REFERENCES "partidas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participaciones" ADD CONSTRAINT "participaciones_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
