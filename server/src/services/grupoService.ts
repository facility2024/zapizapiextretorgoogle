/**
 * grupoService.ts
 * Extração de participantes de grupo WhatsApp via W-API
 * Combina get-Participants + fetch-contacts (paginado) e exporta CSV
 */
import "dotenv/config";
import axios from "axios";

const BASE_URL = (process.env.WAPI_BASE_URL || "https://api.w-api.app").replace(/\/$/, "");
function getInstanceId() { return process.env.WAPI_INSTANCE_ID || ""; }
function getToken() { return process.env.WAPI_TOKEN || ""; }

function getHeaders() {
  const token = getToken();
  if (!token) throw new Error("WAPI_TOKEN não configurado");
  return { Authorization: `Bearer ${token}` };
}

export interface ParticipanteRaw { id: string; admin?: string; }
export interface ContatoRaw { id: string; notify?: string; verifiedName?: string; }
export interface ParticipanteFinal {
  id: string;
  numero: string;
  admin: string;
  nome: string | null;
}

// 1. Buscar participantes do grupo
export async function buscarParticipantes(groupId: string): Promise<ParticipanteRaw[]> {
  const instanceId = getInstanceId();
  if (!instanceId) throw new Error("WAPI_INSTANCE_ID não configurado");
  if (!groupId) throw new Error("groupId é obrigatório (formato: 1203...@g.us)");
  const url = `${BASE_URL}/v1/group/get-Participants?instanceId=${encodeURIComponent(instanceId)}&groupId=${encodeURIComponent(groupId)}`;
  const res = await axios.get(url, { headers: getHeaders(), timeout: 35000 });
  const data: any = res.data;
  if (data.error === true || data.error === "true") {
    throw new Error(`W-API error: ${JSON.stringify(data)}`);
  }
  if (!Array.isArray(data.participants)) throw new Error(`Resposta inesperada da W-API: ${JSON.stringify(data).slice(0,500)}`);
  return data.participants;
}

// 2. Buscar todos os contatos (paginado)
export async function buscarTodosContatos(): Promise<ContatoRaw[]> {
  const instanceId = getInstanceId();
  if (!instanceId) throw new Error("WAPI_INSTANCE_ID não configurado");
  let page = 1;
  const perPage = 100;
  let todos: ContatoRaw[] = [];
  let totalPages = 1;
  do {
    const url = `${BASE_URL}/v1/contacts/fetch-contacts?instanceId=${encodeURIComponent(instanceId)}&perPage=${perPage}&page=${page}`;
    const res = await axios.get(url, { headers: getHeaders(), timeout: 35000 });
    const data: any = res.data;
    if (data.error === true || data.error === "true") throw new Error(`W-API error page ${page}: ${JSON.stringify(data)}`);
    if (!Array.isArray(data.contacts)) throw new Error(`Resposta inesperada contacts page ${page}: ${JSON.stringify(data).slice(0,500)}`);
    todos = todos.concat(data.contacts);
    totalPages = Number(data.totalPages) || 1;
    page++;
    if (page <= totalPages) await new Promise(r => setTimeout(r, 300));
  } while (page <= totalPages);
  return todos;
}

// 3. Cruzar participantes + contatos
export async function extrairParticipantesComNome(groupId: string): Promise<ParticipanteFinal[]> {
  const [participantes, contatos] = await Promise.all([
    buscarParticipantes(groupId),
    buscarTodosContatos(),
  ]);
  const mapa = new Map(contatos.map(c => [c.id, c]));
  return participantes.map(p => {
    const c = mapa.get(p.id);
    return {
      id: p.id,
      numero: p.id.split("@")[0],
      admin: p.admin || "membro",
      nome: c?.notify || c?.verifiedName || null,
    };
  });
}

// 4. CSV
export function paraCSV(dados: ParticipanteFinal[]): string {
  const esc = (v: string | null) => {
    if (v == null) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const linhas = ["id,numero,admin,nome", ...dados.map(r => `${esc(r.id)},${esc(r.numero)},${esc(r.admin)},${esc(r.nome)}`)];
  return linhas.join("\n");
}

// Listar grupos da instância (para preencher select)
export async function listarGrupos(): Promise<any[]> {
  const instanceId = getInstanceId();
  const url = `${BASE_URL}/v1/group/fetch-groups?instanceId=${encodeURIComponent(instanceId)}`;
  try {
    const res = await axios.get(url, { headers: getHeaders(), timeout: 35000 });
    const data: any = res.data;
    if (data.error === true) throw new Error(JSON.stringify(data));
    // W-API varia: { groups: [...] } ou array direto
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.groups)) return data.groups;
    if (Array.isArray(data.data)) return data.data;
    return [];
  } catch (e: any) {
    // se endpoint não existir, retorna vazio e deixa usuário digitar groupId
    console.warn("[GRUPO] listarGrupos falhou:", e.response?.data || e.message);
    return [];
  }
}
