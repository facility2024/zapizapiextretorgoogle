import { useState, FormEvent } from "react";
import { MessageSquare, Loader2 } from "lucide-react";
import api, { TOKEN_STORAGE_KEY } from "../api";

export default function Login({ onAuthed }: { onAuthed: (token: string) => void }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      const { data } = await api.post<{ token: string }>("/auth/login", { email, senha });
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      onAuthed(data.token);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      setErro(e.response?.data?.error || e.message || "Falha ao entrar");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
      <div className="noise-overlay" aria-hidden />
      <div className="relative z-10 w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="logo-pulse w-16 h-16 rounded-2xl bg-accent/20 flex items-center justify-center mb-4">
            <MessageSquare className="w-8 h-8 text-accent-light" />
          </div>
          <h1 className="text-2xl font-bold text-white">Zapizapi</h1>
          <p className="text-sm text-gray-500">Acesse sua conta</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-bg-secondary border border-gray-800 rounded-2xl p-6 space-y-4"
        >
          <div>
            <label className="block text-xs text-gray-500 mb-1">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              className="w-full bg-bg-primary border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Senha</label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••"
              required
              className="w-full bg-bg-primary border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-accent"
            />
          </div>

          {erro && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={carregando}
            className="w-full bg-accent hover:bg-accent/90 disabled:opacity-60 text-white font-medium rounded-lg py-2.5 text-sm flex items-center justify-center gap-2 transition-colors"
          >
            {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}
