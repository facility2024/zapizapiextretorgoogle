/**
 * timezone.ts
 * Helpers de fuso horário — todas as datas de agendamento são tratadas como
 * horário de Brasília (America/Sao_Paulo, UTC-3, sem horário de verão).
 */

const FUSO_BRASILIA = "America/Sao_Paulo";

/**
 * Retorna o deslocamento do fuso Brasília em relação a UTC (ms).
 * Positivo quando o local está "atrás" de UTC (ex.: UTC-3 → +3h).
 * Usa Intl para ser robusto a mudanças de fuso; cai para -3h se indisponível.
 */
function offsetBrasiliaMs(ref: Date): number {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: FUSO_BRASILIA,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const map: Record<string, number> = {};
    for (const p of dtf.formatToParts(ref)) {
      if (p.type !== "literal" && p.value !== undefined) map[p.type] = Number(p.value);
    }
    const asUTC = Date.UTC(map.year, map.month - 1, map.day, map.hour, map.minute, map.second);
    return ref.getTime() - asUTC;
  } catch {
    return 3 * 3600 * 1000; // fallback: BRT (UTC-3)
  }
}

/**
 * Interpreta uma string "YYYY-MM-DDTHH:mm" (ou com segundos) como horário de
 * Brasília e retorna um Date em UTC correspondente (pronto para persistir).
 */
export function parseBrasilia(local: string): Date {
  const [datePart, timePartRaw = "00:00"] = local.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm, ssRaw] = timePartRaw.split(":").map(Number);
  const ss = Number.isFinite(ssRaw) ? ssRaw : 0;
  const wallClockUTC = Date.UTC(y, m - 1, d, hh, mm, ss);
  return new Date(wallClockUTC - offsetBrasiliaMs(new Date(wallClockUTC)));
}

/**
 * Formata uma data (UTC) para exibição no horário de Brasília: "DD/MM/AAAA HH:mm"
 */
export function formatBrasilia(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_BRASILIA,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Retorna a data/hora atual de Brasília no formato "YYYY-MM-DDTHH:mm"
 * (para usar em <input type="datetime-local">).
 */
export function agoraBrasiliaLocalString(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_BRASILIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date())
    .replace(", ", "T");
  return parts;
}
