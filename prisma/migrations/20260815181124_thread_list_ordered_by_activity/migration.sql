-- DropIndex
DROP INDEX "Thread_clerkUserId_createdAt_idx";

-- CreateIndex
CREATE INDEX "Thread_clerkUserId_updatedAt_idx" ON "Thread"("clerkUserId", "updatedAt");
