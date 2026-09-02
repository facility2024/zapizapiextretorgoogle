import { useEffect, useState } from "react";
import { Users, Download, Search, Loader2, Link2 } from "lucide-react";
import api from "../api";

interface Participante {
  id: string;
  numero: string;
  admin: string;
  nome: string | null;
}
interface GrupoOpt { id: string; subject?: string; name?: string; size?: number; }

function extrairIdDeLink(input: string): string | null {
  const s = input.trim();
  // já é ID direto
  if (s.includes("@g.us")) return s;
  // link convite https://chat.whatsapp.com/ABC123 -> não dá pra converter sem API extra, avisa
  if (s.includes("chat.whatsapp.com/")) return null;
  // só números? tenta assumir que é ID sem @g.us
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

  useEffect(() => {
    async function carregar() {
      setLoadingGrupos(true);
      try {
        const { data } = await api.get("/grupos", { timeout: 40000 });
        const lista: GrupoOpt[] = data.grupos || [];
        // normaliza id/subject
        const norm = lista.map((g: any) => ({
          id: g.id || g.groupId || g.jid || "",
          subject: g.subject || g.name || g.groupName || g.id,
          size: g.size || g.participantsCount,
        })).filter(g => g.id.includes("@g.us"));
        setGrupos(norm);
      } catch {
        // sem lista, deixa input manual
      } finally { setLoadingGrupos(false); }
    }
    carregar();
  }, []);

  async function buscar() {
    let id = groupId.trim();
    // aceita link/nome colado e tenta converter
    const conv = extrairIdDeLink(id);
    if (id.includes("chat.whatsapp.com")) {
      setError("Link de convite (chat.whatsapp.com) não é o ID do grupo. Selecione o grupo na lista acima ou use o ID @g.us. No WhatsApp: abra o grupo > Dados do grupo > o ID aparece ao convidar (ou use a lista).");
      return;
    }
    if (!id) { setError("Selecione um grupo na lista ou cole o ID (ex: 12012345666643082066@g.us)"); return; }
    if (!id.includes("@g.us")) {
      // se digitou só nome, avisa
      if (!/^\d/.test(id)) { setError("Digite o ID do grupo, não o nome. Escolha na lista acima ou cole o ID @g.us"); return; }
      if (conv) id = conv;
    }
    setLoading(true); setError(null); setDados([]);
    try {
      const { data } = await api.get("/grupos/participantes", { params: { groupId: id }, timeout: 60000 });
      setDados(data.participantes || []);
      if ((data.participantes || []).length === 0) setError("Nenhum participante retornado. Verifique se o groupId está correto e a instância está conectada.");
    } catch (e: any) {
      const msg = e.response?.data?.error || e.message || "Erro ao buscar participantes";
      setError(msg);
    } finally { setLoading(false); }
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="w-6 h-6 text-accent" /> Extração de Grupos</h1>
        <p className="text-gray-500 text-sm mt-1">Escolha o grupo pelo <b>nome</b> ou cole o <b>ID/link</b> — extraímos participantes e exportamos CSV</p>
      </div>

      <div className="bg-bg-card border border-gray-800 rounded-xl p-6 space-y-4">
        <label className="text-sm text-gray-400 flex items-center gap-2">
          Grupo WhatsApp
          {loadingGrupos && <Loader2 className="w-3 h-3 animate-spin" />}
        </label>

        {grupos.length > 0 ? (
          <select
            value={groupId}
            onChange={e => setGroupId(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-bg-primary border border-gray-800 text-white focus:outline-none focus:border-accent"
          >
            <option value="">— Selecione um grupo —</option>
            {grupos.map(g => (
              <option key={g.id} value={g.id}>{g.subject} — {g.id} {g.size ? `(${g.size})` : ""}</option>
            ))}
          </select>
        ) : (
          <div className="text-xs text-gray-500">{loadingGrupos ? "Carregando grupos da instância..." : "Nenhum grupo listado (instância desconectada ou W-API sem fetch-groups). Use o campo abaixo."}</div>
        )}

        <div className="flex items-center gap-2 text-xs text-gray-600"><span className="h-px flex-1 bg-gray-800" /> ou cole ID/link <span className="h-px flex-1 bg-gray-800" /></div>

        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              value={groupId}
              onChange={e => setGroupId(e.target.value)}
              placeholder='120123456...@g.us  ou  https://chat.whatsapp.com/ABC...'
              className="w-full pl-9 pr-4 py-3 rounded-xl bg-bg-primary border border-gray-800 text-white placeholder:text-gray-500 focus:outline-none focus:border-accent"
            />
          </div>
          <button onClick={buscar} disabled={loading} className="px-6 py-3 bg-accent hover:bg-accent-light disabled:opacity-50 rounded-xl font-medium flex items-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {loading ? "Buscando..." : "Extrair"}
          </button>
        </div>
        <p className="text-xs text-gray-600">W-API usa <code>@g.us</code>. Link <code>chat.whatsapp.com</code> não funciona direto — selecione na lista. O nome sozinho também não funciona, precisa do ID.</p>
        {error && <div className="bg-red-400/10 border border-red-400/30 text-red-400 p-3 rounded-xl text-sm">{error}</div>}
      </div>

      {dados.length > 0 && (
        <div className="bg-bg-card border border-gray-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{dados.length} participantes</h2>
            <button onClick={baixarCSV} className="px-4 py-2 bg-accent hover:bg-accent-light rounded-xl text-sm font-medium flex items-center gap-2">
              <Download className="w-4 h-4" /> Baixar CSV
            </button>
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
          <div className="text-xs text-gray-600">CSV: <code>id,numero,admin,nome</code> — numero sem @s.whatsapp.net, admin = superadmin/admin/membro</div>
        </div>
      )}
    </div>
  );
}
