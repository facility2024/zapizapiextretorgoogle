/**
 * geoapifyScraper.ts
 * Extrator de empresas locais — ÚNICA fonte: Geoapify Places API (FREE, sem cartão).
 *
 * Fluxo:
 *   1. Nominatim geocodifica a região (ex: "São Paulo") -> bounding box (gratuito, sem chave).
 *   2. Geoapify Places busca POIs pelo termo dentro da região (3.000 req/dia por projeto).
 *   3. Filtra leads (com WhatsApp, sem site ou com Gmail) ou traz todos os dados.
 *
 * Requer GEOAPIFY_KEY no .env (uma chave de um projeto Geoapify).
 * Observação: a fonte é OpenStreetMap por baixo, então e-mail/redes/avaliações são raros,
 * mas telefone/WhatsApp (o que importa pro disparo) vêm bem. Dados: Powered by Geoapify.
 */

import axios from "axios";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const GEOAPIFY_URL = "https://api.geoapify.com/v2/places";

export interface Resultado {
  nome: string;
  telefone: string;
  whatsapp: string;
  email: string;
  gmail: string;
  endereco: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
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
  lat: string;
  lon: string;
}

/** Normaliza telefone para link direto do WhatsApp (DDI 55 quando ausente). */
export function toWhatsappLink(rawPhone?: string): string {
  if (!rawPhone) return "";
  let digits = String(rawPhone).replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.length <= 11 && !digits.startsWith("55")) digits = "55" + digits;
  return `https://wa.me/${digits}`;
}

interface Area {
  bbox?: [number, number, number, number]; // [south, west, north, east]
  center?: { lat: number; lon: number };
  cidade?: string;
  estado?: string;
}

function parseQuery(query: string): { termo: string; local: string } {
  const m = query.match(
    /^(.*?)\s+(?:em|no|na|nos|nas|no bairro|em bairro|dentro do|dentro da)\s+(.+)$/i
  );
  if (m) return { termo: m[1].trim(), local: m[2].trim() };
  const virgula = query.indexOf(",");
  if (virgula !== -1) {
    return { termo: query.slice(0, virgula).trim(), local: query.slice(virgula + 1).trim() };
  }
  return { termo: query.trim(), local: "" };
}

async function geocodificar(local: string): Promise<Area> {
  try {
    const { data } = await axios.get(NOMINATIM_URL, {
      params: { format: "jsonv2", limit: 1, q: local, countrycodes: "br" },
      headers: { "User-Agent": "zapizapi/1.0 (extrator geoapify)" },
      timeout: 15000,
    });
    const item = Array.isArray(data) ? data[0] : null;
    if (!item) return {};
    const bb = item.boundingbox;
    const addr = item.address || {};
    const displayName = typeof item.display_name === "string" ? item.display_name : "";
    const partes = displayName ? displayName.split(",").map((s: string) => s.trim()) : [];
    const area: Area = {
      cidade: addr.city || addr.town || addr.municipality || partes[0] || "",
      estado: addr.state || addr.state_code || (partes.length >= 2 ? partes[partes.length - 2] : ""),
    };
    if (Array.isArray(bb) && bb.length === 4) {
      const [south, north, west, east] = bb.map(Number);
      if ([south, north, west, east].every((n) => Number.isFinite(n))) {
        area.bbox = [south, west, north, east];
      }
    }
    if (!area.bbox && item.lat && item.lon) {
      area.center = { lat: Number(item.lat), lon: Number(item.lon) };
    }
    return area;
  } catch {
    // ignora e retorna vazio
  }
  return {};
}

function mapFeature(f: any): Resultado | null {
  const p = f?.properties || {};
  const nome = (p.name || "").toString().trim();
  if (!nome) return null;

  const telefone = (p.phone || "").toString().trim();
  const email = (p.email || "").toString().trim();
  const site = (p.website || p.datasource?.website || "").toString().trim();
  const rua = `${p.housenumber ? p.housenumber + " " : ""}${p.street || ""}`.trim();
  const endereco = [rua, p.city || p.city_district || ""].filter(Boolean).join(", ");
  const categoria = Array.isArray(p.categories) && p.categories.length ? p.categories[0] : "";

  // Não pedimos rating/atmosphere de propósito: é SKU Enterprise (caro). Ficamos no tier Pro.
  return {
    nome,
    telefone,
    whatsapp: toWhatsappLink(telefone),
    email,
    gmail: email.toLowerCase().includes("gmail.com") ? email : "",
    endereco,
    bairro: p.district || p.suburb || p.city_district || "",
    cidade: p.city || p.city_district || "",
    estado: p.state || "",
    cep: p.postcode || "",
    categoria: categoria.toString(),
    avaliacao: "",
    qtd_avaliacoes: "",
    facebook: "",
    instagram: "",
    linkedin: "",
    tiktok: "",
    twitter: "",
    google_maps_url: "",
    site: site || "(sem site)",
    lat: p.lat != null ? String(p.lat) : "",
    lon: p.lon != null ? String(p.lon) : "",
  };
}

/**
 * Aplica o filtro de modo (leads/completo).
 * - completo: todas as empresas.
 * - leads: só as contactáveis (com telefone/WhatsApp) E (sem site OU com Gmail).
 */
export function filtrarPorModo(todas: Resultado[], modo: "leads" | "completo"): Resultado[] {
  if (modo === "completo") return todas;
  const semSite = (e: Resultado) => !e.site || e.site === "(sem site)";
  const comGmail = (e: Resultado) => e.email.toLowerCase().includes("gmail.com");
  return todas.filter((e) => e.telefone.trim() !== "" && (semSite(e) || comGmail(e)));
}

export async function buscarEmpresasSemSite(
  query: string,
  limit = 20,
  modo: "leads" | "completo" = "leads"
): Promise<Resultado[]> {
  const apiKey = (process.env.GEOAPIFY_KEY || "").trim();
  if (!apiKey) {
    throw new Error("GEOAPIFY_KEY não configurada no .env. Crie uma chave em myprojects.geoapify.com e defina GEOAPIFY_KEY.");
  }

  const { termo, local } = parseQuery(query);
  const area = await geocodificar(local || termo);
  if (!area.bbox && !area.center) {
    throw new Error(
      "Não foi possível localizar a região. Inclua uma cidade na busca, ex: 'restaurantes em São Paulo'."
    );
  }

  let filter: string;
  if (area.bbox) {
    const [s, w, n, e] = area.bbox;
    filter = `rect:${w},${s},${e},${n}`;
  } else {
    filter = `circle:${area.center!.lon},${area.center!.lat},6000`;
  }

  const limite = Math.min(Math.max(limit, 1), 5000);
  const todas: Resultado[] = [];
  let offset = 0;

  // Geoapify pagina em lotes de até 100; repetimos até atingir o limite pedido.
  while (todas.length < limite) {
    const lote = Math.min(100, limite - todas.length);
    const { data } = await axios.get(GEOAPIFY_URL, {
      params: { text: termo, filter, limit: lote, offset, lang: "pt", apiKey },
      timeout: 20000,
    });
    const feats = Array.isArray(data?.features) ? data.features : [];
    if (feats.length === 0) break;
    for (const f of feats) {
      const r = mapFeature(f);
      if (r) todas.push(r);
    }
    offset += lote;
    if (feats.length < lote) break;
  }

  // Preenche cidade/estado da região geocodificada quando faltarem no POI.
  for (const r of todas) {
    if (!r.cidade) r.cidade = area.cidade || "";
    if (!r.estado) r.estado = area.estado || "";
  }

  const unicas = filtrarPorModo(todas, modo);
  return unicas.slice(0, Math.max(1, limite));
}
