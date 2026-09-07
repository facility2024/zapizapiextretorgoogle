/**
 * configStore.ts
 * Chaves Geoapify salvas no campo geoapifyKeys da tabela UserInstance
 * (mesma tabela que já funciona para W-API). Sem tabela separada.
 */

import { prisma } from "../db.js";

export async function getGeoapifyKeys(usuarioId?: string): Promise<string[]> {
  if (usuarioId) {
    try {
      const inst = await prisma.userInstance.findUnique({ where: { usuarioId } });
      if (inst?.geoapifyKeys) {
        const keys = inst.geoapifyKeys.split(",").map((k) => k.trim()).filter(Boolean);
        if (keys.length) return keys;
      }
    } catch (e: any) {
      console.error("[configStore] Erro ao ler geoapifyKeys do UserInstance:", e.message);
    }
  }
  return (process.env.GEOAPIFY_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

export async function setGeoapifyKeys(texto: string, usuarioId?: string): Promise<string[]> {
  const chaves = [...new Set(texto.split(/[\n,;]+/).map((k) => k.trim()).filter(Boolean))];
  const valor = chaves.join(",");

  if (usuarioId) {
    try {
      const inst = await prisma.userInstance.findUnique({ where: { usuarioId } });
      if (inst) {
        await prisma.userInstance.update({ where: { usuarioId }, data: { geoapifyKeys: valor } });
      }
    } catch (e: any) {
      console.error("[configStore] Erro ao salvar geoapifyKeys:", e.message);
      throw e;
    }
  }

  return chaves;
}
