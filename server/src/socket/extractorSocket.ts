/**
 * extractorSocket.ts
 * Extração do OpenStreetMap via WebSocket (streaming).
 * Evita o timeout de proxy de uma única requisição HTTP longa:
 * os resultados são emitidos conforme são obtidos.
 */

import type { Socket } from "socket.io";
import { buscarEmpresasSemSite } from "../services/overpassScraper.js";

export function registerExtractorSocket(socket: Socket) {
  let running = false;

  socket.on(
    "extractor:search",
    async (payload: { query?: string; limit?: number; modo?: "leads" | "completo"; fonte?: "osm" | "geoapify" }) => {
      const query = payload?.query?.trim();
      if (!query) {
        socket.emit("extractor:error", { message: "query é obrigatório" });
        return;
      }
      if (running) {
        socket.emit("extractor:error", { message: "Já existe uma extração em andamento" });
        return;
      }

      const modo = payload?.modo === "completo" ? "completo" : "leads";
      const fonte = payload?.fonte === "geoapify" ? "geoapify" : "osm";

      running = true;
      try {
        const limite = Math.min(Number(payload.limit) || 20, 5000);
        const nomeFonte = fonte === "geoapify" ? "Geoapify" : "OpenStreetMap";
        socket.emit("extractor:status", { stage: "searching", message: `Buscando empresas no ${nomeFonte}…` });

        const empresas = await buscarEmpresasSemSite(query, limite, modo, fonte);

        const rotulo = modo === "completo" ? "todas as empresas (dados completos)" : "empresas (sem site ou com Gmail)";
        socket.emit("extractor:status", {
          stage: "details",
          message: `${empresas.length} ${rotulo} encontradas`,
          total: empresas.length,
        });

        let enviados = 0;
        for (const b of empresas) {
          socket.emit("extractor:result", b);
          enviados++;
        }

        socket.emit("extractor:done", { total: enviados });
      } catch (err: any) {
        socket.emit("extractor:error", {
          message: err?.message || "Erro ao consultar a fonte de dados",
        });
      } finally {
        running = false;
      }
    }
  );
}
