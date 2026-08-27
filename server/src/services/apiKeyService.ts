/**
 * apiKeyService.ts
 * Gerencia as chaves da RapidAPI (Extrator Google Maps) com rotação automática.
 * As chaves ficam salvas no banco (ApiKey) e são tentadas em ordem de menor
 * número de falhas — quando uma estoura cota/limite, pula para a próxima.
 */

import { prisma } from "../db.js";

export type ApiKeyInfo = {
  id: string;
  label: string | null;
  chave: string;
  ativo: boolean;
  falhas: number;
  ultimoErro: string | null;
  ultimoUso: Date | null;
  createdAt: Date;
};

/** Lista as chaves ativas ordenadas por menor número de falhas. */
export async function listarChaves(): Promise<ApiKeyInfo[]> {
  const rows = await prisma.apiKey.findMany({ orderBy: [{ ativo: "desc" }, { falhas: "asc" }, { createdAt: "asc" }] });
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    chave: r.key,
    ativo: r.ativo,
    falhas: r.falhas,
    ultimoErro: r.ultimoErro,
    ultimoUso: r.ultimoUso,
    createdAt: r.createdAt,
  }));
}

/** Cria uma nova chave (a própria string da RapidAPI). */
export async function criarChave(key: string, label?: string) {
  const limpa = key.trim();
  if (!limpa) throw new Error("Chave vazia");
  return prisma.apiKey.create({ data: { key: limpa, label: label?.trim() || null } });
}

/** Remove uma chave pelo id. */
export async function removerChave(id: string) {
  return prisma.apiKey.delete({ where: { id } });
}

/** Liga/desliga uma chave. */
export async function alternarChave(id: string, ativo: boolean) {
  return prisma.apiKey.update({ where: { id }, data: { ativo } });
}

/** Marca uma chave como usada com sucesso. */
export async function marcarSucesso(id: string) {
  return prisma.apiKey.update({ where: { id }, data: { ultimoUso: new Date(), falhas: 0, ultimoErro: null } });
}

/** Registra uma falha (incrementa contador e guarda a mensagem). */
export async function marcarFalha(id: string, msg: string) {
  return prisma.apiKey.update({
    where: { id },
    data: { falhas: { increment: 1 }, ultimoErro: msg.slice(0, 200) },
  });
}

/**
 * Executa `fn` com rotação de chaves. Tenta cada chave ativa; se uma falhar por
 * cota/limite (401/403/429 ou mensagem de rate limit), pula para a próxima.
 * Se nenhuma chave estiver cadastrada, usa RAPIDAPI_KEY do .env como fallback.
 */
export async function comRotacao<T>(fn: (apiKey: string) => Promise<T>): Promise<T> {
  const chaves = await prisma.apiKey.findMany({
    where: { ativo: true },
    orderBy: { falhas: "asc" },
  });

  if (chaves.length === 0) {
    const envKey = process.env.RAPIDAPI_KEY;
    if (!envKey) {
      throw new Error(
        "Nenhuma API Key cadastrada. Adicione chaves em 'API Google' ou configure RAPIDAPI_KEY no .env"
      );
    }
    return fn(envKey);
  }

  let ultimoErro: unknown;
  for (const chave of chaves) {
    try {
      const resultado = await fn(chave.key);
      await marcarSucesso(chave.id);
      return resultado;
    } catch (err: any) {
      ultimoErro = err;
      const status = err?.response?.status;
      const msg: string = err?.message || "";
      const ehQuota =
        status === 401 ||
        status === 403 ||
        status === 429 ||
        /quota|limit|exceeded|unauthorized|forbidden|rate|daily/i.test(msg);
      await marcarFalha(chave.id, msg);
      if (!ehQuota) {
        // Erro não relacionado a cota: não adianta tentar outra chave
        throw err;
      }
    }
  }

  throw ultimoErro instanceof Error ? ultimoErro : new Error("Todas as API Keys falharam");
}
