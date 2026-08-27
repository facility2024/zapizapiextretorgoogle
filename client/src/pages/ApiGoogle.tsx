import { useState, useEffect } from "react";
import { Key, Plus, Trash2, Power, RefreshCw } from "lucide-react";
import api from "../api";

type ChaveApi = {
  id: string;
  label: string | null;
  ativo: boolean;
  falhas: number;
  ultimoErro: string | null;
  ultimoUso: string | null;
  createdAt: string;
  chave: string;
};

export default function ApiGoogle() {
  const [chaves, setChaves] = useState<ChaveApi[]>([]);
  const [novaChave, setNovaChave] = useState("");
  const [novoLabel, setNovoLabel] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  async function carregar() {
    setCarregando(true);
    setErro("");
    try {
      const { data } = await api.get<{ chaves: ChaveApi[] }>("/apikeys");
      setChaves(data.chaves || []);
    } catch (err: any) {
      setErro(err?.response?.data?.error || "Erro ao carregar chaves");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!novaChave.trim()) return;
    setSalvando(true);
    setErro("");
    setSucesso("");
    try {
      await api.post("/apikeys", { key: novaChave, label: novoLabel || undefined });
      setNovaChave("");
      setNovoLabel("");
      setSucesso("Chave adicionada");
      carregar();
    } catch (err: any) {
      setErro(err?.response?.data?.error || "Erro ao adicionar chave");
    } finally {
      setSalvando(false);
    }
  }

  async function remover(id: string) {
    if (!confirm("Remover esta chave?")) return;
    try {
      await api.delete(`/apikeys/${id}`);
      carregar();
    } catch (err: any) {
      setErro(err?.response?.data?.error || "Erro ao remover");
    }
  }

  async function alternar(id: string, ativo: boolean) {
    try {
      await api.patch(`/apikeys/${id}`, { ativo: !ativo });
      carregar();
    } catch (err: any) {
      setErro(err?.response?.data?.error || "Erro ao atualizar");
    }
  }

  const ativas = chaves.filter((c) => c.ativo).length;

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Key className="w-6 h-6 text-accent-light" />
            API Google
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Cadastre várias chaves da RapidAPI. Quando uma estoura o limite, o sistema pula para a próxima automaticamente.
          </p>
        </div>
        <button
          onClick={carregar}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-bg-card border border-gray-700 hover:border-accent/50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${carregando ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {erro && (
        <div className="bg-red-400/10 border border-red-400/30 text-red-400 p-3 rounded-xl text-sm">{erro}</div>
      )}
      {sucesso && (
        <div className="bg-green-400/10 border border-green-400/30 text-green-400 p-3 rounded-xl text-sm">{sucesso}</div>
      )}

      {/* Resumo */}
      <div className="bg-bg-card border border-gray-800 rounded-xl p-4 flex items-center gap-6">
        <div>
          <p className="text-3xl font-bold text-accent-light">{chaves.length}</p>
          <p className="text-xs text-gray-500">chaves cadastradas</p>
        </div>
        <div>
          <p className="text-3xl font-bold text-green-400">{ativas}</p>
          <p className="text-xs text-gray-500">ativas</p>
        </div>
        <div className="text-xs text-gray-500 ml-auto max-w-xs">
          Se nenhuma chave estiver cadastrada, o sistema usa a <code>RAPIDAPI_KEY</code> do servidor (.env) como fallback.
        </div>
      </div>

      {/* Adicionar */}
      <form onSubmit={adicionar} className="bg-bg-card border border-gray-800 rounded-xl p-6 space-y-3">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Adicionar chave</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="Nome (opcional) — ex: Conta 1"
            value={novoLabel}
            onChange={(e) => setNovoLabel(e.target.value)}
            className="bg-bg-primary border border-gray-700 rounded-lg px-4 py-3 text-sm focus:border-accent focus:outline-none"
          />
          <input
            type="text"
            placeholder="Cole a chave RapidAPI"
            value={novaChave}
            onChange={(e) => setNovaChave(e.target.value)}
            className="md:col-span-2 bg-bg-primary border border-gray-700 rounded-lg px-4 py-3 text-sm font-mono focus:border-accent focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={salvando || !novaChave.trim()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent hover:bg-accent-light disabled:opacity-40 text-sm font-semibold transition-all"
        >
          <Plus className="w-4 h-4" />
          {salvando ? "Salvando…" : "Adicionar chave"}
        </button>
      </form>

      {/* Lista */}
      <div className="bg-bg-card border border-gray-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Chaves</h2>

        {chaves.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma chave cadastrada ainda.</p>
        ) : (
          <div className="space-y-2">
            {chaves.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 p-3 bg-bg-primary rounded-lg border border-gray-800"
              >
                <button
                  onClick={() => alternar(c.id, c.ativo)}
                  title={c.ativo ? "Desativar" : "Ativar"}
                  className={`flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors ${
                    c.ativo
                      ? "bg-green-400/15 text-green-400"
                      : "bg-gray-700/40 text-gray-500"
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  {c.ativo ? "Ativa" : "Inativa"}
                </button>

                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">
                    {c.label || "Sem nome"}{" "}
                    <span className="text-gray-500 font-mono text-xs">{c.chave}</span>
                  </p>
                  {!c.ativo && <p className="text-xs text-gray-600">Desligada — não será usada na rotação</p>}
                  {c.falhas > 0 && (
                    <p className="text-xs text-red-400/80">
                      {c.falhas} falha(s){c.ultimoErro ? `: ${c.ultimoErro}` : ""}
                    </p>
                  )}
                  {c.ativo && c.falhas === 0 && c.ultimoUso && (
                    <p className="text-xs text-gray-600">
                      usada em {new Date(c.ultimoUso).toLocaleString("pt-BR")}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => remover(c.id)}
                  className="text-gray-500 hover:text-red-400 transition-colors p-2"
                  title="Remover"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
