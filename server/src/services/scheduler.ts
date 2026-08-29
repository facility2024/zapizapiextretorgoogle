/**
 * scheduler.ts
 * Verifica periodicamente campanhas com status "agendada" cujo horário (Brasília)
 * já chegou e inicia o disparo automaticamente. Como o agendamento fica no
 * banco (Campanha.agendarPara em UTC), sobrevive a reinícios do servidor.
 */

import { prisma } from "../db.js";
import * as queue from "./queue.js";

const INTERVALO_MS = 30_000; // 30 segundos

export function iniciarScheduler(): void {
  const tick = async () => {
    try {
      const agora = new Date();
      const pendentes = await prisma.campanha.findMany({
        where: {
          status: "agendada",
          agendarPara: { lte: agora },
        },
      });

      for (const campanha of pendentes) {
        // Marca como em_andamento antes de enfileirar para evitar duplo disparo
        // caso dois ticks coincidam.
        await prisma.campanha.update({
          where: { id: campanha.id },
          data: { status: "em_andamento" },
        });
        await queue.enfileirarCampanha(campanha.id);
        queue.processarFila(campanha.id).catch((e) => console.error("[SCHEDULER] Erro ao processar:", e));
        console.log(`[SCHEDULER] Campanha agendada ${campanha.id} iniciada automaticamente`);
      }
    } catch (err) {
      console.error("[SCHEDULER] Erro no tick:", err);
    }
  };

  // Executa logo ao subir e depois a cada intervalo
  tick();
  setInterval(tick, INTERVALO_MS);
  console.log("[SCHEDULER] Agendador de campanhas iniciado");
}
