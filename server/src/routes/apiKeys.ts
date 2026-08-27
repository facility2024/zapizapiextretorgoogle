/**
 * apiKeys.ts
 * Gerencia as chaves da RapidAPI (Extrator Google Maps) salvas no banco.
 * Permite cadastrar várias chaves e a rotação automática acontece no
 * apiKeyService.comRotacao durante a extração.
 */

import { Router } from "express";
import { prisma } from "../db.js";
import {
  listarChaves,
  criarChave,
  removerChave,
  alternarChave,
} from "../services/apiKeyService.js";

const router = Router();

// GET /api/apikeys — lista chaves (sem expor a string completa)
router.get("/", async (_req, res) => {
  try {
    const chaves = await listarChaves();
    res.json({
      chaves: chaves.map((c) => ({
        id: c.id,
        label: c.label,
        ativo: c.ativo,
        falhas: c.falhas,
        ultimoErro: c.ultimoErro,
        ultimoUso: c.ultimoUso,
        createdAt: c.createdAt,
        chave: mascarar(c.chave),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Erro ao listar chaves" });
  }
});

// POST /api/apikeys — adiciona uma chave
router.post("/", async (req, res) => {
  const { key, label } = req.body as { key?: string; label?: string };
  if (!key || !key.trim()) {
    res.status(400).json({ error: "Informe a chave" });
    return;
  }
  try {
    const criada = await criarChave(key, label);
    res.json({ id: criada.id, label: criada.label, ativo: criada.ativo });
  } catch (err: any) {
    if (String(err?.message || "").includes("Unique")) {
      res.status(409).json({ error: "Essa chave já está cadastrada" });
      return;
    }
    res.status(500).json({ error: err?.message || "Erro ao salvar chave" });
  }
});

// DELETE /api/apikeys/:id — remove uma chave
router.delete("/:id", async (req, res) => {
  try {
    await removerChave(req.params.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Erro ao remover chave" });
  }
});

// PATCH /api/apikeys/:id — liga/desliga uma chave
router.patch("/:id", async (req, res) => {
  const { ativo } = req.body as { ativo?: boolean };
  try {
    const atualizada = await alternarChave(req.params.id, ativo === true);
    res.json({ id: atualizada.id, ativo: atualizada.ativo });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Erro ao atualizar chave" });
  }
});

function mascarar(chave: string): string {
  if (chave.length <= 6) return "••••";
  return chave.slice(0, 4) + "••••" + chave.slice(-4);
}

export default router;
