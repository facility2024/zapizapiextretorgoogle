/**
 * googleMapsScraper.ts
 * Integração com a API local-business-data (OpenWeb Ninja / RapidAPI)
 * Busca empresas locais e extrai WhatsApp, e-mail e redes sociais.
 */

import axios from "axios";

const BASE_URL = "https://local-business-data.p.rapidapi.com";

function getHeaders() {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) {
    throw new Error("RAPIDAPI_KEY não configurada no servidor (.env)");
  }
  return {
    "X-RapidAPI-Key": apiKey,
    "X-RapidAPI-Host": "local-business-data.p.rapidapi.com",
  };
}

/** Extrai uma mensagem útil de erros do axios/RapidAPI. */
function toApiError(err: unknown): Error {
  const e = err as {
    response?: { status?: number; data?: any };
    message?: string;
  };
  if (e?.response) {
    const status = e.response.status;
    const body = e.response.data;
    const msg =
      body?.message ||
      body?.error?.message ||
      (typeof body === "string" ? body : JSON.stringify(body));
    console.error("[googleMapsScraper] RapidAPI respondeu:", status, JSON.stringify(body));
    return new Error(`RapidAPI ${status}: ${msg || "sem mensagem"}`);
  }
  console.error("[googleMapsScraper] Erro de rede/requisição:", e?.message);
  return e instanceof Error ? e : new Error(String(err));
}

/**
 * Busca empresas no Google Maps por palavra-chave/local.
 * Endpoint: GET /search
 */
export async function searchBusinesses({
  query,
  limit = 20,
  language = "pt",
  region = "br",
}: {
  query: string;
  limit?: number;
  language?: string;
  region?: string;
}) {
  const { data } = await axios
    .get(`${BASE_URL}/search`, {
      headers: getHeaders(),
      params: { query, limit, language, region },
    })
    .catch((e) => {
      throw toApiError(e);
    });

  if (data.status !== "OK") {
    throw new Error(`Erro na busca: ${data.error?.message || "desconhecido"}`);
  }

  return (data.data as unknown[]) || [];
}

/**
 * Busca detalhes completos (e-mails, redes sociais, telefone).
 * Endpoint: GET /business-details (até 20 ids por chamada).
 */
export async function getBusinessDetails(businessIds: string[]) {
  const idsParam = businessIds.join(",");

  const { data } = await axios
    .get(`${BASE_URL}/business-details`, {
      headers: getHeaders(),
      params: {
        business_id: idsParam,
        extract_emails_and_contacts: true,
        language: "pt",
        region: "br",
      },
    })
    .catch((e) => {
      throw toApiError(e);
    });

  if (data.status !== "OK") {
    throw new Error(`Erro ao buscar detalhes: ${data.error?.message || "desconhecido"}`);
  }

  return (Array.isArray(data.data) ? data.data : [data.data]) as unknown[];
}

/** Divide um array em lotes de tamanho `size`. */
export function chunk<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

/** Pausa a execução por `ms` milissegundos (evita estourar rate limit). */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Normaliza um número de telefone para um link direto do WhatsApp. */
const DEFAULT_COUNTRY_CODE = "55";

export function toWhatsappLink(rawPhone?: string): string {
  if (!rawPhone) return "";
  let digits = String(rawPhone).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 11) digits = DEFAULT_COUNTRY_CODE + digits;
  return `https://wa.me/${digits}`;
}

/** Verifica se uma empresa NÃO possui site cadastrado. */
export function hasNoWebsite(business: Record<string, any>): boolean {
  const website = business.website || business.website_url || business.site;
  return !website || website.trim() === "";
}
