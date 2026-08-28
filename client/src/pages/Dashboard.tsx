import { useEffect, useState, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Send, AlertTriangle, CheckCircle, Wifi, WifiOff, Loader2, CalendarClock, Play, Pencil, X } from "lucide-react";
import api from "../api";
import { socket } from "../socket";

interface SystemStatus {
  enviadosHoje: number;
  naFila: number;
  comErro: number;
  totalCampanhas: number;
  agendadas: number;
  conectado: boolean;
  filaProcessando: boolean;
  filaPausado: boolean;
  tamanhoFila: number;
}

interface CampaignUpdate {
  campanhaId: string;
  contatoId: string;
  status: string;
  erro?: string;
  timestamp: string;
}

interface CampanhaAgendada {
  id: string;
  nome: string;
  agendarPara: string;
  totalContatos: number;
}

function formatarBrasilia(iso: string): string {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/* Animação de count-up quando o valor muda (via WebSocket/polling) */
function useCountUp(value: number, duration = 700) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    const to = value;
    if (from === to) {
      setDisplay(to);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else prev.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return display;
}

function StatNumber({ value }: { value: number }) {
  const display = useCountUp(value);
  return <span className="font-display tabular-nums">{display}</span>;
}

export default function Dashboard() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [updates, setUpdates] = useState<CampaignUpdate[]>([]);
  const [agendadas, setAgendadas] = useState<CampanhaAgendada[]>([]);
  const [iniciandoId, setIniciandoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarStatus();
    carregarAgendadas();

    socket.on("campaign-update", (data: CampaignUpdate) => {
      setUpdates((prev) => [data, ...prev].slice(0, 50));
      carregarStatus();
    });

    const interval = setInterval(() => {
      carregarStatus();
      carregarAgendadas();
    }, 10000);
    return () => {
      socket.off("campaign-update");
      clearInterval(interval);
    };
  }, []);

  async function carregarStatus() {
    try {
      const { data } = await api.get("/campaigns/system/status");
      setStatus(data);
    } catch {
      // Silencia erro de conexão
    } finally {
      setLoading(false);
    }
  }

  async function carregarAgendadas() {
    try {
      const { data } = await api.get("/campaigns");
      setAgendadas(
        (data as (CampanhaAgendada & { status: string })[]).filter(
          (c) => c.status === "agendada" && c.agendarPara
        )
      );
    } catch {
      // Silencia erro
    }
  }

  async function iniciarAgora(id: string) {
    setIniciandoId(id);
    try {
      await api.post(`/campaigns/${id}/start`);
      carregarAgendadas();
    } catch {
      // Silencia erro
    } finally {
      setIniciandoId(null);
    }
  }

  async function editarAgendamento(c: CampanhaAgendada) {
    const novo = window.prompt(
      "Nova data/hora (formato AAAA-MM-DDTHH:mm, horário de Brasília):",
      c.agendarPara ? new Date(c.agendarPara).toISOString().slice(0, 16) : ""
    );
    if (!novo) return;
    try {
      await api.post(`/campaigns/${c.id}/reschedule`, { agendarPara: novo });
      carregarAgendadas();
    } catch {
      // Silencia erro
    }
  }

  async function cancelarAgendamento(id: string) {
    if (!window.confirm("Cancelar o agendamento desta campanha?")) return;
    try {
      await api.post(`/campaigns/${id}/unschedule`);
      carregarAgendadas();
    } catch {
      // Silencia erro
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Visão geral dos seus envios</p>
      </div>

      {/* Cards de status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          titulo="Enviados Hoje"
          valor={<StatNumber value={status?.enviadosHoje ?? 0} />}
          icon={<Send className="w-5 h-5" />}
          cor="text-green-400"
          bg="bg-green-400/10"
          glow="glow-green"
          dur="5s"
        />
        <Card
          titulo="Na Fila"
          valor={<StatNumber value={status?.naFila ?? 0} />}
          icon={<Loader2 className="w-5 h-5" />}
          cor="text-accent-light"
          bg="bg-accent/10"
          glow="glow-purple"
          dur="6s"
        />
        <Card
          titulo="Com Erro"
          valor={<StatNumber value={status?.comErro ?? 0} />}
          icon={<AlertTriangle className="w-5 h-5" />}
          cor="text-red-400"
          bg="bg-red-400/10"
          glow="glow-red"
          dur="7s"
        />
        <Card
          titulo="Conexão"
          valor={
            <span className="flex items-center gap-2">
              <span className={`conn-dot ${status?.conectado ? "conn-dot--online" : "conn-dot--offline"}`} />
              {status?.conectado ? "Online" : "Offline"}
            </span>
          }
          icon={status?.conectado ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
          cor={status?.conectado ? "text-green-400" : "text-red-400"}
          bg={status?.conectado ? "bg-green-400/10" : "bg-red-400/10"}
          glow="glow-purple"
          dur="6s"
        />
      </div>

      {/* Campanhas agendadas */}
      {agendadas.length > 0 && (
        <div className="neon-card rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-accent" />
            Campanhas Agendadas ({agendadas.length})
          </h2>
          <div className="space-y-2">
            {agendadas.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 bg-bg-primary rounded-lg">
                <div>
                  <p className="text-sm font-medium">{c.nome}</p>
                  <p className="text-xs text-gray-500">
                    {c.totalContatos} contatos · {formatarBrasilia(c.agendarPara)} (Brasília)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => iniciarAgora(c.id)}
                    disabled={iniciandoId === c.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/20 text-accent-light border border-accent/30 rounded-lg text-xs hover:bg-accent/30 transition-colors disabled:opacity-40"
                  >
                    {iniciandoId === c.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    Iniciar
                  </button>
                  <button
                    onClick={() => editarAgendamento(c)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-bg-primary border border-gray-700 rounded-lg text-xs text-gray-300 hover:border-gray-500 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Editar
                  </button>
                  <button
                    onClick={() => cancelarAgendamento(c.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400 hover:bg-red-500/20 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    Cancelar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status da fila */}
      {status?.filaProcessando && (
        <div className="neon-card rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-accent animate-spin" />
              <span className="text-sm">
                Fila processando — {status.tamanhoFila} contatos restantes
                {status.filaPausado && <span className="text-yellow-400 ml-2">(Pausado)</span>}
              </span>
            </div>
          </div>
          {/* Barra de progresso */}
          <div className="mt-3 h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent to-accent-light transition-all duration-500"
              style={{
                width: `${status.totalCampanhas > 0 ? ((status.enviadosHoje / (status.enviadosHoje + status.tamanhoFila)) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Últimas atualizações */}
      {updates.length > 0 && (
        <div className="neon-card rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">Atividade em Tempo Real</h2>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {updates.map((u, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-800/50 last:border-0">
                <div className="flex items-center gap-2">
                  <StatusDot status={u.status} />
                  <span className="text-gray-400">{u.contatoId.slice(0, 8)}...</span>
                </div>
                <span className={u.status === "enviado" ? "text-green-400" : u.status === "erro" ? "text-red-400" : "text-accent-light"}>
                  {u.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ titulo, valor, icon, cor, bg, glow, dur }: { titulo: string; valor: ReactNode; icon: ReactNode; cor: string; bg: string; glow?: string; dur?: string }) {
  return (
    <div className={`neon-card rounded-xl p-4 ${glow ?? ""}`} style={{ "--dur": dur ?? "6s" } as CSSProperties}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-500 uppercase tracking-wider">{titulo}</span>
        <div className={`${bg} ${cor} p-2 rounded-lg`}>{icon}</div>
      </div>
      <p className={`text-2xl font-bold ${cor}`}>{valor}</p>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const cor = status === "enviado" ? "bg-green-400" : status === "erro" ? "bg-red-400" : status === "enviando" ? "bg-accent animate-pulse" : "bg-gray-500";
  return <span className={`w-2 h-2 rounded-full ${cor}`} />;
}
