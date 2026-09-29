import { Prisma } from '@prisma/client';

export type PriceInput = {
  ingredients: { quantityUsed: string; purchasePrice: string; purchaseQuantity: string; yieldPercent: string; kind?: string }[];
  desiredMargin: string; packagingCost: string; overheadCost: string; cardFeePercent: string; lossPercent: string;
};

export function calculatePrice(input: PriceInput) {
  const D = (v: string | number) => new Prisma.Decimal(v);
  const components = input.ingredients.reduce((sum, row) => {
    const qty = D(row.purchaseQuantity), yieldRatio = D(row.yieldPercent).div(100);
    if (qty.lte(0) || yieldRatio.lte(0)) throw new Error('Quantidade comprada e rendimento precisam ser maiores que zero.');
    const cost = D(row.quantityUsed).mul(D(row.purchasePrice)).div(qty.mul(yieldRatio));
    return { total: sum.total.add(cost), meat: row.kind === 'MEAT' ? sum.meat.add(cost) : sum.meat, bacon: row.kind === 'BACON' ? sum.bacon.add(cost) : sum.bacon };
  }, { total: D(0), meat: D(0), bacon: D(0) });
  const rawIngredients = components.total;
  const lossCost = rawIngredients.mul(D(input.lossPercent)).div(100);
  const cost = rawIngredients.add(lossCost).add(D(input.packagingCost)).add(D(input.overheadCost));
  const fee = D(input.cardFeePercent).div(100), margin = D(input.desiredMargin).div(100);
  if (fee.lt(0) || fee.gte(1) || margin.lt(0) || margin.add(fee).gte(1)) throw new Error('A soma da margem e da taxa do cartão deve ser menor que 100%.');
  const minimumPrice = fee.eq(1) ? D(0) : cost.div(D(1).sub(fee));
  const suggestedPrice = cost.div(D(1).sub(margin).sub(fee));
  const cardFeeValue = suggestedPrice.mul(fee);
  const profit = suggestedPrice.sub(cost).sub(cardFeeValue);
  const round = (v: Prisma.Decimal) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
  return { ingredientsCost: round(rawIngredients), meatCost: round(components.meat), baconCost: round(components.bacon), lossCost: round(lossCost), totalCost: round(cost), minimumPrice: round(minimumPrice), suggestedPrice: round(suggestedPrice), cardFeeValue: round(cardFeeValue), estimatedProfit: round(profit), desiredMargin: round(margin.mul(100)) };
}
