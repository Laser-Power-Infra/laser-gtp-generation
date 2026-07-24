-- CreateTable
CREATE TABLE "DocketRecord" (
    "id" TEXT NOT NULL,
    "docketNumber" TEXT NOT NULL,
    "utility" TEXT NOT NULL,
    "partyName" TEXT NOT NULL,
    "projectRefNo" TEXT NOT NULL,
    "enquiryTenderNo" TEXT NOT NULL,
    "excelFiles" TEXT[],
    "docxGeneratedAt" TIMESTAMP(3),
    "docxProgress" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocketRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocketRecord_utility_idx" ON "DocketRecord"("utility");

-- CreateIndex
CREATE INDEX "DocketRecord_partyName_idx" ON "DocketRecord"("partyName");

-- CreateIndex
CREATE INDEX "DocketRecord_docketNumber_idx" ON "DocketRecord"("docketNumber");
