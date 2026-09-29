import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();
async function main() {
  const categories = ['Hambúrgueres', 'Combos', 'Refrigerantes', 'Adicionais', 'Batatas', 'Outros'];
  for (const [sortOrder, name] of categories.entries()) await prisma.category.upsert({ where: { name }, update: {}, create: { name, sortOrder } });
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_INITIAL_PASSWORD || 'HelpBurguer2026!';
  await prisma.user.upsert({ where: { username }, update: {}, create: { username, name: 'Administrador', passwordHash: await bcrypt.hash(password, 12), role: UserRole.ADMIN } });
}
main().finally(() => prisma.$disconnect());
