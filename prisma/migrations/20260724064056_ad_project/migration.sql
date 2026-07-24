/*
  Warnings:

  - You are about to drop the column `Contractor` on the `DocketRecord` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "DocketRecord" DROP COLUMN "Contractor",
ADD COLUMN     "Project" TEXT;
