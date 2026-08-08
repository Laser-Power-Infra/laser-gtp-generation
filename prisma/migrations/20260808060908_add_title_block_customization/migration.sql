-- AlterTable
ALTER TABLE "DocketRecord" ADD COLUMN     "titleBlockCustomRows" JSONB,
ADD COLUMN     "titleBlockMode" TEXT DEFAULT 'standard';
