-- CreateTable
CREATE TABLE "salas" (
    "id" TEXT NOT NULL,
    "anfitrion" TEXT NOT NULL,
    "jugadores" JSONB NOT NULL,
    "partidaId" TEXT,
    "estado" JSONB,
    "actualizadaEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salas_pkey" PRIMARY KEY ("id")
);
