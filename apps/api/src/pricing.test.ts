import { describe, expect, it } from 'vitest';

describe('cálculos monetários', () => {
  it('calcula subtotais em centavos inteiros sem erro de ponto flutuante', () => {
    const priceInCents = 1600;
    expect(priceInCents * 3).toBe(4800);
    expect((priceInCents * 3 + 600) / 100).toBe(54);
  });
});
