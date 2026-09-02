import { useState } from "react";
import { Users, Download, Search, Loader2 } from "lucide-react";
import api from "../api";

interface Participante {
  id: string;
  numero: string;
  admin: string;
  nome: string | null;
}

export default function Grupos() {
  const [groupId, setGroupId] = useState("");
  const [dados, setDados] = useState<Participante[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buscar() {
    if (!groupId.trim()) { setError("Informe o ID do grupo (ex: 1203...@g.us)"); return; }
    setLoading(true); setError(null); setDados([]);
    try {
      const { data } = await api.get("/grupos/participantes", { params: { groupId: groupId.trim() }, timeout: 60000 });
      setDados(data.participantes || []);
      if ((data.participantes || []).length === 0) setError("Nenhum participante retornado. Verifique se o groupId está correto e a instância está conectada.");
    } catch (e: any) {
      const msg = e.response?.data?.error || e.message || "Erro ao buscar participantes";
      setError(msg);
    } finally { setLoading(false); }
  }

  function baixarCSV() {
    if (!groupId.trim() || dados.length === 0) return;
    // usa token do localStorage para download autenticado via fetch
    const token = localStorage.getItem("zapizapi_token") || localStorage.getItem("token") || "";
    // fallback: tenta via api com blob
    api.get("/grupos/export", { params: { groupId: groupId.trim() }, responseType: "blob", timeout: 60000 }).then(res => {
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = `participantes_${groupId.split("@")[0]}.csv`; a.click();
      URL.revokeObjectURL(url);
    }).catch((e: any) => {
      setError(e.response?.data?.error || e.message || "Erro ao exportar CSV");
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="w-6 h-6 text-accent" /> Extração de Grupos</h1>
        <p className="text-gray-500 text-sm mt-1">Extraia participantes de um grupo WhatsApp via W-API e exporte em CSV</p>
      </div>

      <div className="bg-bg-card border border-gray-800 rounded-xl p-6 space-y-4">
        <label className="text-sm text-gray-400">ID do grupo</label>
        <div className="flex gap-2">
          <input
            value={groupId}
            onChange={e => setGroupId(e.target.value)}
            placeholder="12012345666643082066@g.us"
            className="flex-1 px-4 py-3 rounded-xl bg-bg-primary border border-gray-800 text-white placeholder:text-gray-500 focus:outline-none focus:border-accent"
          />
          <button onClick={buscar} disabled={loading} className="px-6 py-3 bg-accent hover:bg-accent-light disabled:opacity-50 rounded-xl font-medium flex items-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {loading ? "Buscando..." : "Extrair"}
          </button>
        </div>
        <p className="text-xs text-gray-600">W-API: <code>GET /v1/group/get-Participants?instanceId=...&groupId=...</code> + <code>/v1/contacts/fetch-contacts</code> (paginado, cruza por <code>id</code>)</p>
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
