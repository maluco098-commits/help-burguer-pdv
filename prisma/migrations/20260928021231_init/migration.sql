-- DropForeignKey
ALTER TABLE "CashRegister" DROP CONSTRAINT "CashRegister_closedById_fkey";

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
