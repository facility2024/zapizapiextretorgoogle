/**
 * grupoService.ts
 * Extração de participantes de grupo WhatsApp via W-API (multi-tenant)
 * Credenciais vêm do banco (UserInstance) via usuarioId
 */
import axios from "axios";
import * as XLSX from "xlsx";

export interface CredenciaisWApi {
  instanceId: string;
  token: string;
  baseUrl: string;
}

export interface ParticipanteRaw { id: string; admin?: string; }
export interface ContatoRaw { id: string; notify?: string; verifiedName?: string; }
export interface ParticipanteFinal {
  id: string;
  numero: string;
  admin: string;
  nome: string | null;
}

function getHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// 1. Buscar participantes do grupo
export async function buscarParticipantes(groupId: string, cred: CredenciaisWApi): Promise<ParticipanteRaw[]> {
  if (!cred.instanceId) throw new Error("WAPI_INSTANCE_ID não configurado para este usuário");
  if (!groupId) throw new Error("groupId é obrigatório (formato: 1203...@g.us)");
  if (!groupId.includes("@g.us")) {
    throw new Error(`ID do grupo inválido: "${groupId}". Use o ID @g.us.`);
  }
  const url = `${cred.baseUrl}/v1/group/get-Participants?instanceId=${encodeURIComponent(cred.instanceId)}&groupId=${encodeURIComponent(groupId)}`;
  let res;
  try {
    res = await axios.get(url, { headers: getHeaders(cred.token), timeout: 35000 });
  } catch (e: any) {
    const status = e.response?.status;
    const body = e.response?.data ? JSON.stringify(e.response.data) : e.message;
    if (status === 403) throw new Error(`W-API 403: instância sem permissão para ler grupos. ${body}`);
    if (status === 404) throw new Error(`Grupo não encontrado (404): ${body}`);
    throw new Error(`Erro HTTP ${status || ""}: ${body}`);
  }
  const data: any = res.data;
  if (data.error === true || data.error === "true") throw new Error(`W-API error: ${JSON.stringify(data)}`);
  if (!Array.isArray(data.participants)) throw new Error(`Resposta inesperada da W-API: ${JSON.stringify(data).slice(0,500)}`);
  return data.participants;
}

// 2. Buscar todos os contatos (paginado)
export async function buscarTodosContatos(cred: CredenciaisWApi): Promise<ContatoRaw[]> {
  if (!cred.instanceId) throw new Error("WAPI_INSTANCE_ID não configurado");
  let page = 1;
  const perPage = 100;
  let todos: ContatoRaw[] = [];
  let totalPages = 1;
  do {
    const url = `${cred.baseUrl}/v1/contacts/fetch-contacts?instanceId=${encodeURIComponent(cred.instanceId)}&perPage=${perPage}&page=${page}`;
    const res = await axios.get(url, { headers: getHeaders(cred.token), timeout: 35000 });
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

function determinarPerfil(p: any): string {
  if (p.isSuperAdmin === true || p.isSuperAdmin === "true") return "superadmin";
  if (p.isAdmin === true || p.isAdmin === "true") return "admin";
  const role = String(p.admin || p.rank || p.role || p.adminLevel || "").toLowerCase();
  if (role.includes("super")) return "superadmin";
  if (role && role !== "membro" && role !== "member" && role !== "0" && role !== "false" && role !== "undefined") return "admin";
  return "membro";
}

function chaveNum(pid: string): string {
  return String(pid).split("@")[0].replace(/\D/g, "");
}

async function buscarInfoGrupoAdmins(groupId: string, cred: CredenciaisWApi): Promise<Map<string, string>> {
  const admins = new Map<string, string>();
  try {
    const url = `${cred.baseUrl}/v1/group/get-group-info?instanceId=${encodeURIComponent(cred.instanceId)}&groupId=${encodeURIComponent(groupId)}`;
    const res = await axios.get(url, { headers: getHeaders(cred.token), timeout: 20000 });
    const d: any = res.data;
    const info = d?.data && typeof d.data === "object" ? d.data : d;
    const ow = typeof info?.owner === "object" ? info.owner?._serialized || info.owner?.user : info?.owner;
    if (ow) {
      const key = chaveNum(ow);
      if (key) admins.set(key, "superadmin");
    }
    const participantes: any[] = Array.isArray(info?.participants) ? info.participants : typeof info?.participants === "object" && info.participants ? Object.values(info.participants) : [];
    for (const p of participantes) {
      const rawId = typeof p?.id === "object" ? p.id?._serialized || p.id?.user : p?.id;
      const key = chaveNum(rawId);
      if (!key) continue;
      if (p.isSuperAdmin === true || p.isSuperAdmin === "true") admins.set(key, "superadmin");
      else if (p.isAdmin === true || p.isAdmin === "true") {
        if (!admins.has(key)) admins.set(key, "admin");
      }
    }
  } catch { /* não é fatal */ }
  return admins;
}

// 3. Cruzar participantes + contatos
export async function extrairParticipantesComNome(groupId: string, cred: CredenciaisWApi): Promise<ParticipanteFinal[]> {
  const [participantes, contatos, adminsGrupo] = await Promise.all([
    buscarParticipantes(groupId, cred),
    buscarTodosContatos(cred),
    buscarInfoGrupoAdmins(groupId, cred),
  ]);
  const mapa = new Map(contatos.map(c => [c.id, c]));
  return participantes.map((p: any) => {
    const pid = String(p?.id || p?.jid || p?.phone || "");
    if (!pid) return { id: "", numero: "", admin: "membro", nome: null } as ParticipanteFinal;
    const c = mapa.get(pid);
    return {
      id: pid,
      numero: pid.split("@")[0],
      admin: adminsGrupo.get(chaveNum(pid)) || determinarPerfil(p),
      nome: c?.notify || c?.verifiedName || null,
    };
  }).filter(r => !!r.id);
}

// 4. Normaliza número
export function normalizarNumeroExport(raw: string): string {
  let num = raw.replace(/\D/g, "");
  if (num.startsWith("55") && num.length >= 12) num = num.slice(2);
  if (num.length === 10 && /^\d{2}/.test(num)) {
    num = num.slice(0, 2) + "9" + num.slice(2);
  }
  return num;
}

// 4b. CSV
export function paraCSV(dados: ParticipanteFinal[], semPrefixo = false): string {
  const esc = (v: string | null) => {
    if (v == null) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const linhas = ["id,numero,admin,nome", ...dados.map(r => {
    const num = semPrefixo ? normalizarNumeroExport(r.numero) : r.numero;
    return `${esc(r.id)},${esc(num)},${esc(r.admin)},${esc(r.nome)}`;
  })];
  return linhas.join("\n");
}

// 5. Excel
export function paraExcel(dados: ParticipanteFinal[], semPrefixo = false): Buffer {
  const rows = dados.map(r => {
    const num = semPrefixo ? normalizarNumeroExport(r.numero) : r.numero;
    return { ID: r.id, Numero: num, Admin: r.admin, Nome: r.nome || "" };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 22 }, { wch: 15 }, { wch: 12 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Participantes");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

// Buscar info de um grupo
async function buscarInfoGrupo(groupId: string, cred: CredenciaisWApi): Promise<string | null> {
  try {
    const url = `${cred.baseUrl}/v1/group/get-group-info?instanceId=${encodeURIComponent(cred.instanceId)}&groupId=${encodeURIComponent(groupId)}`;
    const res = await axios.get(url, { headers: getHeaders(cred.token), timeout: 15000 });
    const data: any = res.data;
    return data.subject || data.name || data.groupName || data.data?.subject || null;
  } catch { return null; }
}

// Listar grupos
export async function listarGrupos(cred: CredenciaisWApi): Promise<any[]> {
  const perPage = 100;
  let page = 1;
  let totalPages = 1;
  const grupos: any[] = [];
  try {
    do {
      const url = `${cred.baseUrl}/v1/chats/fetch-chats?instanceId=${encodeURIComponent(cred.instanceId)}&page=${page}&perPage=${perPage}`;
      const res = await axios.get(url, { headers: getHeaders(cred.token), timeout: 35000 });
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

    const semNome = grupos.filter(g => !g.name || g.name === g.id);
    if (semNome.length > 0 && semNome.length <= 30) {
      const LOTE = 5;
      for (let i = 0; i < semNome.length; i += LOTE) {
        const lote = semNome.slice(i, i + LOTE);
        const nomes = await Promise.all(lote.map(g => buscarInfoGrupo(g.id, cred)));
        lote.forEach((g, idx) => { if (nomes[idx]) { g.subject = nomes[idx]; g.name = nomes[idx]; } });
        if (i + LOTE < semNome.length) await new Promise(r => setTimeout(r, 500));
      }
    }
    return grupos;
  } catch (e: any) {
    const status = e.response?.status;
    const body = e.response?.data ? JSON.stringify(e.response.data) : e.message;
    if (status === 403) throw new Error(`W-API 403: sem permissão. Detalhe: ${body}`);
    if (status === 401) throw new Error(`W-API 401 Token inválido. Detalhe: ${body}`);
    throw new Error(`Falha ao listar grupos (${status || "sem status"}): ${body}`);
  }
}
