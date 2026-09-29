import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient, Prisma } from '@prisma/client';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { calculatePrice } from './pricing';

export const prisma = new PrismaClient();
const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' }));
type RawBodyRequest = express.Request & { rawBody?: Buffer };
app.use(express.json({ limit: '8mb', verify: (req, _res, buffer) => { (req as RawBodyRequest).rawBody = Buffer.from(buffer); } }));
const uploadDir = path.join(process.cwd(), 'uploads');
app.use('/uploads', express.static(uploadDir));
const secret = () => process.env.JWT_SECRET ?? 'development-only-change-this-secret';
type AuthRequest = express.Request & { user?: { id: string; role: string } };
const auth: express.RequestHandler = (req, res, next) => {
  const token = req.headers.authorization?.replace(/^Bearer /i, '');
  if (!token) { res.status(401).json({ error: 'Entre na sua conta para continuar.' }); return; }
  try { (req as AuthRequest).user = jwt.verify(token, secret()) as { id: string; role: string }; next(); }
  catch { res.status(401).json({ error: 'Sessão expirada. Entre novamente.' }); }
};
const asyncRoute = (fn: (req: AuthRequest, res: express.Response) => Promise<unknown>): express.RequestHandler =>
  (req, res, next) => Promise.resolve(fn(req as AuthRequest, res)).catch(next);

function getWeekBounds(value: unknown) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const dateText = typeof value === 'string' && value.length > 0 ? value : today;
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  if (!parts) return null;
  const [, yearText, monthText, dayText] = parts;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const dayUtc = new Date(Date.UTC(year, month - 1, day));
  if (dayUtc.getUTCFullYear() !== year || dayUtc.getUTCMonth() !== month - 1 || dayUtc.getUTCDate() !== day) return null;
  const offsetToMonday = (dayUtc.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(year, month - 1, day - offsetToMonday, 3));
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { start, end, startDate: start.toISOString().slice(0, 10), endDate: new Date(end.getTime() - 86400000).toISOString().slice(0, 10) };
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'Help Burguer API' }));
app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const input = z.object({ username: z.string().min(1), password: z.string().min(1) }).safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: 'Informe usuário e senha.' }); return; }
  const user = await prisma.user.findUnique({ where: { username: input.data.username } });
  if (!user || !user.active || !(await bcrypt.compare(input.data.password, user.passwordHash))) { res.status(401).json({ error: 'Usuário ou senha inválidos.' }); return; }
  const token = jwt.sign({ id: user.id, role: user.role }, secret(), { expiresIn: '12h' });
  res.json({ token, user: { id: user.id, username: user.username, name: user.name, role: user.role } });
}));
app.get('/api/auth/me', auth, asyncRoute(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { id: true, username: true, name: true, role: true } });
  if (!user) { res.status(401).json({ error: 'Usuário não encontrado.' }); return; }
  res.json(user);
}));
app.get('/api/products', auth, asyncRoute(async (_req, res) => res.json(await prisma.product.findMany({ where: { active: true }, include: { category: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }))));
app.get('/api/categories', auth, asyncRoute(async (_req, res) => res.json(await prisma.category.findMany({ orderBy: { sortOrder: 'asc' } }))));
app.get('/api/manage/products', auth, asyncRoute(async (req, res) => {
  if (req.user!.role !== 'ADMIN') { res.status(403).json({ error: 'Somente um administrador pode gerenciar o cardápio.' }); return; }
  res.json(await prisma.product.findMany({ include: { category: true }, orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }] }));
}));
const pricingAdmin: express.RequestHandler = (req, res, next) => { if ((req as AuthRequest).user?.role !== 'ADMIN') { res.status(403).json({ error: 'Somente um administrador pode alterar a precificação.' }); return; } next(); };
const decimalText = z.string().trim().regex(/^\d+(?:[.,]\d{1,3})?$/, 'Informe um número válido.').transform(value => value.replace(',', '.'));
const moneyText = z.string().trim().regex(/^\d+(?:[.,]\d{1,2})?$/, 'Informe um valor com até duas casas decimais.').transform(value => value.replace(',', '.'));
const percentText = z.string().trim().regex(/^\d+(?:[.,]\d{1,2})?$/, 'Informe um percentual válido.').transform(value => value.replace(',', '.'));
const ingredientFields = z.object({ name: z.string().trim().min(1).max(100), kind: z.enum(['MEAT','BACON','OTHER']), purchaseUnit: z.string().trim().min(1).max(20), purchaseQuantity: decimalText, purchasePrice: moneyText, yieldPercent: percentText, supplier: z.string().trim().max(100).nullable().optional(), active: z.boolean().optional() });
app.get('/api/pricing/ingredients', auth, pricingAdmin, asyncRoute(async (_req, res) => {
  const rows = await prisma.ingredient.findMany({ orderBy: [{ active: 'desc' }, { kind: 'asc' }, { name: 'asc' }] });
  res.json(rows.map(i => ({ ...i, unitCost: new Prisma.Decimal(i.purchasePrice).div(new Prisma.Decimal(i.purchaseQuantity).mul(new Prisma.Decimal(i.yieldPercent).div(100))).toDecimalPlaces(4).toString() })));
}));
app.post('/api/pricing/ingredients', auth, pricingAdmin, asyncRoute(async (req, res) => {
  const parsed = ingredientFields.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Confira os dados do insumo.' }); return; }
  const d = parsed.data;
  if (Number(d.purchaseQuantity) <= 0 || Number(d.yieldPercent) <= 0 || Number(d.yieldPercent) > 100) { res.status(400).json({ error: 'Quantidade deve ser positiva e rendimento entre 0 e 100%.' }); return; }
  res.status(201).json(await prisma.ingredient.create({ data: { ...d, purchaseQuantity: new Prisma.Decimal(d.purchaseQuantity), purchasePrice: new Prisma.Decimal(d.purchasePrice), yieldPercent: new Prisma.Decimal(d.yieldPercent), supplier: d.supplier || null } }));
}));
app.patch('/api/pricing/ingredients/:id', auth, pricingAdmin, asyncRoute(async (req, res) => {
  const parsed = ingredientFields.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Confira os dados do insumo.' }); return; }
  const d = parsed.data;
  if ((d.purchaseQuantity !== undefined && Number(d.purchaseQuantity) <= 0) || (d.yieldPercent !== undefined && (Number(d.yieldPercent) <= 0 || Number(d.yieldPercent) > 100))) { res.status(400).json({ error: 'Quantidade deve ser positiva e rendimento entre 0 e 100%.' }); return; }
  res.json(await prisma.ingredient.update({ where: { id: String(req.params.id) }, data: { ...d, ...(d.purchaseQuantity !== undefined ? { purchaseQuantity: new Prisma.Decimal(d.purchaseQuantity) } : {}), ...(d.purchasePrice !== undefined ? { purchasePrice: new Prisma.Decimal(d.purchasePrice) } : {}), ...(d.yieldPercent !== undefined ? { yieldPercent: new Prisma.Decimal(d.yieldPercent) } : {}) } }));
}));
app.delete('/api/pricing/ingredients/:id', auth, pricingAdmin, asyncRoute(async (req, res) => {
  const id = String(req.params.id);
  const ingredient = await prisma.ingredient.findUnique({ where: { id }, include: { _count: { select: { pricingIngredients: true } } } });
  if (!ingredient) { res.status(404).json({ error: 'Insumo não encontrado.' }); return; }
  if (ingredient._count.pricingIngredients > 0) {
    await prisma.ingredient.update({ where: { id }, data: { active: false } });
    res.json({ deleted: false, deactivated: true, message: 'Insumo usado em fichas técnicas. Foi desativado para preservar os cálculos salvos.' });
    return;
  }
  await prisma.ingredient.delete({ where: { id } });
  res.json({ deleted: true, deactivated: false, message: 'Insumo excluído.' });
}));
const recipeInput = z.object({ desiredMargin: percentText, packagingCost: moneyText, overheadCost: moneyText, cardFeePercent: percentText, lossPercent: percentText, ingredients: z.array(z.object({ ingredientId: z.string(), quantityUsed: decimalText })) });
async function quoteProduct(productId: string, data: z.infer<typeof recipeInput>) {
  const product = await prisma.product.findUnique({ where: { id: productId }, include: { pricing: { include: { pricingIngredients: true } } } });
  if (!product) throw new Error('Produto não encontrado.');
  const ingredients = await prisma.ingredient.findMany({ where: { id: { in: data.ingredients.map(i => i.ingredientId) }, active: true } });
  if (ingredients.length !== new Set(data.ingredients.map(i => i.ingredientId)).size) throw new Error('Confira se todos os insumos existem e estão ativos.');
  if ([data.desiredMargin, data.cardFeePercent, data.lossPercent].some(v => Number(v) > 100)) throw new Error('Percentuais devem estar entre 0 e 100.');
  const quote = calculatePrice({ ...data, ingredients: data.ingredients.map(row => { const ingredient = ingredients.find(i => i.id === row.ingredientId)!; return { ...row, purchasePrice: ingredient.purchasePrice.toString(), purchaseQuantity: ingredient.purchaseQuantity.toString(), yieldPercent: ingredient.yieldPercent.toString(), kind: ingredient.kind }; }) });
  return { product: { id: product.id, name: product.name, currentPrice: product.price.toString() }, ...quote, recipeSaved: Boolean(product.pricing) };
}
app.get('/api/pricing/products', auth, pricingAdmin, asyncRoute(async (_req, res) => res.json(await prisma.product.findMany({ where: { active: true }, include: { category: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }))));
app.get('/api/pricing/:productId', auth, pricingAdmin, asyncRoute(async (req, res) => {
  const pricing = await prisma.pricing.findUnique({ where: { productId: String(req.params.productId) }, include: { pricingIngredients: { include: { ingredient: true } } } });
  res.json(pricing);
}));
app.post('/api/pricing/:productId/quote', auth, pricingAdmin, asyncRoute(async (req, res) => {
  const parsed = recipeInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Confira a ficha técnica.' }); return; }
  try { res.json(await quoteProduct(String(req.params.productId), parsed.data)); } catch (error) { res.status(400).json({ error: (error as Error).message }); }
}));
app.put('/api/pricing/:productId', auth, pricingAdmin, asyncRoute(async (req, res) => {
  const parsed = recipeInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Confira a ficha técnica.' }); return; }
  try {
    await quoteProduct(String(req.params.productId), parsed.data);
    await prisma.$transaction(async tx => {
      const pricing = await tx.pricing.upsert({ where: { productId: String(req.params.productId) }, create: { productId: String(req.params.productId), desiredMargin: new Prisma.Decimal(parsed.data.desiredMargin), packagingCost: new Prisma.Decimal(parsed.data.packagingCost), overheadCost: new Prisma.Decimal(parsed.data.overheadCost), cardFeePercent: new Prisma.Decimal(parsed.data.cardFeePercent), lossPercent: new Prisma.Decimal(parsed.data.lossPercent) }, update: { desiredMargin: new Prisma.Decimal(parsed.data.desiredMargin), packagingCost: new Prisma.Decimal(parsed.data.packagingCost), overheadCost: new Prisma.Decimal(parsed.data.overheadCost), cardFeePercent: new Prisma.Decimal(parsed.data.cardFeePercent), lossPercent: new Prisma.Decimal(parsed.data.lossPercent) } });
      await tx.pricingIngredient.deleteMany({ where: { pricingId: pricing.id } });
      if (parsed.data.ingredients.length) await tx.pricingIngredient.createMany({ data: parsed.data.ingredients.map(i => ({ pricingId: pricing.id, ingredientId: i.ingredientId, quantityUsed: new Prisma.Decimal(i.quantityUsed) })) });
    });
    res.json({ saved: true });
  } catch (error) { res.status(400).json({ error: (error as Error).message }); }
}));
app.post('/api/pricing/:productId/apply', auth, pricingAdmin, asyncRoute(async (req, res) => {
  const pricing = await prisma.pricing.findUnique({ where: { productId: String(req.params.productId) }, include: { pricingIngredients: { include: { ingredient: true } } } });
  if (!pricing) { res.status(409).json({ error: 'Salve primeiro a ficha técnica do produto.' }); return; }
  try {
    const quote = calculatePrice({ desiredMargin: pricing.desiredMargin.toString(), packagingCost: pricing.packagingCost.toString(), overheadCost: pricing.overheadCost.toString(), cardFeePercent: pricing.cardFeePercent.toString(), lossPercent: pricing.lossPercent.toString(), ingredients: pricing.pricingIngredients.map(row => ({ quantityUsed: row.quantityUsed.toString(), purchasePrice: row.ingredient.purchasePrice.toString(), purchaseQuantity: row.ingredient.purchaseQuantity.toString(), yieldPercent: row.ingredient.yieldPercent.toString(), kind: row.ingredient.kind })) });
    const product = await prisma.product.update({ where: { id: String(req.params.productId) }, data: { price: new Prisma.Decimal(quote.suggestedPrice) } });
    res.json({ price: product.price.toString(), ...quote });
  } catch (error) { res.status(400).json({ error: (error as Error).message }); }
}));
app.post('/api/categories', auth, asyncRoute(async (req, res) => {
  if (req.user!.role !== 'ADMIN') { res.status(403).json({ error: 'Somente um administrador pode gerenciar categorias.' }); return; }
  const parsed = z.object({ name: z.string().trim().min(2).max(50) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Informe um nome de categoria com pelo menos 2 caracteres.' }); return; }
  res.status(201).json(await prisma.category.create({ data: { name: parsed.data.name } }));
}));
const productInput = z.object({ name: z.string().trim().min(1).max(100), description: z.string().trim().max(500).default(''), price: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Use um preço válido com até duas casas decimais.'), categoryId: z.string().min(1), sortOrder: z.number().int().optional(), imageData: z.string().optional(), removeImage: z.boolean().optional() });
async function saveProductImage(dataUrl: string): Promise<string> {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw new Error('Envie uma imagem PNG, JPG ou WebP válida.');
  const [, mime, encoded] = match;
  const image = Buffer.from(encoded, 'base64');
  if (image.length > 5 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 5 MB.');
  const validSignature = mime === 'png' ? image.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
    : mime === 'jpeg' ? image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff
      : image.subarray(0, 4).toString() === 'RIFF' && image.subarray(8, 12).toString() === 'WEBP';
  if (!validSignature) throw new Error('O conteúdo do arquivo não corresponde a uma imagem suportada.');
  const extension = mime === 'jpeg' ? 'jpg' : mime;
  const filename = `${randomUUID()}.${extension}`;
  await mkdir(path.join(uploadDir, 'products'), { recursive: true });
  await writeFile(path.join(uploadDir, 'products', filename), image, { flag: 'wx' });
  return `/uploads/products/${filename}`;
}
app.post('/api/manage/products', auth, asyncRoute(async (req, res) => {
  if (req.user!.role !== 'ADMIN') { res.status(403).json({ error: 'Somente um administrador pode cadastrar produtos.' }); return; }
  const parsed = productInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Confira os dados do produto.' }); return; }
  const { price, imageData, removeImage: _removeImage, ...fields } = parsed.data;
  let imageUrl: string | null = null;
  try { if (imageData) imageUrl = await saveProductImage(imageData); }
  catch (error) { res.status(400).json({ error: (error as Error).message }); return; }
  res.status(201).json(await prisma.product.create({ data: { ...fields, price: new Prisma.Decimal(price), imageUrl }, include: { category: true } }));
}));
app.patch('/api/manage/products/:id', auth, asyncRoute(async (req, res) => {
  if (req.user!.role !== 'ADMIN') { res.status(403).json({ error: 'Somente um administrador pode alterar produtos.' }); return; }
  const parsed = productInput.partial().extend({ active: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Confira os dados do produto.' }); return; }
  const { price, imageData, removeImage, ...fields } = parsed.data;
  let imageUrl: string | null | undefined;
  try { if (imageData) imageUrl = await saveProductImage(imageData); }
  catch (error) { res.status(400).json({ error: (error as Error).message }); return; }
  if (removeImage) imageUrl = null;
  res.json(await prisma.product.update({ where: { id: String(req.params.id) }, data: { ...fields, ...(price !== undefined ? { price: new Prisma.Decimal(price) } : {}), ...(imageUrl !== undefined ? { imageUrl } : {}) }, include: { category: true } }));
}));
app.delete('/api/manage/products/:id', auth, asyncRoute(async (req, res) => {
  if (req.user!.role !== 'ADMIN') { res.status(403).json({ error: 'Somente um administrador pode desativar produtos.' }); return; }
  res.json(await prisma.product.update({ where: { id: String(req.params.id) }, data: { active: false }, include: { category: true } }));
}));
app.get('/api/orders', auth, asyncRoute(async (req, res) => {
  const localParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const requested = req.query.date;
  const date = typeof requested === 'string' ? requested : localParts;
  const start = new Date(`${date}T00:00:00.000-03:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== date) { res.status(400).json({ error: 'Informe uma data válida.' }); return; }
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const [orders, cashSessions] = await Promise.all([
    prisma.order.findMany({ where: { createdAt: { gte: start, lt: end } }, orderBy: { createdAt: 'desc' }, include: { items: true } }),
    prisma.cashRegister.findMany({ where: { openedAt: { lt: end }, OR: [{ closedAt: null }, { closedAt: { gte: start } }] }, orderBy: { openedAt: 'asc' } }),
  ]);
  res.json({ date, orders, cashSessions });
}));
app.get('/api/cash/balance', auth, asyncRoute(async (req, res) => {
  const range = getWeekBounds(req.query.week);
  if (!range) { res.status(400).json({ error: 'Informe uma data válida para consultar a semana.' }); return; }
  const { start, end } = range;
  const [orders, expenses, cashSessions] = await Promise.all([
    prisma.order.findMany({ where: { createdAt: { gte: start, lt: end } }, orderBy: { createdAt: 'asc' }, select: { id: true, createdAt: true, total: true, status: true, paymentMethod: true } }),
    prisma.expense.findMany({ where: { spentAt: { gte: start, lt: end } }, orderBy: { spentAt: 'desc' }, include: { user: { select: { name: true } } } }),
    prisma.cashRegister.findMany({ where: { openedAt: { lt: end }, OR: [{ closedAt: null }, { closedAt: { gte: start } }] }, orderBy: { openedAt: 'asc' } }),
  ]);
  const openCash = cashSessions.find(session => session.status === 'OPEN');
  const openCashWeekStart = openCash ? getWeekBounds(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(openCash.openedAt))?.startDate ?? null : null;
  const [openCashSales, openCashExpenses] = openCash ? await Promise.all([
    prisma.order.aggregate({ where: { cashRegisterId: openCash.id, paymentMethod: 'CASH', status: { not: 'CANCELLED' } }, _sum: { total: true } }),
    prisma.expense.aggregate({ where: { cashRegisterId: openCash.id, paymentMethod: 'CASH' }, _sum: { amount: true } }),
  ]) : [null, null];
  const validOrders = orders.filter(order => order.status !== 'CANCELLED');
  const salesTotal = validOrders.reduce((sum, order) => sum.add(order.total), new Prisma.Decimal(0));
  const expensesTotal = expenses.reduce((sum, expense) => sum.add(expense.amount), new Prisma.Decimal(0));
  const cashSales = validOrders.filter(order => order.paymentMethod === 'CASH').reduce((sum, order) => sum.add(order.total), new Prisma.Decimal(0));
  const cashExpenses = expenses.filter(expense => expense.paymentMethod === 'CASH').reduce((sum, expense) => sum.add(expense.amount), new Prisma.Decimal(0));
  const byPayment = validOrders.reduce<Record<string, Prisma.Decimal>>((totals, order) => {
    totals[order.paymentMethod] = (totals[order.paymentMethod] ?? new Prisma.Decimal(0)).add(order.total);
    return totals;
  }, {});
  const byDay = validOrders.reduce<Record<string, { count: number; total: Prisma.Decimal }>>((days, order) => {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(order.createdAt);
    days[day] ??= { count: 0, total: new Prisma.Decimal(0) };
    days[day].count += 1;
    days[day].total = days[day].total.add(order.total);
    return days;
  }, {});
  res.json({
    weekStart: range.startDate,
    weekEnd: range.endDate,
    orderCount: orders.length,
    cancelledCount: orders.length - validOrders.length,
    salesTotal,
    expensesTotal,
    result: salesTotal.sub(expensesTotal),
    cashSales,
    cashExpenses,
    expectedCash: openCash ? openCash.openingAmount.add(openCashSales?._sum.total ?? 0).sub(openCashExpenses?._sum.amount ?? 0) : null,
    openCashWeekStart,
    paymentTotals: Object.fromEntries(Object.entries(byPayment).map(([key, amount]) => [key, amount])),
    dailyTotals: Object.entries(byDay).map(([date, day]) => ({ date, count: day.count, total: day.total })),
    expenses,
    cashSessions,
  });
}));
app.get('/api/cash/current', auth, asyncRoute(async (_req, res) => res.json(await prisma.cashRegister.findFirst({ where: { status: 'OPEN' }, orderBy: { openedAt: 'desc' } }))));
app.post('/api/expenses', auth, asyncRoute(async (req, res) => {
  const parsed = z.object({ description: z.string().trim().min(2).max(200), category: z.string().trim().min(2).max(50), amount: z.string().regex(/^\d+(\.\d{1,2})?$/), paymentMethod: z.enum(['CASH','PIX','CARD']), spentAt: z.string().datetime({ offset: true }).optional() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Confira os dados da despesa.' }); return; }
  const cash = await prisma.cashRegister.findFirst({ where: { status: 'OPEN' } });
  if (!cash) { res.status(409).json({ error: 'Abra o caixa semanal antes de registrar gastos.' }); return; }
  const { amount, spentAt, ...fields } = parsed.data;
  const expenseDate = spentAt ? new Date(spentAt) : new Date();
  const expenseWeek = getWeekBounds(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(expenseDate));
  const cashWeek = getWeekBounds(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(cash.openedAt));
  if (!expenseWeek || !cashWeek || expenseWeek.start.getTime() !== cashWeek.start.getTime()) { res.status(400).json({ error: 'A despesa precisa pertencer à semana do caixa aberto.' }); return; }
  res.status(201).json(await prisma.expense.create({ data: { ...fields, amount: new Prisma.Decimal(amount), spentAt: expenseDate, userId: req.user!.id, cashRegisterId: cash.id }, include: { user: { select: { name: true } } } }));
}));
app.post('/api/cash/open', auth, asyncRoute(async (req, res) => {
  const parsed = z.object({ openingAmount: z.string().regex(/^\d+(\.\d{1,2})?$/) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Informe um valor inicial válido.' }); return; }
  if (await prisma.cashRegister.findFirst({ where: { status: 'OPEN' } })) { res.status(409).json({ error: 'Já existe um caixa aberto.' }); return; }
  res.status(201).json(await prisma.cashRegister.create({ data: { openingAmount: new Prisma.Decimal(parsed.data.openingAmount), openedById: req.user!.id } }));
}));
app.post('/api/cash/close', auth, asyncRoute(async (req, res) => {
  const parsed = z.object({ closingAmount: z.string().regex(/^\d+(\.\d{1,2})?$/) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Informe o valor contado.' }); return; }
  const cash = await prisma.cashRegister.findFirst({ where: { status: 'OPEN' } });
  if (!cash) { res.status(409).json({ error: 'Não há caixa aberto.' }); return; }
  const [cashSales, cashExpenses] = await Promise.all([
    prisma.order.aggregate({ where: { cashRegisterId: cash.id, paymentMethod: 'CASH', status: { not: 'CANCELLED' } }, _sum: { total: true } }),
    prisma.expense.aggregate({ where: { cashRegisterId: cash.id, paymentMethod: 'CASH' }, _sum: { amount: true } }),
  ]);
  const expected = cash.openingAmount.add(cashSales._sum.total ?? 0).sub(cashExpenses._sum.amount ?? 0);
  res.json(await prisma.cashRegister.update({ where: { id: cash.id }, data: { status: 'CLOSED', closingAmount: new Prisma.Decimal(parsed.data.closingAmount), expectedClosingAmount: expected, closedAt: new Date(), closedById: req.user!.id } }));
}));
app.post('/api/orders', auth, asyncRoute(async (req, res) => {
  const parsed = z.object({ customerName: z.string().trim().min(1), channel: z.enum(['COUNTER','DELIVERY','TABLE']), paymentMethod: z.enum(['CASH','PIX','CARD']), notes: z.string().max(500).optional(), items: z.array(z.object({ productId: z.string(), quantity: z.number().int().min(1).max(50) })).min(1), address: z.string().trim().max(300).optional(), deliveryFee: z.string().regex(/^\d+(\.\d{1,2})?$/).default('3'), needsChange: z.boolean().default(false), changeFor: z.string().regex(/^\d+(\.\d{1,2})?$/).optional() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Confira os dados e os itens do pedido.' }); return; }
  if (parsed.data.channel === 'DELIVERY' && !parsed.data.address) { res.status(400).json({ error: 'Informe o endereço do pedido para entrega.' }); return; }
  if (parsed.data.needsChange && (!parsed.data.changeFor || parsed.data.paymentMethod !== 'CASH')) { res.status(400).json({ error: 'Troco só pode ser solicitado em pedidos pagos em dinheiro. Informe o valor.' }); return; }
  const cash = await prisma.cashRegister.findFirst({ where: { status: 'OPEN' } });
  if (!cash) { res.status(409).json({ error: 'Abra o caixa antes de finalizar uma venda.' }); return; }
  const products = await prisma.product.findMany({ where: { id: { in: parsed.data.items.map(i => i.productId) }, active: true } });
  if (products.length !== new Set(parsed.data.items.map(i => i.productId)).size) { res.status(400).json({ error: 'Um ou mais produtos não estão disponíveis.' }); return; }
  const lines = parsed.data.items.map(i => { const p = products.find(p => p.id === i.productId)!; const price = new Prisma.Decimal(p.price.toString()); return { productId: p.id, name: p.name, quantity: i.quantity, unitPrice: price, subtotal: price.mul(i.quantity) }; });
  const itemsSubtotal = lines.reduce((sum, i) => sum.add(i.subtotal), new Prisma.Decimal(0));
  const deliveryFee = parsed.data.channel === 'DELIVERY' ? new Prisma.Decimal(parsed.data.deliveryFee) : new Prisma.Decimal(0);
  const total = itemsSubtotal.add(deliveryFee);
  if (parsed.data.needsChange && new Prisma.Decimal(parsed.data.changeFor!).lte(total)) { res.status(400).json({ error: 'O valor informado para troco precisa ser maior que o total do pedido.' }); return; }
  const order = await prisma.order.create({ data: { number: `HB-${Date.now().toString().slice(-8)}`, customerName: parsed.data.customerName, channel: parsed.data.channel, paymentMethod: parsed.data.paymentMethod, notes: parsed.data.notes, address: parsed.data.address, needsChange: parsed.data.needsChange, changeFor: parsed.data.needsChange ? new Prisma.Decimal(parsed.data.changeFor!) : null, subtotal: itemsSubtotal, deliveryFee, total, createdById: req.user!.id, cashRegisterId: cash.id, items: { create: lines } }, include: { items: true } });
  res.status(201).json(order);
}));
const whatsAppConfigured = () => process.env.WHATSAPP_PROVIDER === 'cloud_api'
  && Boolean(process.env.WHATSAPP_API_URL && process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID
    && process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && process.env.WHATSAPP_APP_SECRET);
app.get('/api/whatsapp/status', auth, (_req, res) => res.json({
  configured: whatsAppConfigured(),
  provider: process.env.WHATSAPP_PROVIDER === 'cloud_api' ? 'WhatsApp Cloud API' : null,
  webhookPath: '/api/whatsapp/webhook',
}));
app.get('/api/whatsapp/conversations', auth, asyncRoute(async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const conversations = await prisma.whatsappConversation.findMany({
    where: search ? { OR: [{ phone: { contains: search } }, { contactName: { contains: search, mode: 'insensitive' } }] } : undefined,
    orderBy: { lastMessageAt: 'desc' },
    take: 100,
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  res.json(conversations.map(({ messages, ...conversation }) => ({ ...conversation, lastMessage: messages[0] ?? null })));
}));
app.get('/api/whatsapp/conversations/:id/messages', auth, asyncRoute(async (req, res) => {
  const conversation = await prisma.whatsappConversation.findUnique({ where: { id: String(req.params.id) } });
  if (!conversation) { res.status(404).json({ error: 'Conversa não encontrada.' }); return; }
  res.json(await prisma.whatsappMessage.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: 'asc' }, take: 500 }));
}));
app.patch('/api/whatsapp/conversations/:id/read', auth, asyncRoute(async (req, res) => {
  const result = await prisma.whatsappConversation.updateMany({ where: { id: String(req.params.id) }, data: { unreadCount: 0 } });
  if (!result.count) { res.status(404).json({ error: 'Conversa não encontrada.' }); return; }
  res.json({ read: true });
}));
app.post('/api/whatsapp/conversations/:id/messages', auth, asyncRoute(async (req, res) => {
  const parsed = z.object({ text: z.string().trim().min(1).max(4096) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Digite uma mensagem de até 4096 caracteres.' }); return; }
  if (!whatsAppConfigured()) { res.status(503).json({ error: 'Configure as credenciais da WhatsApp Cloud API no servidor para enviar mensagens.' }); return; }
  const conversation = await prisma.whatsappConversation.findUnique({ where: { id: String(req.params.id) } });
  if (!conversation) { res.status(404).json({ error: 'Conversa não encontrada.' }); return; }
  const baseUrl = process.env.WHATSAPP_API_URL!.replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/${encodeURIComponent(process.env.WHATSAPP_PHONE_NUMBER_ID!)}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: conversation.phone, type: 'text', text: { preview_url: false, body: parsed.data.text } }),
  });
  const result = await response.json() as { messages?: Array<{ id?: string }>; error?: { message?: string } };
  if (!response.ok) { res.status(502).json({ error: result.error?.message ?? 'A WhatsApp Cloud API recusou a mensagem.' }); return; }
  const messageId = result.messages?.[0]?.id;
  const message = await prisma.whatsappMessage.create({ data: {
    externalId: messageId ?? null, conversationId: conversation.id, direction: 'OUTBOUND', type: 'text', body: parsed.data.text, status: 'sent',
  } });
  await prisma.whatsappConversation.update({ where: { id: conversation.id }, data: { lastMessageAt: message.createdAt } });
  res.status(201).json(message);
}));
app.get('/api/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode'], token = req.query['hub.verify_token'], challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && typeof token === 'string' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && typeof challenge === 'string') { res.status(200).send(challenge); return; }
  res.sendStatus(403);
});
app.post('/api/whatsapp/webhook', asyncRoute(async (req, res) => {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  const signature = req.header('x-hub-signature-256');
  const rawBody = (req as RawBodyRequest).rawBody;
  if (!appSecret || !signature || !rawBody) { res.sendStatus(401); return; }
  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  const expectedBuffer = Buffer.from(expected), signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length || !timingSafeEqual(expectedBuffer, signatureBuffer)) { res.sendStatus(401); return; }
  const payload = req.body as { entry?: Array<{ changes?: Array<{ value?: { contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>; messages?: Array<any>; statuses?: Array<any> } }> }> };
  for (const entry of payload.entry ?? []) for (const change of entry.changes ?? []) {
    const value = change.value ?? {};
    for (const status of value.statuses ?? []) if (status.id && status.status) {
      await prisma.whatsappMessage.updateMany({ where: { externalId: String(status.id) }, data: { status: String(status.status) } });
    }
    for (const incoming of value.messages ?? []) {
      const phone = String(incoming.from ?? '').replace(/\D/g, '');
      const externalId = String(incoming.id ?? '');
      if (!phone || !externalId || await prisma.whatsappMessage.findUnique({ where: { externalId } })) continue;
      const contact = (value.contacts ?? []).find(item => String(item.wa_id ?? '').replace(/\D/g, '') === phone);
      const type = String(incoming.type ?? 'text');
      const body = type === 'text' ? String(incoming.text?.body ?? '')
        : type === 'image' ? String(incoming.image?.caption ?? '[Imagem recebida]')
          : type === 'interactive' ? String(incoming.interactive?.button_reply?.title ?? incoming.interactive?.list_reply?.title ?? '[Resposta interativa]')
            : String(incoming.button?.text ?? `[${type} recebido]`);
      const receivedAt = incoming.timestamp ? new Date(Number(incoming.timestamp) * 1000) : new Date();
      const conversation = await prisma.whatsappConversation.upsert({
        where: { phone },
        create: { phone, contactName: contact?.profile?.name ?? null, unreadCount: 1, lastMessageAt: receivedAt },
        update: { ...(contact?.profile?.name ? { contactName: contact.profile.name } : {}), unreadCount: { increment: 1 }, lastMessageAt: receivedAt },
      });
      await prisma.whatsappMessage.create({ data: { externalId, conversationId: conversation.id, direction: 'INBOUND', type, body, status: 'received', createdAt: receivedAt } });
    }
  }
  res.sendStatus(200);
}));
const webBuildDir = path.resolve(process.cwd(), 'apps/web/dist');
app.use(express.static(webBuildDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) { next(); return; }
  res.sendFile(path.join(webBuildDir, 'index.html'), (error) => { if (error) next(); });
});
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Não foi possível concluir a operação.' });
});

export function createApp() { return app; }
