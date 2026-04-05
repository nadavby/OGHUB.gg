-- CreateEnum
CREATE TYPE "RoomFormat" AS ENUM ('ONE_V_ONE', 'BEST_OF_3', 'FFA_5', 'FFA_10', 'FFA_20');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('WAITING', 'READY', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "format" "RoomFormat" NOT NULL,
    "entryFee" DECIMAL(12,2) NOT NULL,
    "prizePool" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "platformFee" DECIMAL(4,2) NOT NULL DEFAULT 0.05,
    "maxPlayers" INTEGER NOT NULL,
    "currentRound" INTEGER NOT NULL DEFAULT 0,
    "totalRounds" INTEGER NOT NULL DEFAULT 1,
    "status" "RoomStatus" NOT NULL DEFAULT 'WAITING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "readyAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomParticipant" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionId" TEXT,

    CONSTRAINT "RoomParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Room_gameId_status_idx" ON "Room"("gameId", "status");

-- CreateIndex
CREATE INDEX "Room_status_expiresAt_idx" ON "Room"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Room_createdByUserId_idx" ON "Room"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomParticipant_roomId_userId_key" ON "RoomParticipant"("roomId", "userId");

-- CreateIndex
CREATE INDEX "RoomParticipant_userId_idx" ON "RoomParticipant"("userId");

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomParticipant" ADD CONSTRAINT "RoomParticipant_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomParticipant" ADD CONSTRAINT "RoomParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
