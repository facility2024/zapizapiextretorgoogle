/**
 * configStore.ts
 * Armazena as chaves do Geoapify no BANCO DE DADOS (modelo ApiKey), que persiste
 * entre atualizações/redeploys (diferente de arquivos em disco).
 * O .env (GEOAPIFY_KEY) continua como fallback caso o banco esteja vazio.
 */

import { prisma } from "../db.js";

/** Retorna as chaves Geoapify ativas do banco; cai no .env se não houver nenhuma. */
export async function getGeoapifyKeys(): Promise<string[]> {
  try {
    const rows = await prisma.apiKey.findMany({ where: { ativo: true } });
    const keys = rows.map((r) => r.key.trim()).filter(Boolean);
    if (keys.length) return keys;
  } catch {
    // ignora (ex.: tabela indisponível) e usa o fallback do .env
  }
  return (process.env.GEOAPIFY_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

/** Substitui todas as chaves Geoapify salvas pelo texto informado (linhas ou vírgulas). */
export async function setGeoapifyKeys(texto: string): Promise<string[]> {
  const chaves = [...new Set(texto.split(/[\n,;]+/).map((k) => k.trim()).filter(Boolean))];
  try {
    await prisma.apiKey.deleteMany({});
    if (chaves.length) {
      await prisma.apiKey.createMany({ data: chaves.map((k) => ({ key: k, ativo: true })) });
    }
  } catch {
    // se falhar (ex.: sem DB), ignora — o GET ainda lê do .env
  }
  return chaves;
}
