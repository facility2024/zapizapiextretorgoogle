import { useEffect, useState } from "react";
import { Settings, Loader2, Check, Link2, Key } from "lucide-react";
import api from "../api";

export default function Configuracoes() {
  const [keys, setKeys] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");

  // W-API credentials
  const [wapiInstanceId, setWapiInstanceId] = useState("");
  const [wapiToken, setWapiToken] = useState("");
  const [wapiApiKey, setWapiApiKey] = useState("");
  const [wapiBaseUrl, setWapiBaseUrl] = useState("https://api.w-api.app");
  const [wapiLoading, setWapiLoading] = useState(false);
  const [wapiMsg, setWapiMsg] = useState("");
  const [wapiErro, setWapiErro] = useState("");
  const [wapiConectado, setWapiConectado] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/config/geoapify");
        setKeys(data.keys || "");
      } catch (err: any) {
        setErro("Erro ao carregar chaves: " + (err.response?.data?.error || err.message));
      }
      try {
        const { data } = await api.get("/instances/minha-instancia");
        if (data.instancia) {
          setWapiInstanceId(data.instancia.wapiInstanceId || "");
          setWapiBaseUrl(data.instancia.wapiBaseUrl || "https://api.w-api.app");
          setWapiConectado(data.instancia.conectado || false);
        }
      } catch { /* ignora */ }
    })();
  }, []);

  async function salvarGeoapify() {
    setLoading(true); setMsg(""); setErro("");
    try {
      const { data } = await api.post("/config/geoapify", { keys });
      setMsg(`${data.total} chave(s) Geoapify salva(s) com sucesso.`);
    } catch (err: any) {
      setErro(err.response?.data?.error || err.message || "Erro ao salvar");
    } finally { setLoading(false); }
  }

  async function salvarWapi(e: React.FormEvent) {
    e.preventDefault();
    setWapiLoading(true); setWapiMsg(""); setWapiErro("");
    try {
      const { data } = await api.post("/instances/minha-instancia", {
        wapiInstanceId, wapiToken, wapiApiKey: wapiApiKey || undefined, wapiBaseUrl,
      });
      setWapiConectado(data.conectado);
      setWapiMsg("Credenciais W-API salvas com sucesso!");
    } catch (err: any) {
      setWapiErro(err.response?.data?.error || err.message || "Erro ao salvar");
    } finally { setWapiLoading(false); }
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-gray-500 text-sm mt-1">
          Configure suas credenciais W-API e chaves do Geoapify.
        </p>
      </div>

      {/* ─── Credenciais W-API ─────────────────────────────── */}
      <div className="neon-card rounded-xl p-6 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><Link2 className="w-4 h-4 text-accent" /> Instância W-API</h2>
        <p className="text-xs text-gray-500">
          Configure o ID e Token da sua instância W-API. O sistema usará essas credenciais para conectar ao WhatsApp.
        </p>

        {wapiErro && <div className="bg-red-400/10 border border-red-400/30 text-red-400 p-3 rounded-xl text-sm">{wapiErro}</div>}
        {wapiMsg && <div className="bg-accent/10 border border-accent/30 text-accent-light p-3 rounded-xl text-sm flex items-center gap-2"><Check className="w-4 h-4" /> {wapiMsg}</div>}

        <form onSubmit={salvarWapi} className="space-y-3">
          <div>
            <label className="text-xs text-gray-400">Instance ID</label>
            <input
              value={wapiInstanceId}
              onChange={e => setWapiInstanceId(e.target.value)}
              placeholder="FD2A1Q-ZMM3LU-NFLZW0"
              required
              className="w-full mt-1 bg-bg-primary border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">Token da Instância</label>
            <input
              type="password"
              value={wapiToken}
              onChange={e => setWapiToken(e.target.value)}
              placeholder="Cole o token da instância"
              required
              className="w-full mt-1 bg-bg-primary border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">API Key da Conta (opcional)</label>
            <input
              type="password"
              value={wapiApiKey}
              onChange={e => setWapiApiKey(e.target.value)}
              placeholder="WAPI-XXXX-XXXX-XXXX"
              className="w-full mt-1 bg-bg-primary border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">Base URL</label>
            <input
              value={wapiBaseUrl}
              onChange={e => setWapiBaseUrl(e.target.value)}
              className="w-full mt-1 bg-bg-primary border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={wapiLoading}
              className="px-6 py-3 bg-accent hover:bg-accent-light disabled:opacity-40 rounded-lg font-semibold flex items-center gap-2 transition-all"
            >
              {wapiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
              {wapiLoading ? "Salvando..." : "Salvar Credenciais"}
            </button>
            {wapiConectado && (
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Conectado
              </span>
            )}
          </div>
        </form>
      </div>

      {/* ─── Geoapify Keys ─────────────────────────────────── */}
      <div className="neon-card rounded-xl p-6 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><Settings className="w-4 h-4 text-accent" /> Chaves Geoapify</h2>

        {erro && <div className="bg-red-400/10 border border-red-400/30 text-red-400 p-3 rounded-xl text-sm flex items-center gap-2">{erro}</div>}
        {msg && <div className="bg-accent/10 border border-accent/30 text-accent-light p-3 rounded-xl text-sm flex items-center gap-2"><Check className="w-4 h-4" /> {msg}</div>}

        <div>
          <label className="text-xs text-gray-400">Chaves do Geoapify (GEOAPIFY_KEY)</label>
          <textarea
            value={keys}
            onChange={(e) => setKeys(e.target.value)}
            rows={6}
            placeholder={"Cole uma ou mais chaves, uma por linha ou separadas por vírgula:\nadc0ca05f77546fa9b9f5325fdfe548a\noutra-chave-2, outra-chave-3"}
            className="w-full mt-1 bg-bg-primary border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono focus:border-accent focus:outline-none resize-none"
          />
          <p className="text-[11px] text-gray-500 mt-1">
            Crie chaves grátis em https://myprojects.geoapify.com/ (3.000 req/dia por projeto).
          </p>
        </div>

        <button
          onClick={salvarGeoapify}
          disabled={loading}
          className="px-6 py-3 bg-accent hover:bg-accent-light disabled:opacity-40 rounded-lg font-semibold flex items-center gap-2 transition-all shadow-glow-sm"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4" />}
          {loading ? "Salvando..." : "Salvar chaves"}
        </button>
      </div>
    </div>
  );
}
