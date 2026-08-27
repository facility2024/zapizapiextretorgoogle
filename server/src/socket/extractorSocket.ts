/**
 * extractorSocket.ts
 * Extração do Google Maps via WebSocket (streaming).
 * Evita o timeout de proxy de uma única requisição HTTP longa:
 * os resultados são emitidos conforme são obtidos.
 */

import type { Socket } from "socket.io";
import {
  searchBusinesses,
  getBusinessDetails,
  chunk,
  sleep,
  toWhatsappLink,
  hasNoWebsite,
} from "../services/googleMapsScraper.js";

function mapearResultado(b: Record<string, any>) {
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
}

export function registerExtractorSocket(socket: Socket) {
  let running = false;

  socket.on("extractor:search", async (payload: { query?: string; limit?: number }) => {
    const query = payload?.query?.trim();
    if (!query) {
      socket.emit("extractor:error", { message: "query é obrigatório" });
      return;
    }
    if (running) {
      socket.emit("extractor:error", { message: "Já existe uma extração em andamento" });
      return;
    }

    running = true;
    try {
      const limite = Math.min(Number(payload.limit) || 20, 100);
      socket.emit("extractor:status", { stage: "searching", message: "Buscando empresas…" });

      const businesses = await searchBusinesses({ query, limit: limite });
      const semSite = (businesses as Record<string, any>[]).filter(hasNoWebsite);
      const ids = semSite.map((b) => b.business_id).filter(Boolean) as string[];

      socket.emit("extractor:status", {
        stage: "details",
        message: `${ids.length} empresas sem site encontradas`,
        total: ids.length,
      });

      const lotes = chunk(ids, 20);
      let enviados = 0;

      for (let i = 0; i < lotes.length; i++) {
        const lote = (await getBusinessDetails(lotes[i])) as Record<string, any>[];
        for (const b of lote) {
          socket.emit("extractor:result", mapearResultado(b));
          enviados++;
        }
        if (i < lotes.length - 1) {
          socket.emit("extractor:progress", { done: enviados, total: ids.length });
          await sleep(1000);
        }
      }

      socket.emit("extractor:done", { total: enviados });
    } catch (err: any) {
      socket.emit("extractor:error", {
        message: err?.message || "Erro ao consultar a API do Google Maps",
      });
    } finally {
      running = false;
    }
  });
}
