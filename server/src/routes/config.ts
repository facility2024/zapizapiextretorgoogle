/**
 * config.ts
 * Rotas para configuração do app via menu (ex.: chaves do Geoapify).
 */

import { Router } from "express";
import { getGeoapifyKeys, setGeoapifyKeys } from "../services/configStore.js";

const router = Router();

// GET /api/config/geoapify -> retorna as chaves salvas (uma por linha)
router.get("/geoapify", async (req, res) => {
  const uid = (req as any).usuarioId;
  console.log("[config] GET geoapify usuarioId=", uid);
  try {
    const keys = await getGeoapifyKeys(uid);
    console.log("[config] GET geoapify keys encontradas:", keys.length);
    res.json({ keys: keys.join("\n") });
  } catch (err: any) {
    console.error("[config] GET geoapify ERRO:", err);
    res.status(500).json({ error: err?.message || "Erro ao ler chaves" });
  }
});

// POST /api/config/geoapify -> salva chaves (texto com quebras de linha ou vírgulas)
router.post("/geoapify", async (req, res) => {
  const texto = typeof req.body?.keys === "string" ? req.body.keys : "";
  try {
    const chaves = await setGeoapifyKeys(texto, (req as any).usuarioId);
    res.json({ total: chaves.length, keys: chaves.join("\n") });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Erro ao salvar chaves" });
  }
});

export default router;
