/**
 * wapiClient.ts
 * Cliente para comunicação com a W-API (w-api.app)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios, { AxiosInstance } from "axios";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");

const WAPI_BASE_URL = process.env.WAPI_BASE_URL || "https://api.w-api.app";
const WAPI_INSTANCE_ID = process.env.WAPI_INSTANCE_ID || "";
const WAPI_TOKEN = process.env.WAPI_TOKEN || "";
const WAPI_API_KEY = process.env.WAPI_API_KEY || "";

interface WapiResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

interface QrCodeResponse {
  qrCode: string;
  base64: string;
}

interface ConnectionStatus {
  status: "connected" | "disconnected" | "connecting";
}

let api: AxiosInstance | null = null;
let apiToken = "";
// Token da instância retornado pelo create-instance (sobrepõe WAPI_TOKEN quando definido)
let instanceTokenOverride = "";
// Status do último create-instance (para diagnóstico no erro do QR)
let createInstanceLog = "não executado";

function getClient(token?: string): AxiosInstance {
  const authToken = token ?? (instanceTokenOverride || WAPI_TOKEN);
  if (!api || apiToken !== authToken) {
    api = axios.create({
      baseURL: WAPI_BASE_URL,
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });
    apiToken = authToken;
  }
  return api;
}

/**
 * Converte caminho local ou URL para data URL base64
 * Se já for http/https, retorna como está
 * Se for caminho local (/uploads/...), lê o arquivo e converte para base64
 */
function toBase64DataUrl(filePath: string): string {
  // Se já é uma URL externa, retorna como está
  if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
    return filePath;
  }

  // Se é data URL, retorna como está
  if (filePath.startsWith("data:")) {
    return filePath;
  }

  // É caminho local — lê e converte para base64
  const localPath = path.join(UPLOADS_DIR, path.basename(filePath));
  if (!fs.existsSync(localPath)) {
    throw new Error(`Arquivo não encontrado: ${filePath}`);
  }

  const fileBuffer = fs.readFileSync(localPath);
  const ext = path.extname(localPath).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".gif": "image/gif", ".webp": "image/webp",
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4",
    ".ogg": "audio/ogg", ".opus": "audio/ogg",
  };
  const mime = mimeMap[ext] || "application/octet-stream";
  const base64 = fileBuffer.toString("base64");
  return `data:${mime};base64,${base64}`;
}

/**
 * Verifica se a instância está conectada
 * GET /v1/instance/status-instance?instanceId=X
 */
export async function checkStatus(): Promise<ConnectionStatus> {
  try {
    const client = getClient();
    const { data } = await client.get(`/v1/instance/status-instance?instanceId=${WAPI_INSTANCE_ID}`);
    return { status: data.connected === true ? "connected" : "disconnected" };
  } catch (err: unknown) {
    const error = err as { response?: { data?: unknown }; message?: string };
    console.error("[WAPI] Erro ao verificar status:", error.response?.data || error.message);
    return { status: "disconnected" };
  }
}

/**
 * Marca instância como conectada (chamado após envio bem-sucedido)
 */
export function marcarConectado(): void {
  // Não faz nada — confiamos apenas no status real da W-API
}

export function marcarDesconectado(): void {
  // Não faz nada — confiamos apenas no status real da W-API
}

/**
 * Garante que a instância existe na W-API (auto-provisionamento).
 * Usa a API key da CONTA para chamar POST /v1/client/create-instance.
 * Se a instância já existir, ignora o erro e segue para o QR.
 * Isso também aloca IP/porta de instâncias LITE recém-criadas.
 */
export async function ensureInstanceCreated(): Promise<void> {
  // Instância já configurada via painel (WAPI_TOKEN presente):
  // usamos o token do painel e NÃO chamamos create-instance (evita regenerar
  // um token inválido para uma instância que já existe/paga).
  if (WAPI_TOKEN) {
    createInstanceLog = "ignorado (usando WAPI_TOKEN do .env)";
    return;
  }
  if (!WAPI_API_KEY) return;
  const client = getClient(WAPI_API_KEY);
  try {
    const { data } = await client.post(`/v1/client/create-instance?instanceId=${WAPI_INSTANCE_ID}`, {
      lite: true,
      instanceName: WAPI_INSTANCE_ID,
      apiKey: WAPI_API_KEY,
    });
    // create-instance retorna o token da instância recém-criada
    const tok =
      data?.token ||
      (data?.data && data.data.token) ||
      null;
    if (tok) {
      instanceTokenOverride = tok;
      const masked = tok.length > 8 ? `${tok.slice(0, 4)}...${tok.slice(-4)}` : "***";
      createInstanceLog = `ok (token retornado pela API: ${masked})`;
      console.log(`[WAPI] Instância criada/atualizada. Usando token retornado pela API: ${masked}`);
    } else {
      createInstanceLog = "ok (sem token no retorno)";
    }
  } catch (err: unknown) {
    const error = err as { response?: { data?: unknown }; message?: string };
    const detail = error.response?.data ? JSON.stringify(error.response.data) : error.message || "erro";
    createInstanceLog = `falhou: ${detail}`;
    console.warn("[WAPI] create-instance (ignorado se já existir):", detail);
  }
}

/**
 * Obtém QR Code para pareamento
 * GET /v1/instance/qr-code?instanceId=X
 */
export async function getQrCode(): Promise<QrCodeResponse> {
  // Auto-provisiona a instância (aloca IP/porta) e captura o token novo, se houver.
  // IMPORTANTE: o client deve ser criado DEPOIS, para usar o token retornado.
  await ensureInstanceCreated();
  const client = getClient();

  // Tenta reiniciar/inicializar a instância antes de gerar o QR.
  // Instâncias LITE recém-criadas precisam ser "iniciadas" para alocar IP/porta.
  try {
    await client.get(`/v1/instance/restart?instanceId=${WAPI_INSTANCE_ID}`);
  } catch {
    // ignora falhas de restart — o erro real virá no qr-code, se houver
  }

  try {
    const { data } = await client.get(`/v1/instance/qr-code?instanceId=${WAPI_INSTANCE_ID}`);
    // W-API retorna { error, instanceId, qrcode: "data:image/png;base64,..." }
    const qr = data.qrcode || data.qrCode || data.base64 || "";
    if (!qr) {
      // W-API retorna { connected: true } quando a instância já está pareada
      if (data.connected === true) {
        throw new Error("WhatsApp já está conectado. Não é necessário gerar QR Code.");
      }
      throw new Error("W-API retornou QR Code vazio");
    }
    return {
      qrCode: qr,
      base64: qr,
    };
  } catch (err: unknown) {
    const error = err as { response?: { data?: unknown }; message?: string };
    const raw = error.response?.data ? JSON.stringify(error.response.data) : error.message || "";
    console.error("[WAPI] Erro ao obter QR Code:", raw);

    // Mensagem amigável para o erro comum de token/instância inválida
    if (raw.includes("Token inválido") || raw.includes("Invalid token")) {
      throw new Error(
        `Token W-API inválido para ${WAPI_INSTANCE_ID}. ` +
          `create-instance: ${createInstanceLog}. ` +
          `Se a instância foi apagada/resetada no painel, apague-a de fato e deixe o app recriá-la ` +
          `(ou corrija WAPI_TOKEN no .env com o token atual da instância).`
      );
    }
    if (raw.includes("IP ou porta") || raw.includes("IP or port")) {
      const dica = WAPI_API_KEY
        ? "Verifique se a WAPI_API_KEY está correta no .env."
        : "Defina a WAPI_API_KEY (chave da CONTA w-api.app) no .env para criar a instância automaticamente.";
      throw new Error(`Instância W-API ${WAPI_INSTANCE_ID} sem IP/porta. ${dica}`);
    }
    throw new Error(`Falha ao obter QR Code: ${raw}`);
  }
}

/**
 * Reinicia a instância
 * GET /v1/instance/restart?instanceId=X
 */
export async function restartInstance(): Promise<void> {
  const client = getClient();
  await client.get(`/v1/instance/restart?instanceId=${WAPI_INSTANCE_ID}`);
}

/**
 * Envia texto simples
 * POST /v1/message/send-text?instanceId=X
 */
export async function sendText(numero: string, texto: string): Promise<WapiResponse> {
  try {
    const client = getClient();
    const { data } = await client.post(`/v1/message/send-text?instanceId=${WAPI_INSTANCE_ID}`, {
      phone: numero,
      message: texto,
    });
    return { success: true, data };
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } }; message?: string };
    return {
      success: false,
      error: error.response?.data?.message || error.message || "Erro ao enviar texto",
    };
  }
}

/**
 * Envia imagem com legenda
 * Converte URL local para base64 antes de enviar
 */
export async function sendImage(numero: string, imageUrl: string, caption?: string): Promise<WapiResponse> {
  try {
    const client = getClient();
    const imageData = toBase64DataUrl(imageUrl);
    const { data } = await client.post(`/v1/message/send-image?instanceId=${WAPI_INSTANCE_ID}`, {
      phone: numero,
      image: imageData,
      caption: caption || "",
    });
    return { success: true, data };
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } }; message?: string };
    return {
      success: false,
      error: error.response?.data?.message || error.message || "Erro ao enviar imagem",
    };
  }
}

/**
 * Envia áudio como nota de voz (ptt)
 * Converte URL local para base64 antes de enviar
 */
export async function sendAudio(numero: string, audioUrl: string): Promise<WapiResponse> {
  try {
    const client = getClient();
    const audioData = toBase64DataUrl(audioUrl);
    const { data } = await client.post(`/v1/message/send-audio?instanceId=${WAPI_INSTANCE_ID}`, {
      phone: numero,
      audio: audioData,
      ptt: true,
    });
    return { success: true, data };
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } }; message?: string };
    return {
      success: false,
      error: error.response?.data?.message || error.message || "Erro ao enviar áudio",
    };
  }
}

/**
 * Envia presença (digitando/paused)
 * POST /v1/chats/send-presence?instanceId=X
 */
export async function setComposing(numero: string, durationMs: number): Promise<void> {
  try {
    const client = getClient();
    await client.post(`/v1/chats/send-presence?instanceId=${WAPI_INSTANCE_ID}`, {
      phone: numero,
      presence: "composing",
      delay: Math.floor(durationMs / 1000),
    });
  } catch {
    // Silencia erros de composing
  }
}

/**
 * Calcula tempo de digitação baseado no tamanho do texto
 */
export function calcularTempoDigitação(texto: string): number {
  const msPorChar = 50;
  const min = 1500;
  const max = 6000;
  const calculado = texto.length * msPorChar;
  return Math.max(min, Math.min(max, calculado));
}
