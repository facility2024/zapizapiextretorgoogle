import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Loader2, Download, AlertCircle, Wifi, WifiOff } from "lucide-react";
import api from "../api";
import { socket } from "../socket";
import type { Resultado } from "./ExtratorGoogle.types";
import * as XLSX from "xlsx";

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

type Coluna = { key: string; label: string };

function temDado(resultados: Resultado[], k: string) {
  return resultados.some((r) => String((r as Record<string, unknown>)[k] ?? "").trim() !== "");
}

function colunasVisiveis(resultados: Resultado[]): Coluna[] {
  return [
    ...COLUNAS_BASE,
    ...COLUNAS_OPCIONAIS.filter((c) => temDado(resultados, c.key)),
  ];
}

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

  const [salvando, setSalvando] = useState(false);
  const [modal, setModal] = useState(false);
  const [nomeCamp, setNomeCamp] = useState("");
  const [msgCamp, setMsgCamp] = useState("");
  const [agendar, setAgendar] = useState(false);
  const [dataAgendamento, setDataAgendamento] = useState("");
  const [campanhaId, setCampanhaId] = useState<string | null>(null);
  const navigate = useNavigate();

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

    const colunas = colunasVisiveis(visiveis);
    const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const linhas = visiveis.map((r) =>
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

  function exportarXLSX() {
    if (visiveis.length === 0) return;

    const colunas = colunasVisiveis(visiveis);
    const dados = visiveis.map((r) => {
      const linha: Record<string, unknown> = {};
      colunas.forEach((c) => {
        linha[c.label] = (r as Record<string, unknown>)[c.key] ?? "";
      });
      return linha;
    });

    const ws = XLSX.utils.json_to_sheet(dados, { header: colunas.map((c) => c.label) });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leads");
    const prefixo =
      filtro === "whatsapp"
        ? "extrator-maps-whatsapp-"
        : filtro === "email"
        ? "extrator-maps-email-"
        : "extrator-maps-";
    XLSX.writeFile(wb, `${prefixo}${Date.now()}.xlsx`);
  }

  async function salvarNoBanco() {
    if (visiveis.length === 0) return;
    setSalvando(true);
    try {
      const { data } = await api.post("/extractor/save", { leads: visiveis, query });
      setErro("");
      window.alert(`${data.total} lead(s) salvos no banco como contatos.`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      setErro(e.response?.data?.error || e.message || "Erro ao salvar leads");
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarCampanha() {
    if (!nomeCamp.trim() || !msgCamp.trim()) {
      setErro("Nome e mensagem são obrigatórios");
      return;
    }
    if (agendar && !dataAgendamento) {
      setErro("Informe a data/hora do agendamento");
      return;
    }
    setSalvando(true);
    try {
      const { data: save } = await api.post("/extractor/save", { leads: visiveis, query });
      const { data: camp } = await api.post("/campaigns", {
        nome: nomeCamp.trim(),
        tipoDisparo: "texto",
        textoMensagem: msgCamp.trim(),
        contatoIds: save.contatoIds,
        agendarPara: agendar ? dataAgendamento : undefined,
      });
      setCampanhaId(camp.id);
      setModal(false);
      setAgendar(false);
      setDataAgendamento("");
      setErro("");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      setErro(e.response?.data?.error || e.message || "Erro ao criar campanha");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">Extrator do Google Maps</h1>
        <p className="text-gray-500 text-sm mt-1">
          Busca empresas locais sem site e extrai WhatsApp e contatos (via OpenStreetMap, gratuito)
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
            Retorna apenas empresas <span className="text-accent-light">sem site</span>, via OpenStreetMap
            (gratuito, sem chave de API). Informe a cidade, ex: "restaurantes em São Paulo".
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

      {campanhaId && (
        <div className="bg-accent/10 border border-accent/30 text-accent-light p-3 rounded-xl text-sm flex items-center justify-between gap-3">
          <span>✅ Campanha criada com sucesso!</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCampanhaId(null)}
              className="px-3 py-1.5 bg-bg-primary border border-gray-700 rounded-lg text-xs hover:border-gray-500 transition-colors"
            >
              Fechar
            </button>
            <button
              onClick={() => navigate("/")}
              className="px-3 py-1.5 bg-accent hover:bg-accent-light text-white rounded-lg text-xs transition-colors"
            >
              Ver no Dashboard
            </button>
          </div>
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
            <div className="flex items-center gap-2">
              <button
                onClick={exportarCSV}
                disabled={visiveis.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-bg-primary border border-gray-700 rounded-lg text-sm hover:border-accent/50 transition-colors disabled:opacity-40"
              >
                <Download className="w-4 h-4" /> Exportar CSV ({visiveis.length})
              </button>
              <button
                onClick={exportarXLSX}
                disabled={visiveis.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-bg-primary border border-gray-700 rounded-lg text-sm hover:border-accent/50 transition-colors disabled:opacity-40"
              >
                <Download className="w-4 h-4" /> Exportar Excel ({visiveis.length})
              </button>
              <button
                onClick={salvarNoBanco}
                disabled={salvando || visiveis.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-bg-primary border border-gray-700 rounded-lg text-sm hover:border-accent/50 transition-colors disabled:opacity-40"
              >
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Salvar no banco
              </button>
              <button
                onClick={() => setModal(true)}
                disabled={visiveis.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-light text-white rounded-lg text-sm transition-colors disabled:opacity-40 shadow-glow-sm"
              >
                Criar campanha
              </button>
            </div>
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

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="neon-card rounded-xl p-6 w-full max-w-lg">
            <h3 className="text-lg font-bold mb-4">
              Criar campanha ({visiveis.length} contatos)
            </h3>
            <label className="text-xs text-gray-400">Nome da campanha</label>
            <input
              value={nomeCamp}
              onChange={(e) => setNomeCamp(e.target.value)}
              placeholder="Ex: Lojas Tijuca - WhatsApp"
              className="w-full mt-1 mb-3 bg-bg-primary border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
            <label className="text-xs text-gray-400">Mensagem</label>
            <textarea
              value={msgCamp}
              onChange={(e) => setMsgCamp(e.target.value)}
              rows={4}
              placeholder="Olá {{nome}}, tudo bem? ..." 
              className="w-full mt-1 mb-1 bg-bg-primary border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none resize-none"
            />
            <p className="text-[11px] text-gray-500 mb-4">
              Variáveis disponíveis: {"{{nome}}"}, {"{{email}}"}, {"{{endereco}}"}, {"{{categoria}}"}…
            </p>

            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer select-none mb-2">
              <input
                type="checkbox"
                checked={agendar}
                onChange={(e) => setAgendar(e.target.checked)}
                className="accent-[#A855F7]"
              />
              Agendar envio (horário de Brasília)
            </label>
            {agendar && (
              <input
                type="datetime-local"
                value={dataAgendamento}
                onChange={(e) => setDataAgendamento(e.target.value)}
                className="w-full mb-4 bg-bg-primary border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setModal(false)}
                className="px-4 py-2 bg-bg-primary border border-gray-700 rounded-lg text-sm hover:border-gray-500 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarCampanha}
                disabled={salvando}
                className="px-4 py-2 bg-accent hover:bg-accent-light text-white rounded-lg text-sm transition-colors disabled:opacity-40"
              >
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar campanha"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
