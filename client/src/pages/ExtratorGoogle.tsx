import { useState } from "react";
import { Search, Loader2, Download, AlertCircle } from "lucide-react";
import api from "../api";

interface Resultado {
  nome: string;
  telefone: string;
  whatsapp: string;
  email: string;
  gmail: string;
  endereco: string;
  categoria: string;
  avaliacao: string;
  qtd_avaliacoes: string;
  facebook: string;
  instagram: string;
  linkedin: string;
  tiktok: string;
  twitter: string;
  google_maps_url: string;
  site: string;
}

export default function ExtratorGoogle() {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);

  async function buscar() {
    if (!query.trim()) {
      setErro("Digite um termo de busca");
      return;
    }
    setLoading(true);
    setErro("");
    try {
      const { data } = await api.post("/extractor/search", { query: query.trim(), limit });
      const lista: Resultado[] = data.resultados || [];
      setResultados(lista);
      if (lista.length === 0) {
        setErro("Nenhuma empresa sem site encontrada para este termo.");
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      setErro(e.response?.data?.error || e.message || "Erro ao buscar");
      setResultados([]);
    } finally {
      setLoading(false);
    }
  }

  function exportarCSV() {
    if (resultados.length === 0) return;
    const headers = [
      "Nome", "Telefone", "Link WhatsApp", "E-mails", "Gmail", "Endereço",
      "Categoria", "Avaliação", "Qtd Avaliações", "Facebook", "Instagram",
      "LinkedIn", "TikTok", "Twitter", "Google Maps", "Site",
    ];
    const escape = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const linhas = resultados.map((r) =>
      [
        r.nome, r.telefone, r.whatsapp, r.email, r.gmail, r.endereco,
        r.categoria, r.avaliacao, r.qtd_avaliacoes, r.facebook, r.instagram,
        r.linkedin, r.tiktok, r.twitter, r.google_maps_url, r.site,
      ]
        .map(escape)
        .join(",")
    );
    const csv = "﻿" + headers.join(",") + "\n" + linhas.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `extrator-maps-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">Extrator do Google Maps</h1>
        <p className="text-gray-500 text-sm mt-1">
          Busca empresas locais sem site e extrai WhatsApp, e-mail e redes sociais (via RapidAPI)
        </p>
      </div>

      {erro && (
        <div className="bg-red-400/10 border border-red-400/30 text-red-400 p-3 rounded-xl text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {erro}
        </div>
      )}

      <div className="bg-bg-card border border-gray-800 rounded-xl p-6">
        <div className="flex flex-col md:flex-row gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscar()}
            placeholder='Ex: restaurantes em São Paulo, "salão de beleza"'
            className="flex-1 bg-bg-primary border border-gray-700 rounded-lg px-4 py-3 text-sm focus:border-accent focus:outline-none"
          />
          <input
            type="number"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            min={1}
            max={100}
            className="w-24 bg-bg-primary border border-gray-700 rounded-lg px-3 py-3 text-sm focus:border-accent focus:outline-none"
          />
          <button
            onClick={buscar}
            disabled={loading}
            className="px-6 py-3 bg-accent hover:bg-accent-light disabled:opacity-40 rounded-lg font-semibold flex items-center gap-2 transition-all shadow-glow-sm"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Buscar
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Retorna apenas empresas <span className="text-accent-light">sem site</span>. Configure a{" "}
          <code>RAPIDAPI_KEY</code> no servidor.
        </p>
      </div>

      {resultados.length > 0 && (
        <div className="bg-bg-card border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              {resultados.length} empresas encontradas
            </h2>
            <button
              onClick={exportarCSV}
              className="flex items-center gap-2 px-4 py-2 bg-bg-primary border border-gray-700 rounded-lg text-sm hover:border-accent/50 transition-colors"
            >
              <Download className="w-4 h-4" /> Exportar CSV
            </button>
          </div>
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-bg-card">
                <tr className="border-b border-gray-800 text-gray-500">
                  <th className="text-left py-2 px-3">Nome</th>
                  <th className="text-left py-2 px-3">Telefone</th>
                  <th className="text-left py-2 px-3">WhatsApp</th>
                  <th className="text-left py-2 px-3">E-mail</th>
                  <th className="text-left py-2 px-3">Endereço</th>
                  <th className="text-left py-2 px-3">Categoria</th>
                  <th className="text-left py-2 px-3">Avaliação</th>
                  <th className="text-left py-2 px-3">Instagram</th>
                  <th className="text-left py-2 px-3">Facebook</th>
                </tr>
              </thead>
              <tbody>
                {resultados.map((r, i) => (
                  <tr key={i} className="border-b border-gray-800/50 hover:bg-bg-primary/40">
                    <td className="py-2 px-3 text-white">{r.nome}</td>
                    <td className="py-2 px-3 font-mono">{r.telefone}</td>
                    <td className="py-2 px-3">
                      {r.whatsapp ? (
                        <a
                          href={r.whatsapp}
                          target="_blank"
                          rel="noreferrer"
                          className="text-green-400 hover:underline"
                        >
                          {r.whatsapp.replace("https://wa.me/", "")}
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-2 px-3 text-accent-light">{r.email || "-"}</td>
                    <td className="py-2 px-3 text-gray-400">{r.endereco || "-"}</td>
                    <td className="py-2 px-3 text-gray-400">{r.categoria || "-"}</td>
                    <td className="py-2 px-3 text-gray-400">{r.avaliacao || "-"}</td>
                    <td className="py-2 px-3 text-gray-400">{r.instagram || "-"}</td>
                    <td className="py-2 px-3 text-gray-400">{r.facebook || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
