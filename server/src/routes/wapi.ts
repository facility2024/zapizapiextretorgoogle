/**
 * wapi.ts
 * Rotas de conexão W-API (QR Code + status)
 */

import { Router } from "express";
import * as wapi from "../services/wapiClient.js";

const router = Router();

// GET /api/wapi/status — status da instância
router.get("/status", async (_req, res) => {
  const status = await wapi.checkStatus();
  res.json(status);
});

// GET /api/wapi/debug — mostra qual instância o server está usando (mascara token)
router.get("/debug", async (_req, res) => {
  const id = process.env.WAPI_INSTANCE_ID || "";
  const tok = process.env.WAPI_TOKEN || "";
  res.json({
    instanceId: id,
    instanceIdMasked: id ? id.slice(0, 4) + "..." + id.slice(-4) : "",
    hasToken: !!tok,
    tokenMasked: tok ? tok.slice(0, 4) + "..." + tok.slice(-4) : "",
    baseUrl: process.env.WAPI_BASE_URL || "https://api.w-api.app",
  });
});

// GET /api/wapi/qrcode — obtém QR Code para pareamento
router.get("/qrcode", async (_req, res) => {
  try {
    const qr = await wapi.getQrCode();
    res.json(qr);
  } catch (err: unknown) {
    const error = err as Error;
    // Instância já conectada — não há QR para exibir
    if (error.message.includes("já está conectado")) {
      res.status(200).json({ connected: true, message: error.message });
      return;
    }
    res.status(500).json({ error: error.message });
  }
});

export default router;
