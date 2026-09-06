import { useEffect, useState, FormEvent } from "react";
import { Shield, Users, Key, Plus, Trash2, Loader2, CheckCircle, XCircle, Calendar } from "lucide-react";
import api from "../api";

interface Usuario {
  id: string;
  email: string;
  nome: string | null;
  whatsapp: string | null;
  role: string;
  createdAt: string;
  licencas: { dataExpiracao: string; ativo: boolean }[];
  instancias: { wapiInstanceId: string; conectado: boolean }[];
}

interface Dashboard {
  totalUsuarios: number;
  licencasAtivas: number;
  totalCampanhas: number;
  totalEnvios: number;
}

export default function Admin() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Form novo usuário
  const [novoEmail, setNovoEmail] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [novoWhats, setNovoWhats] = useState("");
  const [criando, setCriando] = useState(false);

  // Form licença
  const [licUsuarioId, setLicUsuarioId] = useState("");
  const [licDias, setLicDias] = useState(30);
  const [criandoLic, setCriandoLic] = useState(false);

  async function carregar() {
    setLoading(true);
    try {
      const [uRes, dRes] = await Promise.all([
        api.get("/admin/usuarios"),
        api.get("/admin/dashboard"),
      ]);
      setUsuarios(uRes.data.usuarios || []);
      setDashboard(dRes.data);
    } catch (e: any) {
      setErro(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  async function criarUsuario(e: FormEvent) {
    e.preventDefault();
    setCriando(true);
    setErro(null);
    try {
      await api.post("/admin/usuarios", { email: novoEmail, senha: novaSenha, nome: novoNome, whatsapp: novoWhats });
      setNovoEmail(""); setNovaSenha(""); setNovoNome(""); setNovoWhats("");
      await carregar();
    } catch (e: any) {
      setErro(e.response?.data?.error || e.message);
    } finally {
      setCriando(false);
    }
  }

  async function criarLicenca(e: FormEvent) {
    e.preventDefault();
    if (!licUsuarioId) return;
    setCriandoLic(true);
    setErro(null);
    try {
      await api.post("/admin/licencas", { usuarioId: licUsuarioId, dias: licDias });
      setLicUsuarioId(""); setLicDias(30);
      await carregar();
    } catch (e: any) {
      setErro(e.response?.data?.error || e.message);
    } finally {
      setCriandoLic(false);
    }
  }

  async function deletarUsuario(id: string) {
    if (!confirm("Tem certeza? Isso deleta todos os dados do usuário.")) return;
    try {
      await api.delete(`/admin/usuarios/${id}`);
      await carregar();
    } catch (e: any) {
      setErro(e.response?.data?.error || e.message);
    }
  }

  async function toggleLicenca(id: string, ativo: boolean) {
    try {
      await api.patch(`/admin/licencas/${id}`, { ativo: !ativo });
      await carregar();
    } catch (e: any) {
      setErro(e.response?.data?.error || e.message);
    }
  }

  function formatarData(d: string) {
    return new Date(d).toLocaleDateString("pt-BR");
  }

  if (loading) return <div className="flex items-center gap-2 text-gray-400 p-8"><Loader2 className="w-5 h-5 animate-spin" /> Carregando painel admin...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Shield className="w-6 h-6 text-accent" /> Painel Admin</h1>

      {erro && <div className="bg-red-400/10 border border-red-400/30 text-red-400 p-3 rounded-xl text-sm">{erro}</div>}

      {/* Dashboard */}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Usuários", valor: dashboard.totalUsuarios, icon: <Users className="w-5 h-5" /> },
            { label: "Licenças Ativas", valor: dashboard.licencasAtivas, icon: <Key className="w-5 h-5" /> },
            { label: "Campanhas", valor: dashboard.totalCampanhas, icon: <CheckCircle className="w-5 h-5" /> },
            { label: "Envios Total", valor: dashboard.totalEnvios, icon: <XCircle className="w-5 h-5" /> },
          ].map((item) => (
            <div key={item.label} className="bg-bg-card border border-gray-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">{item.icon} {item.label}</div>
              <div className="text-2xl font-bold text-accent">{item.valor}</div>
            </div>
          ))}
        </div>
      )}

      {/* Criar usuário */}
      <div className="bg-bg-card border border-gray-800 rounded-xl p-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2"><Plus className="w-4 h-4" /> Criar Usuário</h2>
        <form onSubmit={criarUsuario} className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Nome" className="bg-bg-primary border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
          <input value={novoEmail} onChange={e => setNovoEmail(e.target.value)} type="email" placeholder="Email" required className="bg-bg-primary border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
          <input value={novaSenha} onChange={e => setNovaSenha(e.target.value)} type="password" placeholder="Senha" required className="bg-bg-primary border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
          <input value={novoWhats} onChange={e => setNovoWhats(e.target.value)} placeholder="WhatsApp" className="bg-bg-primary border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
          <button type="submit" disabled={criando} className="bg-accent hover:bg-accent-light disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2">
            {criando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Criar
          </button>
        </form>
      </div>

      {/* Criar licença */}
      <div className="bg-bg-card border border-gray-800 rounded-xl p-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2"><Key className="w-4 h-4" /> Criar Licença</h2>
        <form onSubmit={criarLicenca} className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-gray-400 mb-1 block">Usuário</label>
            <select value={licUsuarioId} onChange={e => setLicUsuarioId(e.target.value)} required className="w-full bg-bg-primary border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
              <option value="">Selecione...</option>
              {usuarios.filter(u => u.role !== "admin").map(u => (
                <option key={u.id} value={u.id}>{u.nome || u.email}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Dias</label>
            <input type="number" value={licDias} onChange={e => setLicDias(Number(e.target.value))} min={1} className="w-24 bg-bg-primary border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
          </div>
          <button type="submit" disabled={criandoLic || !licUsuarioId} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2">
            {criandoLic ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />} Ativar
          </button>
        </form>
      </div>

      {/* Lista de usuários */}
      <div className="bg-bg-card border border-gray-800 rounded-xl p-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2"><Users className="w-4 h-4" /> Usuários ({usuarios.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-500 border-b border-gray-800">
              <tr>
                <th className="text-left py-2 px-2">Nome</th>
                <th className="text-left py-2 px-2">Email</th>
                <th className="text-left py-2 px-2">WhatsApp</th>
                <th className="text-left py-2 px-2">Instância</th>
                <th className="text-left py-2 px-2">Licença</th>
                <th className="text-left py-2 px-2">Criado em</th>
                <th className="text-right py-2 px-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map(u => {
                const lic = u.licencas[0];
                const inst = u.instancias[0];
                const licAtiva = lic && lic.ativo && new Date(lic.dataExpiracao) > new Date();
                return (
                  <tr key={u.id} className="border-b border-gray-800/50">
                    <td className="py-2 px-2">{u.nome || "—"}</td>
                    <td className="py-2 px-2">{u.email}</td>
                    <td className="py-2 px-2">{u.whatsapp || "—"}</td>
                    <td className="py-2 px-2">
                      {inst ? (
                        <span className={`px-2 py-1 rounded-full text-xs ${inst.conectado ? "bg-emerald-500/20 text-emerald-400" : "bg-gray-800 text-gray-400"}`}>
                          {inst.wapiInstanceId.slice(0, 8)}... {inst.conectado ? "●" : "○"}
                        </span>
                      ) : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="py-2 px-2">
                      {u.role === "admin" ? (
                        <span className="px-2 py-1 rounded-full text-xs bg-accent/20 text-accent-light">Admin</span>
                      ) : licAtiva ? (
                        <span className="px-2 py-1 rounded-full text-xs bg-emerald-500/20 text-emerald-400">
                          <Calendar className="w-3 h-3 inline mr-1" />{formatarData(lic.dataExpiracao)}
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs bg-red-500/20 text-red-400">Sem licença</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-gray-500">{formatarData(u.createdAt)}</td>
                    <td className="py-2 px-2 text-right">
                      {u.role !== "admin" && (
                        <button onClick={() => deletarUsuario(u.id)} className="text-red-400 hover:text-red-300 p-1" title="Deletar">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
