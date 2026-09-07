/**
 * configStore.ts
 * Chaves Geoapify salvas por USUÁRIO no banco (modelo ApiKey).
 */

import { prisma } from "../db.js";

export async function getGeoapifyKeys(usuarioId?: string): Promise<string[]> {
  // 1) Chaves deste usuário
  if (usuarioId) {
    const rows = await prisma.apiKey.findMany({ where: { ativo: true, usuarioId } });
    const keys = rows.map((r) => r.key.trim()).filter(Boolean);
    if (keys.length) return keys;
  }
  // 2) Chaves globais (usuarioId=null)
  const globais = await prisma.apiKey.findMany({ where: { ativo: true, usuarioId: null } });
  const gKeys = globais.map((r) => r.key.trim()).filter(Boolean);
  if (gKeys.length) return gKeys;
  // 3) Fallback .env
  return (process.env.GEOAPIFY_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

export async function setGeoapifyKeys(texto: string, usuarioId?: string): Promise<string[]> {
  const chaves = [...new Set(texto.split(/[\n,;]+/).map((k) => k.trim()).filter(Boolean))];

  // Deleta chaves antigas deste usuário
  const whereDel: any = {};
  if (usuarioId) whereDel.usuarioId = usuarioId;
  else whereDel.usuarioId = null;
  await prisma.apiKey.deleteMany({ where: whereDel });

  // Salva cada chave (upsert para evitar erro de unique)
  for (const k of chaves) {
    await prisma.apiKey.upsert({
      where: { key: k },
      update: { ativo: true, usuarioId: usuarioId || null },
      create: { key: k, ativo: true, usuarioId: usuarioId || null },
    });
  }

  return chaves;
}
