/**
 * config.ts
 * Rotas para configuração do app via menu (ex.: chaves do Geoapify).
 */

import { Router } from "express";
import { getGeoapifyKeys, setGeoapifyKeys } from "../services/configStore.js";

const router = Router();

// GET /api/config/geoapify -> retorna as chaves salvas (uma por linha)
router.get("/geoapify", (_req, res) => {
  res.json({ keys: getGeoapifyKeys().join("\n") });
});

// POST /api/config/geoapify -> salva chaves (texto com quebras de linha ou vírgulas)
router.post("/geoapify", (req, res) => {
  const texto = typeof req.body?.keys === "string" ? req.body.keys : "";
  const chaves = setGeoapifyKeys(texto);
  res.json({ total: chaves.length, keys: chaves.join("\n") });
});

export default router;
