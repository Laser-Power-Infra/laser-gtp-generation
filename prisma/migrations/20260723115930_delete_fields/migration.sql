/*
  Warnings:

  - You are about to drop the column `docxGeneratedAt` on the `DocketRecord` table. All the data in the column will be lost.
  - You are about to drop the column `docxProgress` on the `DocketRecord` table. All the data in the column will be lost.
  - You are about to drop the column `excelFiles` on the `DocketRecord` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "DocketRecord" DROP COLUMN "docxGeneratedAt",
DROP COLUMN "docxProgress",
DROP COLUMN "excelFiles";
