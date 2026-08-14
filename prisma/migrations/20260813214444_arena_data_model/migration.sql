-- CreateEnum
CREATE TYPE "AnswerStatus" AS ENUM ('STREAMING', 'COMPLETE', 'FAILED');

-- CreateTable
CREATE TABLE "Thread" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Turn" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Turn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "status" "AnswerStatus" NOT NULL DEFAULT 'STREAMING',
    "text" TEXT NOT NULL DEFAULT '',
    "failureReason" TEXT,
    "timeToFirstTokenMs" INTEGER,
    "tokensPerSecond" DOUBLE PRECISION,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "durationMs" INTEGER,
    "costUsd" DECIMAL(12,8),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "threadId" TEXT NOT NULL,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Thread_clerkUserId_createdAt_idx" ON "Thread"("clerkUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Turn_threadId_index_key" ON "Turn"("threadId", "index");

-- CreateIndex
CREATE INDEX "Answer_modelId_idx" ON "Answer"("modelId");

-- CreateIndex
CREATE UNIQUE INDEX "Answer_turnId_modelId_key" ON "Answer"("turnId", "modelId");

-- CreateIndex
CREATE UNIQUE INDEX "Answer_id_turnId_key" ON "Answer"("id", "turnId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_turnId_key" ON "Vote"("turnId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_answerId_key" ON "Vote"("answerId");

-- CreateIndex
CREATE INDEX "Vote_clerkUserId_idx" ON "Vote"("clerkUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_answerId_turnId_key" ON "Vote"("answerId", "turnId");

-- AddForeignKey
ALTER TABLE "Turn" ADD CONSTRAINT "Turn_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "Turn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "Turn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_answerId_turnId_fkey" FOREIGN KEY ("answerId", "turnId") REFERENCES "Answer"("id", "turnId") ON DELETE CASCADE ON UPDATE CASCADE;
