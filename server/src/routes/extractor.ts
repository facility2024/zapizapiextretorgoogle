/**
 * extractor.ts
 * Rotas do Extrator do Google Maps (leads sem site)
 */

import { Router } from "express";
import { buscarEmpresasSemSite } from "../services/overpassScraper.js";
import { prisma } from "../db.js";

const router = Router();

/** Extrai apenas os dígitos e garante DDI 55. */
function extrairNumero(raw?: string): string {
  if (!raw) return "";
  let s = raw.replace(/^https:\/\/wa\.me\//, "").replace(/\D/g, "");
  if (!s) return "";
  if (s.length <= 11 && !s.startsWith("55")) s = "55" + s;
  return s;
}

// POST /api/extractor/search
router.post("/search", async (req, res) => {
  const { query, limit, modo } = req.body as { query?: string; limit?: number; modo?: "leads" | "completo" };

  if (!query || !query.trim()) {
    res.status(400).json({ error: "query é obrigatório" });
    return;
  }

  try {
    const limite = Math.min(Number(limit) || 20, 5000);
    const resultados = await buscarEmpresasSemSite(query.trim(), limite, modo === "completo" ? "completo" : "leads");
    res.json({ total: resultados.length, resultados });
  } catch (err: any) {
    res.status(502).json({ error: err?.message || "Erro ao consultar o OpenStreetMap" });
  }
});

/**
 * POST /api/extractor/save
 * Salva leads extraídos como Contatos (upsert por número) para uso em campanhas.
 * Body: { leads: Resultado[], query?: string }
 */
router.post("/save", async (req, res) => {
  const { leads, query } = req.body as { leads?: Record<string, any>[]; query?: string };
  if (!Array.isArray(leads) || leads.length === 0) {
    res.status(400).json({ error: "leads é obrigatório" });
    return;
  }

  const contatoIds: string[] = [];
  for (const l of leads) {
    const numero = extrairNumero(l.whatsapp || l.telefone);
    if (!numero) continue; // sem número não dá pra disparar

    const extras = JSON.stringify({ ...l, query: query || null });
    const existente = await prisma.contato.findUnique({ where: { numero } });

    const contato = existente
      ? await prisma.contato.update({
          where: { numero },
          data: { nome: l.nome || existente.nome, empresa: l.categoria || existente.empresa, cidade: l.cidade || existente.cidade, extras },
        })
      : await prisma.contato.create({
          data: {
            numero,
            nome: l.nome || null,
            empresa: l.categoria || null,
            cidade: l.cidade || null,
            extras,
          },
        });

    contatoIds.push(contato.id);
  }

  res.json({ total: contatoIds.length, contatoIds });
});

export default router;
