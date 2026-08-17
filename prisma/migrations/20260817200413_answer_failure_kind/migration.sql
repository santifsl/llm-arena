-- CreateEnum
CREATE TYPE "AnswerFailure" AS ENUM ('PROVIDER', 'QUOTA');

-- AlterTable
ALTER TABLE "Answer" ADD COLUMN     "failureKind" "AnswerFailure";
