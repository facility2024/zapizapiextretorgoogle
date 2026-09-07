/**
 * userInstances.ts
 * Rotas para gerenciar instâncias W-API do usuário.
 * Cada usuário tem sua própria instância (ID + Token).
 */
import { Router } from "express";
import { prisma } from "../db.js";

const router = Router();

// ─── Buscar instância do usuário logado ─────────────────────
router.get("/minha-instancia", async (req, res) => {
  try {
    const instancia = await prisma.userInstance.findUnique({
      where: { usuarioId: req.usuarioId },
      select: {
        id: true, wapiInstanceId: true, wapiBaseUrl: true, geoapifyKeys: true, conectado: true, createdAt: true,
        // NÃO retorna wapiToken na resposta por segurança
      },
    });
    res.json({ instancia: instancia || null });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Salvar/atualizar instância W-API ───────────────────────
router.post("/minha-instancia", async (req, res) => {
  try {
    const { wapiInstanceId, wapiToken, wapiApiKey, wapiBaseUrl, geoapifyKeys } = req.body || {};

    const existente = await prisma.userInstance.findUnique({ where: { usuarioId: req.usuarioId } });

    if (existente) {
      const instancia = await prisma.userInstance.update({
        where: { usuarioId: req.usuarioId },
        data: {
          ...(wapiInstanceId ? { wapiInstanceId } : {}),
          ...(wapiToken ? { wapiToken } : {}),
          ...(wapiApiKey !== undefined ? { wapiApiKey: wapiApiKey || null } : {}),
          ...(wapiBaseUrl ? { wapiBaseUrl } : {}),
          ...(geoapifyKeys !== undefined ? { geoapifyKeys } : {}),
        },
      });
      res.json({
        id: instancia.id,
        wapiInstanceId: instancia.wapiInstanceId,
        wapiBaseUrl: instancia.wapiBaseUrl,
        conectado: instancia.conectado,
      });
    } else {
      if (!wapiInstanceId || !wapiToken) {
        res.status(400).json({ error: "wapiInstanceId e wapiToken são obrigatórios para criar instância" });
        return;
      }
      const instancia = await prisma.userInstance.create({
        data: {
          usuarioId: req.usuarioId,
          wapiInstanceId,
          wapiToken,
          wapiApiKey: wapiApiKey || null,
          wapiBaseUrl: wapiBaseUrl || "https://api.w-api.app",
          geoapifyKeys: geoapifyKeys || null,
        },
      });
      res.json({
        id: instancia.id,
        wapiInstanceId: instancia.wapiInstanceId,
        wapiBaseUrl: instancia.wapiBaseUrl,
        conectado: instancia.conectado,
      });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Marcar instância como conectada/desconectada ───────────
router.patch("/minha-instancia/status", async (req, res) => {
  try {
    const { conectado } = req.body || {};
    const instancia = await prisma.userInstance.update({
      where: { usuarioId: req.usuarioId },
      data: { conectado: !!conectado },
    });
    res.json({ conectado: instancia.conectado });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Obter credenciais W-API do usuário (para uso interno) ──
export async function getCredenciaisUsuario(usuarioId: string) {
  const instancia = await prisma.userInstance.findUnique({
    where: { usuarioId },
  });
  if (!instancia) return null;
  return {
    instanceId: instancia.wapiInstanceId,
    token: instancia.wapiToken,
    apiKey: instancia.wapiApiKey,
    baseUrl: instancia.wapiBaseUrl,
  };
}

export default router;
