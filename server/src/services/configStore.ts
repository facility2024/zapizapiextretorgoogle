/**
 * configStore.ts
 * Chaves Geoapify:
 * 1. Busca de process.env (setado pelo Easypanel .env)
 * 2. Busca do campo geoapifyKeys na UserInstance (se a coluna existir)
 * 3. Em runtime, seta process.env quando o usuário salva via UI
 */

import { prisma } from "../db.js";

export async function getGeoapifyKeys(usuarioId?: string): Promise<string[]> {
  // 1) Tenta buscar do banco (se a coluna existir)
  if (usuarioId) {
    try {
      const inst = await prisma.userInstance.findUnique({ where: { usuarioId } });
      if (inst?.geoapifyKeys) {
        const keys = inst.geoapifyKeys.split(",").map((k) => k.trim()).filter(Boolean);
        if (keys.length) return keys;
      }
    } catch {
      // coluna pode não existir — ignora
    }
  }
  // 2) Fallback: process.env (setado pelo .env OU pelo setGeoapifyKeys em runtime)
  return (process.env.GEOAPIFY_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

export async function setGeoapifyKeys(texto: string, usuarioId?: string): Promise<string[]> {
  const chaves = [...new Set(texto.split(/[\n,;]+/).map((k) => k.trim()).filter(Boolean))];
  const valor = chaves.join(",");

  // Salva em process.env EM RUNTIME (funciona imediatamente)
  if (chaves.length) {
    process.env.GEOAPIFY_KEY = valor;
  }

  // Tenta salvar no banco (se a coluna existir)
  if (usuarioId) {
    try {
      const inst = await prisma.userInstance.findUnique({ where: { usuarioId } });
      if (inst) {
        await prisma.userInstance.update({ where: { usuarioId }, data: { geoapifyKeys: valor } });
      }
    } catch {
      // coluna pode não existir — ignora, process.env já tem a chave
    }
  }

  return chaves;
}
