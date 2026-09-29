-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "changeFor" DECIMAL(10,2),
ADD COLUMN     "needsChange" BOOLEAN NOT NULL DEFAULT false;
