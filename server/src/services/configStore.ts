/**
 * configStore.ts
 * Chaves Geoapify salvas por USUÁRIO no banco (modelo ApiKey).
 * Cada usuário tem suas próprias chaves (multi-tenant).
 */

import { prisma } from "../db.js";

/** Retorna as chaves Geoapify ativas do usuário; cai no .env se não houver nenhuma. */
export async function getGeoapifyKeys(usuarioId?: string): Promise<string[]> {
  try {
    const where: any = { ativo: true };
    if (usuarioId) where.usuarioId = usuarioId;
    const rows = await prisma.apiKey.findMany({ where });
    const keys = rows.map((r) => r.key.trim()).filter(Boolean);
    if (keys.length) return keys;
  } catch {
    // ignora (ex.: tabela indisponível)
  }
  return (process.env.GEOAPIFY_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

/** Substitui as chaves Geoapify do usuário. */
export async function setGeoapifyKeys(texto: string, usuarioId?: string): Promise<string[]> {
  const chaves = [...new Set(texto.split(/[\n,;]+/).map((k) => k.trim()).filter(Boolean))];
  try {
    const where: any = {};
    if (usuarioId) where.usuarioId = usuarioId;
    else where.usuarioId = null;
    await prisma.apiKey.deleteMany({ where });
    if (chaves.length) {
      await prisma.apiKey.createMany({
        data: chaves.map((k) => ({
          key: k,
          ativo: true,
          usuarioId: usuarioId || null,
        })),
      });
    }
  } catch {
    // se falhar, ignora
  }
  return chaves;
}
