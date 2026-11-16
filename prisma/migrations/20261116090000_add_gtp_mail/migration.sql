-- CreateTable
CREATE TABLE "GtpMail" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "sentTo" TEXT,
    "cc" TEXT,
    "byUser" TEXT,
    "messageId" TEXT,
    "fileName" TEXT,
    "pdf" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GtpMail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GtpMail_recordId_createdAt_idx" ON "GtpMail"("recordId", "createdAt");

-- AddForeignKey
ALTER TABLE "GtpMail" ADD CONSTRAINT "GtpMail_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "DocketRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
