/**
 * queue.ts
 * Motor de fila de envio com delay configurável e persistência via Prisma.
 * Estado mantido POR CAMPANHA (mapa), para que campanhas concorrentes
 * (manuais ou via scheduler) não se misturem nem corrompam o status.
 */

import { Campanha, Contato } from "@prisma/client";
import * as wapi from "./wapiClient.js";
import { processarMensagem, Contato as MessageContato } from "./messageParser.js";
import { prisma } from "../db.js";

interface FilaItem {
  campanhaId: string;
  contatoId: string;
  contato: Contato;
  campanha: Campanha;
}

interface EstadoCampanha {
  fila: FilaItem[];
  processando: boolean;
  pausado: boolean;
  cancelado: boolean;
}

// Estado da fila por campanha (em memória)
const estados = new Map<string, EstadoCampanha>();

function getEstado(campanhaId: string): EstadoCampanha {
  let e = estados.get(campanhaId);
  if (!e) {
    e = { fila: [], processando: false, pausado: false, cancelado: false };
    estados.set(campanhaId, e);
  }
  return e;
}

// Callback para atualizar frontend via WebSocket
type StatusCallback = (campanhaId: string, contatoId: string, status: string, erro?: string) => void;
let statusCallback: StatusCallback | null = null;

export function onStatusUpdate(cb: StatusCallback) {
  statusCallback = cb;
}

function notify(campanhaId: string, contatoId: string, status: string, erro?: string) {
  if (statusCallback) statusCallback(campanhaId, contatoId, status, erro);
}

/**
 * Retorna delay aleatório entre min e max segundos (ordena os limites)
 */
function randomDelay(min: number, max: number): number {
  const lo = Math.min(min || 0, max || 0);
  const hi = Math.max(min || 0, max || 0);
  return (Math.random() * (hi - lo) + lo) * 1000;
}

/**
 * Extrai a lista de URLs de imagens da campanha (até 4).
 * Aceita o novo campo imagensUrls (JSON array) ou o legado imagemUrl (único).
 */
function obterImagens(imagensUrls?: string | null, imagemUrl?: string | null): string[] {
  if (imagensUrls) {
    try {
      const arr = JSON.parse(imagensUrls);
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.filter((u: unknown): u is string => typeof u === "string" && !!u).slice(0, 4);
      }
    } catch {
      // ignora JSON inválido
    }
  }
  if (imagemUrl) return [imagemUrl];
  return [];
}

/**
 * Adiciona contatos pendentes de UMA campanha à sua fila.
 */
export async function enfileirarCampanha(campanhaId: string): Promise<void> {
  const campanha = await prisma.campanha.findUnique({ where: { id: campanhaId } });
  if (!campanha) throw new Error("Campanha não encontrada");

  const contatosNaFila = await prisma.campanhaContato.findMany({
    where: { campanhaId, status: "pendente" },
    include: { contato: true },
  });

  const e = getEstado(campanhaId);
  e.cancelado = false;
  e.pausado = false;

  for (const item of contatosNaFila) {
    e.fila.push({
      campanhaId,
      contatoId: item.contatoId,
      contato: item.contato,
      campanha,
    });
  }

  await prisma.campanha.update({
    where: { id: campanhaId },
    data: { status: "em_andamento" },
  });
}

/**
 * Processa a fila de UMA campanha.
 */
export async function processarFila(campanhaId: string): Promise<void> {
  const e = getEstado(campanhaId);
  if (e.processando || e.fila.length === 0) return;
  e.processando = true;

  const campanhaCabeca = e.fila[0]?.campanha;
  if (!campanhaCabeca) {
    e.processando = false;
    return;
  }

  console.log(`[FILA] Iniciando processamento de ${campanhaId} com ${e.fila.length} contatos`);

  // Delay inicial antes do primeiro envio (10-20s para "aquecer")
  const delayInicial = randomDelay(10, 20);
  console.log(`[FILA] Aguardando ${Math.round(delayInicial / 1000)}s antes do primeiro envio...`);
  await new Promise((r) => setTimeout(r, delayInicial));

  while (e.fila.length > 0 && !e.cancelado) {
    if (e.pausado) {
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }

    const item = e.fila.shift()!;
    const { campanha: camp, contato, campanhaId: cid, contatoId } = item;

    try {
      // Atualiza status para "enviando"
      await prisma.campanhaContato.update({
        where: { campanhaId_contatoId: { campanhaId: cid, contatoId } },
        data: { status: "enviando" },
      });
      notify(cid, contatoId, "enviando");

      // Verifica status da conexão
      const status = await wapi.checkStatus();
      if (status.status !== "connected") {
        throw new Error("Instância WhatsApp desconectada");
      }

      const numero = contato.numero;
      const temNome = contato.nome && contato.nome.trim().length > 0;
      console.log(`[FILA] Processando ${numero} (nome: ${temNome ? contato.nome : "sem nome"})`);

      // Simula digitação (tempo realista)
      const tempoDig = wapi.calcularTempoDigitação(camp.textoMensagem);
      await wapi.setComposing(numero, tempoDig);

      // Processa mensagem com variáveis do contato
      const msg = processarMensagem(
        camp.textoMensagem,
        contato as unknown as MessageContato,
        camp.variavelFallback || undefined
      );
      console.log(`[FILA] Mensagem processada para ${numero}: "${msg.substring(0, 50)}..."`);

      // Envia conforme o tipo
      if (camp.tipoDisparo === "texto") {
        const resultado = await wapi.sendText(numero, msg);
        if (!resultado.success) throw new Error(resultado.error);
        await registrarEnvio(cid, contatoId, "texto", resultado);

      } else if (camp.tipoDisparo === "imagem_texto") {
        const urls = obterImagens(camp.imagensUrls, camp.imagemUrl);
        if (urls.length === 0) throw new Error("Nenhuma imagem configurada na campanha");
        for (let i = 0; i < urls.length; i++) {
          await wapi.setComposing(numero, wapi.calcularTempoDigitação(msg));
          const resImg = await wapi.sendImage(numero, urls[i], "");
          if (!resImg.success) throw new Error(resImg.error);
          await registrarEnvio(cid, contatoId, "imagem", resImg);
          if (i < urls.length - 1) await new Promise((r) => setTimeout(r, 1500));
        }

        if (msg.trim().length > 0) {
          await new Promise((r) => setTimeout(r, (camp.delayImagemTexto || 4) * 1000));
          await wapi.setComposing(numero, wapi.calcularTempoDigitação(msg));
          const resTxt = await wapi.sendText(numero, msg);
          if (!resTxt.success) throw new Error(resTxt.error);
          await registrarEnvio(cid, contatoId, "texto", resTxt);
        }

      } else if (camp.tipoDisparo === "audio" && camp.audioUrl) {
        const resAudio = await wapi.sendAudio(numero, camp.audioUrl);
        if (!resAudio.success) throw new Error(resAudio.error);
        await registrarEnvio(cid, contatoId, "audio", resAudio);

      } else {
        // Tipo inválido: NÃO marca como enviado. Gera erro para este contato.
        throw new Error(`Tipo de disparo inválido: ${camp.tipoDisparo || "(vazio)"}`);
      }

      // Atualiza para "enviado"
      await prisma.campanhaContato.update({
        where: { campanhaId_contatoId: { campanhaId: cid, contatoId } },
        data: { status: "enviado", enviadoEm: new Date() },
      });
      await prisma.campanha.update({
        where: { id: cid },
        data: { enviados: { increment: 1 } },
      });
      wapi.marcarConectado();
      notify(cid, contatoId, "enviado");
      console.log(`[FILA] ✅ Mensagem enviada para ${numero}`);

    } catch (err: unknown) {
      const erro = err instanceof Error ? err.message : "Erro desconhecido";
      console.error(`[FILA] ❌ Erro ao enviar para ${contato.numero}: ${erro}`);
      await prisma.campanhaContato.update({
        where: { campanhaId_contatoId: { campanhaId: cid, contatoId } },
        data: { status: "erro", errorMsg: erro },
      });
      await prisma.campanha.update({
        where: { id: cid },
        data: { erros: { increment: 1 } },
      });
      notify(cid, contatoId, "erro", erro);
    }

    // Delay aleatório entre envios (respeita configuração do usuário)
    if (e.fila.length > 0 && !e.cancelado) {
      const delay = randomDelay(camp.delayEntreMsgMin, camp.delayEntreMsgMax);
      console.log(`[FILA] Aguardando ${Math.round(delay / 1000)}s antes do próximo envio...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // Campanha concluída (só se não foi cancelada)
  if (!e.cancelado) {
    await prisma.campanha.update({
      where: { id: campanhaId },
      data: { status: "concluida" },
    });
    notify(campanhaId, "", "concluida");
    console.log(`[FILA] Campanha ${campanhaId} concluída`);
  } else {
    console.log(`[FILA] Campanha ${campanhaId} cancelada`);
  }

  e.processando = false;
  estados.delete(campanhaId);
}

async function registrarEnvio(campanhaId: string, contatoId: string, tipo: string, resultado: { success: boolean; data?: unknown; error?: string }) {
  await prisma.envio.create({
    data: {
      campanhaId,
      contatoId,
      tipo,
      status: resultado.success ? "enviado" : "erro",
      response: resultado.data ? JSON.stringify(resultado.data) : null,
      errorMsg: resultado.error || null,
    },
  });
}

export function pausarFila(campanhaId: string): void {
  getEstado(campanhaId).pausado = true;
}

export function retomarFila(campanhaId: string): void {
  getEstado(campanhaId).pausado = false;
}

export function cancelarFila(campanhaId: string): void {
  const e = estados.get(campanhaId);
  if (!e) return;
  e.cancelado = true;
  e.fila.length = 0;
}

export function isProcessandoAny(): boolean {
  for (const e of estados.values()) if (e.processando) return true;
  return false;
}

export function isPausadoAny(): boolean {
  for (const e of estados.values()) if (e.pausado && e.processando) return true;
  return false;
}

export function getTamanhoFilaTotal(): number {
  let total = 0;
  for (const e of estados.values()) total += e.fila.length;
  return total;
}
