/*
  Warnings:

  - You are about to drop the `asset_items` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `budget_items` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `debt_items` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `notification_items` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `other_liability_items` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `transaction_audits` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `transactions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_profiles` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `users` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `weekly_review_comments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `weekly_review_sharers` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `weekly_reviews` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "asset_items" DROP CONSTRAINT "asset_items_userId_fkey";

-- DropForeignKey
ALTER TABLE "budget_items" DROP CONSTRAINT "budget_items_userId_fkey";

-- DropForeignKey
ALTER TABLE "debt_items" DROP CONSTRAINT "debt_items_userId_fkey";

-- DropForeignKey
ALTER TABLE "notification_items" DROP CONSTRAINT "notification_items_userId_fkey";

-- DropForeignKey
ALTER TABLE "other_liability_items" DROP CONSTRAINT "other_liability_items_userId_fkey";

-- DropForeignKey
ALTER TABLE "transaction_audits" DROP CONSTRAINT "transaction_audits_performedBy_fkey";

-- DropForeignKey
ALTER TABLE "transaction_audits" DROP CONSTRAINT "transaction_audits_transactionId_fkey";

-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_userId_fkey";

-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_weeklyReviewCommentId_fkey";

-- DropForeignKey
ALTER TABLE "user_profiles" DROP CONSTRAINT "user_profiles_userId_fkey";

-- DropForeignKey
ALTER TABLE "weekly_review_comments" DROP CONSTRAINT "weekly_review_comments_weeklyReviewId_fkey";

-- DropForeignKey
ALTER TABLE "weekly_review_sharers" DROP CONSTRAINT "weekly_review_sharers_recipientId_fkey";

-- DropForeignKey
ALTER TABLE "weekly_review_sharers" DROP CONSTRAINT "weekly_review_sharers_sharerId_fkey";

-- DropForeignKey
ALTER TABLE "weekly_review_sharers" DROP CONSTRAINT "weekly_review_sharers_weeklyReviewId_fkey";

-- DropForeignKey
ALTER TABLE "weekly_reviews" DROP CONSTRAINT "weekly_reviews_ownerId_fkey";

-- DropTable
DROP TABLE "asset_items";

-- DropTable
DROP TABLE "budget_items";

-- DropTable
DROP TABLE "debt_items";

-- DropTable
DROP TABLE "notification_items";

-- DropTable
DROP TABLE "other_liability_items";

-- DropTable
DROP TABLE "transaction_audits";

-- DropTable
DROP TABLE "transactions";

-- DropTable
DROP TABLE "user_profiles";

-- DropTable
DROP TABLE "users";

-- DropTable
DROP TABLE "weekly_review_comments";

-- DropTable
DROP TABLE "weekly_review_sharers";

-- DropTable
DROP TABLE "weekly_reviews";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "modeOfPayment" TEXT NOT NULL,
    "frequency" TEXT,
    "variability" TEXT,
    "categoryName" TEXT,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Debt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "principal" DOUBLE PRECISION NOT NULL,
    "interestRate" DOUBLE PRECISION NOT NULL,
    "minPayment" DOUBLE PRECISION NOT NULL,
    "term" TEXT NOT NULL,

    CONSTRAINT "Debt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "purchasePrice" DOUBLE PRECISION NOT NULL,
    "currentValue" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "notes" TEXT,

    CONSTRAINT "InvestmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "AssetItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtherLiabilityItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "OtherLiabilityItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL,

    CONSTRAINT "BudgetItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyReview" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "journal" TEXT,
    "transactionComments" JSONB,

    CONSTRAINT "WeeklyReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedReview" (
    "id" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "reviewOwnerId" TEXT NOT NULL,
    "sharedWithId" TEXT NOT NULL,

    CONSTRAINT "SharedReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatementSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "statementStartDate" TIMESTAMP(3),
    "statementEndDate" TIMESTAMP(3),
    "gettingStartedDismissed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "StatementSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "link" TEXT,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_id_key" ON "User"("id");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Transaction_userId_date_idx" ON "Transaction"("userId", "date");

-- CreateIndex
CREATE INDEX "Debt_userId_idx" ON "Debt"("userId");

-- CreateIndex
CREATE INDEX "InvestmentItem_userId_idx" ON "InvestmentItem"("userId");

-- CreateIndex
CREATE INDEX "AssetItem_userId_idx" ON "AssetItem"("userId");

-- CreateIndex
CREATE INDEX "OtherLiabilityItem_userId_idx" ON "OtherLiabilityItem"("userId");

-- CreateIndex
CREATE INDEX "BudgetItem_userId_period_idx" ON "BudgetItem"("userId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetItem_userId_period_description_category_key" ON "BudgetItem"("userId", "period", "description", "category");

-- CreateIndex
CREATE INDEX "WeeklyReview_userId_idx" ON "WeeklyReview"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyReview_userId_weekKey_key" ON "WeeklyReview"("userId", "weekKey");

-- CreateIndex
CREATE INDEX "SharedReview_sharedWithId_idx" ON "SharedReview"("sharedWithId");

-- CreateIndex
CREATE INDEX "SharedReview_reviewOwnerId_weekKey_idx" ON "SharedReview"("reviewOwnerId", "weekKey");

-- CreateIndex
CREATE UNIQUE INDEX "SharedReview_reviewOwnerId_weekKey_sharedWithId_key" ON "SharedReview"("reviewOwnerId", "weekKey", "sharedWithId");

-- CreateIndex
CREATE UNIQUE INDEX "StatementSettings_userId_key" ON "StatementSettings"("userId");

-- CreateIndex
CREATE INDEX "Notification_userId_read_timestamp_idx" ON "Notification"("userId", "read", "timestamp");

-- CreateIndex
CREATE INDEX "TestEntry_userId_createdAt_idx" ON "TestEntry"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentItem" ADD CONSTRAINT "InvestmentItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetItem" ADD CONSTRAINT "AssetItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtherLiabilityItem" ADD CONSTRAINT "OtherLiabilityItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetItem" ADD CONSTRAINT "BudgetItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyReview" ADD CONSTRAINT "WeeklyReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedReview" ADD CONSTRAINT "SharedReview_reviewOwnerId_weekKey_fkey" FOREIGN KEY ("reviewOwnerId", "weekKey") REFERENCES "WeeklyReview"("userId", "weekKey") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedReview" ADD CONSTRAINT "SharedReview_reviewOwnerId_fkey" FOREIGN KEY ("reviewOwnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedReview" ADD CONSTRAINT "SharedReview_sharedWithId_fkey" FOREIGN KEY ("sharedWithId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementSettings" ADD CONSTRAINT "StatementSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestEntry" ADD CONSTRAINT "TestEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
