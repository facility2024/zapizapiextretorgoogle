import { useEffect, useState } from "react";
import { Search, Loader2, Download, AlertCircle, Wifi, WifiOff } from "lucide-react";
import { socket } from "../socket";
import type { Resultado } from "./ExtratorGoogle.types";

export default function ExtratorGoogle() {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [filtro, setFiltro] = useState<"todos" | "whatsapp" | "email">("todos");
  const [progresso, setProgresso] = useState<{ done: number; total: number } | null>(null);

  const comWhatsapp = resultados.filter((r) => r.whatsapp.trim() !== "").length;
  const comEmail = resultados.filter((r) => r.email.trim() !== "").length;
  const comInstagram = resultados.filter((r) => r.instagram.trim() !== "").length;
  const comFacebook = resultados.filter((r) => r.facebook.trim() !== "").length;

  const visiveis =
    filtro === "whatsapp"
      ? resultados.filter((r) => r.whatsapp.trim() !== "")
      : filtro === "email"
      ? resultados.filter((r) => r.email.trim() !== "")
      : resultados;

  useEffect(() => {
    const onStatus = (d: { message?: string }) => {
      setStatusMsg(d.message || "");
    };
    const onResult = (r: Resultado) => {
      setResultados((prev) => [...prev, r]);
    };
    const onProgress = (p: { done: number; total: number }) => {
      setProgresso(p);
    };
    const onDone = () => {
      setLoading(false);
      setProgresso(null);
      if (resultados.length === 0) {
        setErro("Nenhuma empresa sem site encontrada para este termo.");
      }
    };
    const onError = (d: { message?: string }) => {
      setErro(d.message || "Erro ao buscar");
      setLoading(false);
      setProgresso(null);
      setResultados([]);
    };

    socket.on("extractor:status", onStatus);
    socket.on("extractor:result", onResult);
    socket.on("extractor:progress", onProgress);
    socket.on("extractor:done", onDone);
    socket.on("extractor:error", onError);

    return () => {
      socket.off("extractor:status", onStatus);
      socket.off("extractor:result", onResult);
      socket.off("extractor:progress", onProgress);
      socket.off("extractor:done", onDone);
      socket.off("extractor:error", onError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultados.length]);

  function buscar() {
    if (!query.trim()) {
      setErro("Digite um termo de busca");
      return;
    }
    setLoading(true);
    setErro("");
    setStatusMsg("Iniciando extração…");
    setResultados([]);
    setProgresso(null);
    socket.emit("extractor:search", { query: query.trim(), limit });
  }

  function exportarCSV() {
    if (visiveis.length === 0) return;

    const COLUNAS_BASE = [
      { key: "nome", label: "Nome" },
      { key: "telefone", label: "Telefone" },
      { key: "whatsapp", label: "Link WhatsApp" },
      { key: "endereco", label: "Endereço" },
      { key: "categoria", label: "Categoria" },
      { key: "avaliacao", label: "Avaliação" },
      { key: "qtd_avaliacoes", label: "Qtd Avaliações" },
      { key: "google_maps_url", label: "Google Maps" },
      { key: "site", label: "Site" },
    ] as const;

    const COLUNAS_OPCIONAIS = [
      { key: "email", label: "E-mails" },
      { key: "gmail", label: "Gmail" },
      { key: "facebook", label: "Facebook" },
      { key: "instagram", label: "Instagram" },
      { key: "linkedin", label: "LinkedIn" },
      { key: "tiktok", label: "TikTok" },
      { key: "twitter", label: "Twitter" },
    ] as const;

    const temDado = (k: string) =>
      resultados.some((r) => String((r as Record<string, unknown>)[k] ?? "").trim() !== "");

    const colunas = [
      ...COLUNAS_BASE,
      ...COLUNAS_OPCIONAIS.filter((c) => temDado(c.key)),
    ];

    const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const linhas = resultados.map((r) =>
      colunas.map((c) => escape((r as Record<string, unknown>)[c.key])).join(",")
    );

    const csv = "﻿" + colunas.map((c) => c.label).join(",") + "\n" + linhas.join("\n");
    const prefixo =
      filtro === "whatsapp"
        ? "extrator-maps-whatsapp-"
        : filtro === "email"
        ? "extrator-maps-email-"
        : "extrator-maps-";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${prefixo}${Date.now()}.csv`;
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

      <div className="neon-card rounded-xl p-6">
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
            {loading ? "Extraindo…" : "Buscar"}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Retorna apenas empresas <span className="text-accent-light">sem site</span>. Configure a{" "}
          <code>RAPIDAPI_KEY</code> no servidor.
        </p>
      </div>

      {loading && (
        <div className="neon-card rounded-xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-gray-300">
            <Loader2 className="w-4 h-4 animate-spin text-accent" />
            <span>{statusMsg || "Processando…"}</span>
          </div>
          {progresso && (
            <span className="text-xs text-gray-500 font-display tabular-nums">
              {progresso.done}/{progresso.total}
            </span>
          )}
        </div>
      )}

      {resultados.length > 0 && (
        <div className="neon-card rounded-xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              <span className="flex items-center gap-2">
                <Wifi className="w-4 h-4 text-accent" />
                {resultados.length} empresas encontradas
              </span>
            </h2>
            <button
              onClick={exportarCSV}
              disabled={visiveis.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-bg-primary border border-gray-700 rounded-lg text-sm hover:border-accent/50 transition-colors disabled:opacity-40"
            >
              <Download className="w-4 h-4" /> Exportar CSV ({visiveis.length})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            {(
              [
                { key: "todos", label: "Todos" },
                { key: "whatsapp", label: `Com WhatsApp (${comWhatsapp})` },
                { key: "email", label: `Com E-mail (${comEmail})` },
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                onClick={() => setFiltro(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                  filtro === f.key
                    ? "bg-accent/20 text-accent-light border-accent/40"
                    : "bg-bg-primary text-gray-400 border-gray-700 hover:border-gray-500"
                }`}
              >
                {f.label}
              </button>
            ))}
            <span className="text-xs text-gray-500 ml-auto">
              Instagram: {comInstagram} · Facebook: {comFacebook}
            </span>
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
                {visiveis.map((r, i) => (
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
          {loading && (
            <p className="text-xs text-gray-500 mt-3 flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> recebendo resultados em tempo real…
            </p>
          )}
        </div>
      )}
    </div>
  );
}
