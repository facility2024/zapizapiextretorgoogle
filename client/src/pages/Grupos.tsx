import { useEffect, useState } from "react";
import { Users, Download, Search, Loader2, Link2, RefreshCw, FileSpreadsheet, Trash, ShieldCheck } from "lucide-react";
import api from "../api";

function normalizarParaComparacao(raw: string): string {
  let s = raw.trim().replace(/\D/g, "");
  if (!s.startsWith("55")) s = "55" + s;
  return s;
}

interface Participante {
  id: string;
  numero: string;
  admin: string;
  nome: string | null;
}
interface GrupoOpt { id: string; subject?: string; name?: string; size?: number; }

function extrairIdDeLink(input: string): string | null {
  const s = input.trim();
  if (s.includes("@g.us")) return s;
  if (s.includes("chat.whatsapp.com/")) return null;
  if (/^\d{10,}@g\.us$/.test(s)) return s;
  if (/^\d{10,}$/.test(s) && s.length >= 15) return `${s}@g.us`;
  return null;
}

export default function Grupos() {
  const [groupId, setGroupId] = useState("");
  const [grupos, setGrupos] = useState<GrupoOpt[]>([]);
  const [loadingGrupos, setLoadingGrupos] = useState(false);
  const [dados, setDados] = useState<Participante[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [numerosAdmin, setNumerosAdmin] = useState<string[]>(() => {
    const stored = localStorage.getItem("grupoAdminNumeros");
    return stored ? JSON.parse(stored) : [];
  });
  const [adminRemovidos, setAdminRemovidos] = useState<number>(0);
  const [listaLimpa, setListaLimpa] = useState<Participante[]>([]);

  async function carregarGrupos() {
    setLoadingGrupos(true);
    setError(null);
    try {
      const { data } = await api.get("/grupos", { timeout: 40000 });
      const lista: GrupoOpt[] = data.grupos || [];
      const norm = lista.map((g: any) => ({
        id: g.id || g.groupId || g.jid || "",
        subject: g.subject || g.name || g.groupName || g.id,
        size: g.size || g.participantsCount,
      })).filter(g => g.id.includes("@g.us") && g.subject !== g.id);
      setGrupos(norm);
      if (norm.length === 0) setError("Nenhum grupo encontrado. Verifique se o WhatsApp da instância PRO (FD2A1Q) está conectado e participa de grupos. Clique em Recarregar.");
    } catch (e: any) {
      setError(e.response?.data?.error || "Falha ao carregar lista de grupos. Verifique se a instância PRO está Online.");
    } finally { setLoadingGrupos(false); }
  }

  useEffect(() => { carregarGrupos(); }, []);

  async function buscar(comId?: string) {
    let id = (comId || groupId).trim();
    const conv = extrairIdDeLink(id);
    if (id.includes("chat.whatsapp.com")) {
      setError("Link de convite (chat.whatsapp.com) não é o ID. Clique no grupo na lista acima — o sistema já usa o @g.us correto.");
      return;
    }
    if (!id) { setError("Selecione um grupo na lista ou cole o ID @g.us"); return; }
    if (!id.includes("@g.us")) {
      if (!/^\d/.test(id)) { setError("Selecione o grupo na lista acima. Nome sozinho não funciona, precisa do @g.us"); return; }
      if (conv) id = conv;
    }
    setLoading(true); setError(null); setDados([]); setListaLimpa([]);
    try {
      const { data } = await api.get("/grupos/participantes", { params: { groupId: id }, timeout: 60000 });
      const participantes = data.participantes || [];
      setDados(participantes);
      setGroupId(id);
      if (participantes.length === 0) setError("Nenhum participante retornado. Verifique se o ID está correto e a instância está conectada.");
      // Cria a lista já excluindo os admins: números digitados + admins localizados na extração
      const detectados = participantes.filter(p => p.admin && p.admin !== "membro").map(p => p.numero);
      filtrarComNumeros(participantes, numerosAdmin.concat(detectados));
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || "Erro ao buscar participantes");
      setListaLimpa([]);
    } finally { setLoading(false); }
  }

  function filtrarComNumeros(lista: Participante[], numeros: string[]) {
    const adminsNormalizados = numeros.map(normalizarParaComparacao).filter(Boolean);
    const novaLista = lista.filter(p => {
      const numNormalizado = normalizarParaComparacao(p.numero);
      return !adminsNormalizados.some(admin => numNormalizado.includes(admin));
    });
    setAdminRemovidos(lista.length - novaLista.length);
    setListaLimpa(novaLista);
  }

  function filtrarAdmins() {
    filtrarComNumeros(dados, numerosAdmin);
  }

  // Localiza os admins na extração (W-API retorna o perfil em p.admin),
// preenche o campo e já refaz a lista limpa excluindo-os.
  function localizarAdmins() {
    const adminsDetectados = dados.filter(p => p.admin && p.admin !== "membro");
    if (adminsDetectados.length === 0) {
      setError("Nenhum admin detectado na extração. Digite os números manualmente acima.");
      return;
    }
    const atualizados = Array.from(new Set([...numerosAdmin, ...adminsDetectados.map(p => p.numero)]));
    setNumerosAdmin(atualizados);
    localStorage.setItem("grupoAdminNumeros", JSON.stringify(atualizados));
    filtrarComNumeros(dados, atualizados);
  }

  function baixarCSV() {
    if (!groupId.trim() || dados.length === 0) return;
    let id = groupId.trim();
    const conv = extrairIdDeLink(id);
    if (conv) id = conv;
    api.get("/grupos/export", { params: { groupId: id }, responseType: "blob", timeout: 60000 }).then(res => {
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = `participantes_${id.split("@")[0]}.csv`; a.click();
      URL.revokeObjectURL(url);
    }).catch((e: any) => {
      const blob = e.response?.data;
      if (blob instanceof Blob) blob.text().then(t => { try { const j = JSON.parse(t); setError(j.error || t); } catch { setError(t); } });
      else setError(e.response?.data?.error || e.message || "Erro ao exportar CSV");
    });
  }

  function baixarExcel() {
    if (!groupId.trim() || dados.length === 0) return;
    let id = groupId.trim();
    const conv = extrairIdDeLink(id);
    if (conv) id = conv;
    api.get("/grupos/export-excel", { params: { groupId: id }, responseType: "blob", timeout: 60000 }).then(res => {
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = `participantes_${id.split("@")[0]}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    }).catch((e: any) => {
      const blob = e.response?.data;
      if (blob instanceof Blob) blob.text().then(t => { try { const j = JSON.parse(t); setError(j.error || t); } catch { setError(t); } });
      else setError(e.response?.data?.error || e.message || "Erro ao exportar Excel");
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="w-6 h-6 text-accent" /> Extração de Grupos</h1>
        <p className="text-gray-500 text-sm mt-1">WhatsApp logado → lista todos os grupos automaticamente. Clique no grupo para extrair — sem precisar colar ID/link</p>
      </div>

      <div className="bg-bg-card border border-gray-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-sm text-gray-400 flex items-center gap-2">
            Grupos vinculados ao WhatsApp logado
            {loadingGrupos && <Loader2 className="w-3 h-3 animate-spin" />}
          </label>
          <button onClick={carregarGrupos} disabled={loadingGrupos} className="text-xs px-3 py-1.5 bg-bg-primary border border-gray-700 rounded-lg hover:border-accent flex items-center gap-1.5">
            <RefreshCw className={`w-3 h-3 ${loadingGrupos ? "animate-spin" : ""}`} /> Recarregar
          </button>
        </div>

        {loadingGrupos ? (
          <div className="text-xs text-gray-500 py-4 text-center">Carregando grupos da instância PRO...</div>
        ) : grupos.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[320px] overflow-y-auto pr-1">
              {grupos.map(g => (
                <button
                  key={g.id}
                  onClick={() => buscar(g.id)}
                  className={`text-left p-3 rounded-xl border transition-all ${groupId === g.id ? "bg-accent/20 border-accent" : "bg-bg-primary border-gray-800 hover:border-gray-600"}`}
                >
                  <p className="text-sm font-medium truncate">{g.subject}</p>
                  <p className="text-xs text-gray-500 font-mono truncate">{g.id} {g.size ? `· ${g.size} participantes` : ""}</p>
                </button>
              ))}
            </div>
            <select
              value={groupId}
              onChange={e => setGroupId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-bg-primary border border-gray-800 text-white focus:outline-none focus:border-accent"
            >
              <option value="">— ou selecione na lista acima —</option>
              {grupos.map(g => (
                <option key={g.id} value={g.id}>{g.subject} — {g.id}</option>
              ))}
            </select>
          </>
        ) : (
          <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 p-3 rounded-xl text-sm">
            Nenhum grupo listado. Isso acontece quando a instância está <b>desconectada</b> ou ainda é <b>LITE</b>. Confirme que o Easypanel está com <code>FD2A1Q-ZMM3LU-NFLZW0</code> (PRO) e status <b>Online</b> no Dashboard, depois clique em Recarregar.
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-gray-600"><span className="h-px flex-1 bg-gray-800" /> ou cole ID manualmente <span className="h-px flex-1 bg-gray-800" /></div>

        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              value={groupId}
              onChange={e => setGroupId(e.target.value)}
              placeholder='1201...@g.us  (link chat.whatsapp.com não funciona direto)'
              className="w-full pl-9 pr-4 py-3 rounded-xl bg-bg-primary border border-gray-800 text-white placeholder:text-gray-500 focus:outline-none focus:border-accent"
            />
          </div>
          <button onClick={() => buscar()} disabled={loading} className="px-6 py-3 bg-accent hover:bg-accent-light disabled:opacity-50 rounded-xl font-medium flex items-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {loading ? "Buscando..." : "Extrair"}
          </button>
        </div>
        {error && <div className="bg-red-400/10 border border-red-400/30 text-red-400 p-3 rounded-xl text-sm">{error}</div>}
      </div>

      {dados.length > 0 && (
        <>
        <div className="bg-bg-card border border-gray-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{dados.length} participantes</h2>
            <div className="flex gap-2">
              <button onClick={baixarCSV} className="px-4 py-2 bg-accent hover:bg-accent-light rounded-xl text-sm font-medium flex items-center gap-2">
                <Download className="w-4 h-4" /> Baixar CSV
              </button>
              <button onClick={baixarExcel} className="px-4 py-2 bg-accent hover:bg-accent-light rounded-xl text-sm font-medium flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" /> Baixar Excel
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-500 border-b border-gray-800">
                <tr><th className="text-left py-2 px-2">ID</th><th className="text-left py-2 px-2">Número</th><th className="text-left py-2 px-2">Admin</th><th className="text-left py-2 px-2">Nome</th></tr>
              </thead>
              <tbody>
                {dados.map(p => (
                  <tr key={p.id} className="border-b border-gray-800/50">
                    <td className="py-2 px-2 font-mono text-xs">{p.id}</td>
                    <td className="py-2 px-2">{p.numero}</td>
                    <td className="py-2 px-2"><span className={`px-2 py-1 rounded-full text-xs ${p.admin === "membro" ? "bg-gray-800 text-gray-400" : "bg-accent/20 text-accent-light"}`}>{p.admin}</span></td>
                    <td className="py-2 px-2">{p.nome || <span className="text-gray-600">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-gray-600">CSV: <code>id,numero,admin,nome</code></div>
        </div>
        </>
      )}

      {/* --- Seção: Administrador do Grupo --- */}
        <div className="bg-bg-card border border-gray-800 rounded-xl p-6 space-y-4">
          <h3 className="font-semibold text-sm text-accent mb-4">Administrador do Grupo</h3>

          {dados.length === 0 && (
            <div className="bg-bg-primary/30 border border-gray-800 rounded-xl p-3 text-xs text-gray-500">
              Digite os números de admin acima e extraia o grupo — a lista limpa já sai com os admins excluídos (digitados + localizados automaticamente).
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Números de administrador</label>
              <textarea
                value={numerosAdmin.join("\n")}
                onChange={e => {
                  const texto = e.target.value;
                  // Aceita separador de quebra de linha ou vírgula
                  const valores = texto
                    .split(/[,\n]+/)
                    .map((v: string) => v.trim())
                    .filter((v: string) => v.length > 0);
                  setNumerosAdmin(valores);
                  localStorage.setItem("grupoAdminNumeros", JSON.stringify(valores));
                }}
                placeholder="Digite um ou mais números de admin (um por linha, ou separados por vírgula)"
                className="w-full p-3 rounded-xl bg-bg-primary border border-gray-800 text-white focus:outline-none focus:border-accent resize-y min-h-[80px]"
                rows={3}
              />{" "}
              <span className="text-xs text-gray-500">Aceita formato: +55xxxxx, 55xxxxx, xx xxx-xxxx, @g.us</span>
            </div>

            <div className="space-y-2">
              <button
                onClick={localizarAdmins}
                disabled={dados.length === 0}
                className="w-full py-2.5 px-4 bg-accent-light/20 hover:bg-accent-light/30 text-accent-light rounded-xl text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                title="Detecta automaticamente os admins retornados pela W-API e preenche a lista acima"
              >
                <ShieldCheck className="w-4 h-4" /> Localizar Admins
              </button>
              <button
                onClick={filtrarAdmins}
                disabled={numerosAdmin.length === 0 || dados.length === 0}
                className="w-full py-2.5 px-4 bg-accent hover:bg-accent-light rounded-xl text-sm font-medium flex items-center gap-2 disabled:opacity-50"
              >
                <Trash className="w-4 h-4" /> Filtrar / Remover Admins
              </button>
            </div>
          </div>

          {/* Resumo visual */}
          {dados.length > 0 && (
            <div className="mt-6 p-4 bg-bg-primary/30 rounded-xl border border-accent/20">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="font-medium">Total extraído:</div>
                  <div className="font-bold text-accent">{dados.length}</div>
                </div>
                <div>
                  <div className="font-medium">Total admins informados:</div>
                  <div className="font-bold">{numerosAdmin.length}</div>
                </div>
              </div>
              {dados.some(p => p.admin && p.admin !== "membro") && (
                <div className="mt-2">
                  <div className="font-medium">Admins localizados na extração:</div>
                  <div className="font-bold text-accent-light">{dados.filter(p => p.admin && p.admin !== "membro").length}</div>
                </div>
              )}
              {numerosAdmin.length > 0 && (
                <div className="mt-2">
                  <div className="font-medium">Admins encontrados e removidos:</div>
                  <div className="font-bold text-red-400">{adminRemovidos}</div>
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-gray-800/30">
                <div className="font-medium">Total final (lista limpa):</div>
                <div className="font-bold text-accent">{listaLimpa.length > 0 ? listaLimpa.length : dados.length}</div>
              </div>
            </div>
          )}

          {/* Lista limpa - área de exibição */}
          {dados.length > 0 && (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-gray-500 border-b border-gray-800">
                  <tr><th className="text-left py-2 px-2">ID</th><th className="text-left py-2 px-2">Número</th><th className="text-left py-2 px-2">Nome</th></tr>
                </thead>
                <tbody>
                  {listaLimpa.map(p => (
                    <tr key={p.id} className="border-b border-gray-800/50">
                      <td className="py-2 px-2 font-mono text-xs">{p.id}</td>
                      <td className="py-2 px-2">{p.numero}</td>
                      <td className="py-2 px-2">{p.nome || <span className="text-gray-600">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Ações da lista limpa */}
          {dados.length > 0 && (
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  const csvContent = "id,numero,admin,nome\n" +
                    listaLimpa.map(p => `${p.id},${p.numero},${p.admin},${p.nome || ""}`).join("\n");
                  navigator.clipboard.writeText(csvContent);
                }}
                className="px-4 py-2 bg-bg-primary border border-gray-700 rounded-xl text-sm hover:bg-gray-800 flex items-center gap-2">
                <Download className="w-4 h-4" /> Copiar lista limpa
              </button>
              <button
                onClick={() => {
                  const csvContent = "id,numero,admin,nome\n" +
                    listaLimpa.map(p => `${p.id},${p.numero},${p.admin},${p.nome || ""}`).join("\n");
                  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `participantes_sem_admins_${groupId.split("@")[0]}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="px-4 py-2 bg-accent hover:bg-accent-light rounded-xl text-sm font-medium flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" /> Baixar .csv
              </button>
              <button
                onClick={() => {
                  // TODO: integrar com sistema de campanha existente
                  alert("Funcionalidade 'Usar na Nova Campanha' - integrar com rotas de campanha do sistema");
                }}
                className="px-4 py-2 bg-accent-light hover:bg-accent rounded-xl text-sm font-medium flex items-center gap-2">
                <Link2 className="w-4 h-4" /> Usar na Nova Campanha
              </button>
            </div>
          )}
        </div>
        {/* --- Fim seção Administrador do Grupo --- */}
    </div>
  );
}