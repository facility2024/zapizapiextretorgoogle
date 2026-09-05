/**
 * grupoService.ts
 * Extração de participantes de grupo WhatsApp via W-API
 * Combina get-Participants + fetch-contacts (paginado) e exporta CSV
 */
import "dotenv/config";
import axios from "axios";
import * as XLSX from "xlsx";

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
  // valida formato - nome puro não funciona, precisa @g.us
  if (!groupId.includes("@g.us")) {
    throw new Error(`ID do grupo inválido: "${groupId}". Use o ID @g.us (ex: 1203...@g.us). Selecione o grupo na lista acima, não digite o nome "Pack Master".`);
  }
  const url = `${BASE_URL}/v1/group/get-Participants?instanceId=${encodeURIComponent(instanceId)}&groupId=${encodeURIComponent(groupId)}`;
  let res;
  try {
    res = await axios.get(url, { headers: getHeaders(), timeout: 35000 });
  } catch (e: any) {
    const status = e.response?.status;
    const body = e.response?.data ? JSON.stringify(e.response.data) : e.message;
    if (status === 403) throw new Error(`W-API 403 Forbidden: instância sem permissão para ler grupos (plano LITE pode não ter get-Participants). Detalhe: ${body}`);
    if (status === 404) throw new Error(`Grupo não encontrado (404): verifique se o ID ${groupId} existe e a instância participa dele. ${body}`);
    throw new Error(`Erro HTTP ${status || ""}: ${body}`);
  }
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

// Detecta o perfil do participante na resposta da W-API.
// Alvos comuns do get-Participants: isSuperAdmin/isAdmin (boolean), p.admin/p.rank/p.role (string).
function determinarPerfil(p: any): string {
  if (p.isSuperAdmin === true || p.isSuperAdmin === "true") return "superadmin";
  if (p.isAdmin === true || p.isAdmin === "true") return "admin";
  const role = String(p.admin || p.rank || p.role || p.adminLevel || "").toLowerCase();
  if (role.includes("super")) return "superadmin";
  if (role && role !== "membro" && role !== "member" && role !== "0" && role !== "false" && role !== "undefined") return "admin";
  return "membro";
}

// 3. Cruzar participantes + contatos
export async function extrairParticipantesComNome(groupId: string): Promise<ParticipanteFinal[]> {
  const [participantes, contatos] = await Promise.all([
    buscarParticipantes(groupId),
    buscarTodosContatos(),
  ]);
  const mapa = new Map(contatos.map(c => [c.id, c]));
  return participantes.map((p: any) => {
    const pid = String(p?.id || p?.jid || p?.phone || "");
    if (!pid) return { id: "", numero: "", admin: "membro", nome: null } as ParticipanteFinal;
    const c = mapa.get(pid);
    return {
      id: pid,
      numero: pid.split("@")[0],
      admin: determinarPerfil(p),
      nome: c?.notify || c?.verifiedName || null,
    };
  }).filter(r => !!r.id);
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

// 5. Excel
export function paraExcel(dados: ParticipanteFinal[]): Buffer {
  const rows = dados.map(r => ({ ID: r.id, Numero: r.numero, Admin: r.admin, Nome: r.nome || "" }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 22 }, { wch: 15 }, { wch: 12 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Participantes");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

// Buscar info de um grupo específico (nome/subject)
async function buscarInfoGrupo(groupId: string): Promise<string | null> {
  const instanceId = getInstanceId();
  if (!instanceId) return null;
  try {
    const url = `${BASE_URL}/v1/group/get-group-info?instanceId=${encodeURIComponent(instanceId)}&groupId=${encodeURIComponent(groupId)}`;
    const res = await axios.get(url, { headers: getHeaders(), timeout: 15000 });
    const data: any = res.data;
    return data.subject || data.name || data.groupName || data.data?.subject || null;
  } catch {
    return null;
  }
}

// Listar grupos da instância via /v1/chats/fetch-chats (endpoint real da W-API)
// Filtra apenas chats com @g.us e pagina até totalPages
export async function listarGrupos(): Promise<any[]> {
  const instanceId = getInstanceId();
  const perPage = 100;
  let page = 1;
  let totalPages = 1;
  const grupos: any[] = [];
  try {
    do {
      const url = `${BASE_URL}/v1/chats/fetch-chats?instanceId=${encodeURIComponent(instanceId)}&page=${page}&perPage=${perPage}`;
      const res = await axios.get(url, { headers: getHeaders(), timeout: 35000 });
      const data: any = res.data;
      if (data.error === true) throw new Error(JSON.stringify(data));
      const chats: any[] = Array.isArray(data.chats) ? data.chats : Array.isArray(data) ? data : [];
      for (const c of chats) {
        if (c.id && String(c.id).includes("@g.us")) {
          grupos.push({
            id: c.id,
            subject: c.name || c.subject || c.groupName || c.pushName || c.formattedName || c.id,
            name: c.name || c.subject || c.groupName || null,
            size: c.participantsCount,
          });
        }
      }
      totalPages = Number(data.totalPages) || 1;
      page++;
      if (page <= totalPages && grupos.length < 500) await new Promise(r => setTimeout(r, 200));
      else break;
      if (page > 10) break;
    } while (page <= totalPages);

    // Para grupos sem nome, busca o nome via get-group-info (máx 20 por vez, com limite de concorrência)
    const semNome = grupos.filter(g => !g.name || g.name === g.id);
    if (semNome.length > 0 && semNome.length <= 30) {
      const LOTE = 5;
      for (let i = 0; i < semNome.length; i += LOTE) {
        const lote = semNome.slice(i, i + LOTE);
        const nomes = await Promise.all(lote.map(g => buscarInfoGrupo(g.id)));
        lote.forEach((g, idx) => {
          if (nomes[idx]) {
            g.subject = nomes[idx];
            g.name = nomes[idx];
          }
        });
        if (i + LOTE < semNome.length) await new Promise(r => setTimeout(r, 500));
      }
    }

    return grupos;
  } catch (e: any) {
    const status = e.response?.status;
    const body = e.response?.data ? JSON.stringify(e.response.data) : e.message;
    console.warn("[GRUPO] listarGrupos falhou:", status, body, "instanceId:", instanceId);
    if (status === 403) throw new Error(`W-API 403: sem permissão para listar grupos. Verifique se a instância ${instanceId} é PRO e está conectada. Detalhe: ${body}`);
    if (status === 401) throw new Error(`W-API 401 Token inválido para ${instanceId}. Detalhe: ${body}`);
    throw new Error(`Falha ao listar grupos (${status || "sem status"}): ${body}`);
  }
}
