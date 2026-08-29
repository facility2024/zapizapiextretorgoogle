/**
 * config.ts
 * Rotas para configuração do app via menu (ex.: chaves do Geoapify).
 */

import { Router } from "express";
import { getGeoapifyKeys, setGeoapifyKeys } from "../services/configStore.js";

const router = Router();

// GET /api/config/geoapify -> retorna as chaves salvas (uma por linha)
router.get("/geoapify", async (_req, res) => {
  try {
    const keys = await getGeoapifyKeys();
    res.json({ keys: keys.join("\n") });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Erro ao ler chaves" });
  }
});

// POST /api/config/geoapify -> salva chaves (texto com quebras de linha ou vírgulas)
router.post("/geoapify", async (req, res) => {
  const texto = typeof req.body?.keys === "string" ? req.body.keys : "";
  try {
    const chaves = await setGeoapifyKeys(texto);
    res.json({ total: chaves.length, keys: chaves.join("\n") });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Erro ao salvar chaves" });
  }
});

export default router;
