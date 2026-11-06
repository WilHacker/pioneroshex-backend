-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombreNorm" TEXT NOT NULL,
    "hashContrasena" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesiones" (
    "tokenHash" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sesiones_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "codigos_recuperacion" (
    "usuarioId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "usadoEn" TIMESTAMP(3),

    CONSTRAINT "codigos_recuperacion_pkey" PRIMARY KEY ("usuarioId","hash")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_nombreNorm_key" ON "usuarios"("nombreNorm");

-- CreateIndex
CREATE INDEX "sesiones_usuarioId_idx" ON "sesiones"("usuarioId");

-- AddForeignKey
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codigos_recuperacion" ADD CONSTRAINT "codigos_recuperacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
