import { useEffect, useState } from "react";
import { Settings, Loader2, Check } from "lucide-react";
import api from "../api";

export default function Configuracoes() {
  const [keys, setKeys] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/config/geoapify");
        setKeys(data.keys || "");
      } catch {
        // ignora — usuário pode digitar do zero
      }
    })();
  }, []);

  async function salvar() {
    setLoading(true);
    setMsg("");
    setErro("");
    try {
      const { data } = await api.post("/config/geoapify", { keys });
      setMsg(`${data.total} chave(s) Geoapify salva(s) com sucesso.`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      setErro(e.response?.data?.error || e.message || "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-gray-500 text-sm mt-1">
          Defina as chaves do Geoapify (extrator). Uma chave por linha ou separadas por vírgula.
        </p>
      </div>

      {erro && (
        <div className="bg-red-400/10 border border-red-400/30 text-red-400 p-3 rounded-xl text-sm flex items-center gap-2">
          {erro}
        </div>
      )}
      {msg && (
        <div className="bg-accent/10 border border-accent/30 text-accent-light p-3 rounded-xl text-sm flex items-center gap-2">
          <Check className="w-4 h-4" /> {msg}
        </div>
      )}

      <div className="neon-card rounded-xl p-6 space-y-4">
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
            Crie chaves grátis em https://myprojects.geoapify.com/ (3.000 req/dia por projeto). O extrator
            rotaciona entre as chaves para multiplicar a cota. As chaves ficam salvas no <span className="text-gray-400">banco de dados</span> e
            persistem nas atualizações do sistema (não precisam ser reinseridas).
          </p>
        </div>

        <button
          onClick={salvar}
          disabled={loading}
          className="px-6 py-3 bg-accent hover:bg-accent-light disabled:opacity-40 rounded-lg font-semibold flex items-center gap-2 transition-all shadow-glow-sm"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4" />}
          {loading ? "Salvando…" : "Salvar chaves"}
        </button>
      </div>
    </div>
  );
}
