/**
 * extractor.ts
 * Rotas do Extrator do Google Maps (leads sem site)
 */

import { Router } from "express";
import {
  searchBusinesses,
  getBusinessDetails,
  chunk,
  sleep,
  toWhatsappLink,
  hasNoWebsite,
} from "../services/googleMapsScraper.js";

const router = Router();

// POST /api/extractor/search
router.post("/search", async (req, res) => {
  const { query, limit } = req.body as { query?: string; limit?: number };

  if (!query || !query.trim()) {
    res.status(400).json({ error: "query é obrigatório" });
    return;
  }

  try {
    const limite = Math.min(Number(limit) || 20, 100);
    const businesses = await searchBusinesses({ query: query.trim(), limit: limite });

    const semSite = (businesses as Record<string, any>[]).filter(hasNoWebsite);
    const ids = semSite.map((b) => b.business_id).filter(Boolean) as string[];
    const lotes = chunk(ids, 20);

    let detalhes: Record<string, any>[] = [];
    for (let i = 0; i < lotes.length; i++) {
      const lote = await getBusinessDetails(lotes[i]);
      detalhes = detalhes.concat(lote as Record<string, any>[]);
      if (i < lotes.length - 1) await sleep(1000);
    }

    const resultados = detalhes.map((b) => {
      const emails = Array.isArray(b.emails_and_contacts?.emails)
        ? b.emails_and_contacts.emails.join(" | ")
        : b.emails || "";

      const gmail = Array.isArray(b.emails_and_contacts?.emails)
        ? b.emails_and_contacts.emails.find((e: string) => e.toLowerCase().includes("gmail.com")) || ""
        : "";

      return {
        nome: b.name || "",
        telefone: b.phone_number || "",
        whatsapp: toWhatsappLink(b.phone_number),
        email: emails,
        gmail,
        endereco: b.full_address || "",
        categoria: b.type || (Array.isArray(b.types) ? b.types.join(", ") : ""),
        avaliacao: b.rating || "",
        qtd_avaliacoes: b.review_count || "",
        facebook: b.emails_and_contacts?.facebook || "",
        instagram: b.emails_and_contacts?.instagram || "",
        linkedin: b.emails_and_contacts?.linkedin || "",
        tiktok: b.emails_and_contacts?.tiktok || "",
        twitter: b.emails_and_contacts?.twitter || "",
        google_maps_url: b.google_maps_url || b.place_link || "",
        site: b.website || "(sem site)",
      };
    });

    res.json({ total: resultados.length, resultados });
  } catch (err: any) {
    res.status(502).json({ error: err?.message || "Erro ao consultar a API do Google Maps" });
  }
});

export default router;
