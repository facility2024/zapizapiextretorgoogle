/**
 * overpassScraper.ts
 * Extrator de empresas locais via OpenStreetMap — GRATUITO e sem chave de API.
 *
 * Fluxo:
 *   1. Nominatim geocodifica a região (ex: "São Paulo") -> bounding box.
 *   2. Overpass busca POIs cujas tags correspondem à categoria (restaurante, salão…).
 *   3. Filtra os que NÃO têm site e mapeia para o formato Resultado.
 *
 * Não retorna e-mails/social de scraping (os dados vêm das tags OSM, quando existirem).
 */

import axios from "axios";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

export interface Resultado {
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

/** Tags OSM onde costuma aparecer a categoria do negócio. */
const TAGS_CATEGORIA = [
  "name",
  "amenity",
  "shop",
  "tourism",
  "office",
  "craft",
  "leisure",
  "healthcare",
  "cuisine",
  "trade",
];

interface Area {
  bbox?: [number, number, number, number]; // [south, west, north, east]
  center?: { lat: number; lon: number };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseQuery(query: string): { termo: string; local: string } {
  const m = query.match(/^(.*?)\s+em\s+(.+)$/i);
  if (m) return { termo: m[1].trim(), local: m[2].trim() };
  return { termo: query.trim(), local: "" };
}

async function geocodificar(local: string): Promise<Area> {
  try {
    const { data } = await axios.get(NOMINATIM_URL, {
      params: { format: "jsonv2", limit: 1, q: local },
      headers: { "User-Agent": "zapizapi/1.0 (extrator openstreetmap)" },
      timeout: 15000,
    });
    const item = Array.isArray(data) ? data[0] : null;
    if (!item) return {};
    const bb = item.boundingbox;
    if (Array.isArray(bb) && bb.length === 4) {
      const [south, north, west, east] = bb.map(Number);
      if ([south, north, west, east].every((n) => Number.isFinite(n))) {
        return { bbox: [south, west, north, east] };
      }
    }
    if (item.lat && item.lon) {
      return { center: { lat: Number(item.lat), lon: Number(item.lon) } };
    }
  } catch {
    // ignora e retorna vazio
  }
  return {};
}

function buildQuery(kw: string, area: Area): string {
  const areaClause = area.bbox
    ? `(${area.bbox[0]},${area.bbox[1]},${area.bbox[2]},${area.bbox[3]})`
    : area.center
    ? `(around:9000,${area.center.lat},${area.center.lon})`
    : "";
  const regex = escapeRegex(kw);
  const unions = TAGS_CATEGORIA.map(
    (tag) => `  nwr["${tag}"~"${regex}",i]${areaClause};`
  ).join("\n");
  return `[out:json][timeout:25];
(
${unions}
);
out center;`;
}

async function fetchOverpass(query: string): Promise<any[]> {
  let lastErr: unknown;
  for (const url of OVERPASS_URLS) {
    try {
      const { data } = await axios.post(
        url,
        `data=${encodeURIComponent(query)}`,
        { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 35000 }
      );
      return (data && Array.isArray(data.elements) ? data.elements : []) as any[];
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("Falha ao consultar o Overpass");
}

/** Normaliza telefone para link direto do WhatsApp (DDI 55 quando ausente). */
export function toWhatsappLink(rawPhone?: string): string {
  if (!rawPhone) return "";
  let digits = String(rawPhone).replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.length <= 11 && !digits.startsWith("55")) digits = "55" + digits;
  return `https://wa.me/${digits}`;
}

function mapElement(el: any): Resultado | null {
  const t = el.tags || {};
  const nome = (t.name || "").toString().trim();
  const telefone = (t.phone || t["contact:phone"] || t.tel || "").toString().trim();
  if (!nome && !telefone) return null;

  const emailBruto = [t.email, t["contact:email"]].filter(Boolean).map(String);
  const email = emailBruto.join(" | ");

  const site = (t.website || t["contact:website"] || "").toString().trim();
  const categoria =
    t.amenity || t.shop || t.tourism || t.office || t.craft || t.leisure || t.healthcare || t.cuisine || "";

  const rua = `${t["addr:housenumber"] ? t["addr:housenumber"] + " " : ""}${t["addr:street"] || ""}`.trim();
  const localidade = t["addr:suburb"] || t["addr:district"] || t["addr:city"] || t["addr:town"] || "";
  const endereco = [rua, localidade].filter(Boolean).join(", ");

  const osmUrl =
    el.type && el.id ? `https://www.openstreetmap.org/${el.type}/${el.id}` : "";

  return {
    nome,
    telefone,
    whatsapp: toWhatsappLink(telefone),
    email,
    gmail: emailBruto.find((e) => e.toLowerCase().includes("gmail.com")) || "",
    endereco,
    categoria: categoria.toString(),
    avaliacao: "",
    qtd_avaliacoes: "",
    facebook: (t["contact:facebook"] || t.facebook || "").toString(),
    instagram: (t["contact:instagram"] || t.instagram || "").toString(),
    linkedin: (t["contact:linkedin"] || "").toString(),
    tiktok: (t["contact:tiktok"] || "").toString(),
    twitter: (t["contact:twitter"] || t.twitter || "").toString(),
    google_maps_url: osmUrl,
    site: site || "(sem site)",
  };
}

/**
 * Busca empresas locais sem site para um termo (ex: "restaurantes em São Paulo").
 * Retorna no máximo `limit` resultados.
 */
export async function buscarEmpresasSemSite(query: string, limit = 20): Promise<Resultado[]> {
  const { termo, local } = parseQuery(query);
  const area = await geocodificar(local || termo);
  if (!area.bbox && !area.center) {
    throw new Error(
      "Não foi possível localizar a região. Inclua uma cidade na busca, ex: 'restaurantes em São Paulo'."
    );
  }

  const elements = await fetchOverpass(buildQuery(termo, area));
  const todas = elements.map(mapElement).filter((r): r is Resultado => r !== null);

  // Prioriza empresas sem site (o objetivo do extrator); se não houver nenhuma, retorna as demais.
  const semSite = todas.filter((e) => !e.site || e.site === "(sem site)");
  const base = semSite.length > 0 ? semSite : todas;

  // Dedupe por nome+telefone
  const vistos = new Set<string>();
  const unicas = base.filter((e) => {
    const chave = `${e.nome}|${e.telefone}`.toLowerCase();
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });

  return unicas.slice(0, Math.max(1, limit));
}
