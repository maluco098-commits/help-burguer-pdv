-- CreateTable
CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'OTHER',
    "purchaseUnit" TEXT NOT NULL,
    "purchaseQuantity" DECIMAL(12,3) NOT NULL,
    "purchasePrice" DECIMAL(10,2) NOT NULL,
    "yieldPercent" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "supplier" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pricing" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "desiredMargin" DECIMAL(5,2) NOT NULL DEFAULT 60,
    "packagingCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "overheadCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cardFeePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "lossPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingIngredient" (
    "id" TEXT NOT NULL,
    "pricingId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantityUsed" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "PricingIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ingredient_active_kind_idx" ON "Ingredient"("active", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Pricing_productId_key" ON "Pricing"("productId");

-- CreateIndex
CREATE INDEX "PricingIngredient_ingredientId_idx" ON "PricingIngredient"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "PricingIngredient_pricingId_ingredientId_key" ON "PricingIngredient"("pricingId", "ingredientId");

-- AddForeignKey
ALTER TABLE "Pricing" ADD CONSTRAINT "Pricing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingIngredient" ADD CONSTRAINT "PricingIngredient_pricingId_fkey" FOREIGN KEY ("pricingId") REFERENCES "Pricing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingIngredient" ADD CONSTRAINT "PricingIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
