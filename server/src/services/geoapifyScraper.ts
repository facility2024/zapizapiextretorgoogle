/**
 * geoapifyScraper.ts
 * Extrator de empresas locais — ÚNICA fonte: Geoapify Places API (FREE, sem cartão).
 *
 * Fluxo:
 *   1. Nominatim geocodifica a região (ex: "São Paulo") -> bounding box (gratuito, sem chave).
 *   2. Geoapify Places busca POIs pela CATEGORIA dentro da região (3.000 req/dia por projeto).
 *   3. Filtra leads (com WhatsApp, sem site ou com Gmail) ou traz todos os dados.
 *
 * Requer GEOAPIFY_KEY no .env (uma chave de um projeto Geoapify).
 * Observação: a fonte é OpenStreetMap por baixo, então e-mail/redes/avaliações são raros,
 * mas telefone/WhatsApp (o que importa pro disparo) vêm bem. Dados: Powered by Geoapify.
 */

import axios from "axios";
import { getGeoapifyKeys } from "./configStore.js";

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

/**
 * Mapeia termos em português para categorias da Geoapify.
 * `cat` é a categoria específica (pode não existir); `grupo` é o top-level (sempre válido) usado como fallback.
 */
interface MapeamentoCategoria {
  re: RegExp;
  cat: string;
  grupo: string;
}
const MAPA_CATEGORIAS: MapeamentoCategoria[] = [
  { re: /restaurante|pizzaria|lanche|lanchonete|comida|cafeteria|caf[ée]/i, cat: "catering.restaurant", grupo: "catering" },
  { re: /sal[ãa]o de beleza|salao de beleza|beleza|cabeleireiro|barbearia|barber/i, cat: "commercial.hairdresser", grupo: "commercial" },
  { re: /loja de roupas|roupas|vestu[áa]rio|moda|brech[óo]|chia/i, cat: "commercial.clothing", grupo: "commercial" },
  { re: /padaria|p[ãa]o/i, cat: "commercial.bakery", grupo: "commercial" },
  { re: /supermercado|mercado|conveni[êe]ncia/i, cat: "commercial.supermarket", grupo: "commercial" },
  { re: /farm[áa]cia/i, cat: "healthcare.pharmacy", grupo: "healthcare" },
  { re: /cl[íi]nica|consult[óo]rio|dentista|m[ée]dico/i, cat: "healthcare.clinic", grupo: "healthcare" },
  { re: /hospital/i, cat: "healthcare.hospital", grupo: "healthcare" },
  { re: /advogad/i, cat: "office.lawyer", grupo: "office" },
  { re: /imobili[áa]ria/i, cat: "office.real_estate", grupo: "office" },
  { re: /academia|fitness|gin[áa]stica/i, cat: "leisure.fitness", grupo: "leisure" },
  { re: /pet shop|pet|veterin[áa]rio/i, cat: "commercial.pet", grupo: "commercial" },
  { re: /hotel|pousada|motel/i, cat: "accommodation.hotel", grupo: "accommodation" },
  { re: /oficina|mec[âa]nico|auto.?pec[çc]as/i, cat: "commercial.car_repair", grupo: "commercial" },
  { re: /escola|col[ée]gio|educa/i, cat: "education.school", grupo: "education" },
  { re: /igreja|templo/i, cat: "tourism", grupo: "tourism" },
  { re: /loja|store|shop|com[ée]rcio|empresa|neg[óo]cio/i, cat: "commercial", grupo: "commercial" },
];

// Conjunto amplo de grupos comerciais — garante resultado mesmo sem categoria específica.
const CATEGORIAS_GERAIS = "commercial,catering,service,healthcare,accommodation,tourism,leisure,office,education";

function mapearCategoria(termo: string): string[] {
  for (const m of MAPA_CATEGORIAS) {
    if (m.re.test(termo)) return [m.cat, m.grupo, CATEGORIAS_GERAIS];
  }
  return [CATEGORIAS_GERAIS];
}

function mapFeature(f: any): Resultado | null {
  const p = f?.properties || {};
  const contato = p.contact || {};
  const nome = (p.name || "").toString().trim();
  if (!nome) return null;

  const telefone = (p.phone || contato.phone || "").toString().trim();
  const email = (p.email || contato.email || "").toString().trim();
  const site = (p.website || contato.website || p.datasource?.website || "").toString().trim();
  const rua = `${p.housenumber ? p.housenumber + " " : ""}${p.street || ""}`.trim();
  const endereco = [rua, p.city || p.city_district || ""].filter(Boolean).join(", ");
  const cats = Array.isArray(p.categories) ? (p.categories as string[]) : [];
  const categoria = cats.find((c) => c !== "building") || cats[0] || "";

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
 * - leads: só as contactáveis (com telefone/WhatsApp) — o que importa para o disparo.
 */
export function filtrarPorModo(todas: Resultado[], modo: "leads" | "completo"): Resultado[] {
  if (modo === "completo") return todas;
  return todas.filter((e) => e.telefone.trim() !== "");
}

/**
 * Busca paginada usando uma string de categorias fixa, com rotação de chaves.
 * Em 429/403 marca a chave como exaurida e tenta a próxima; se todas esgotarem, lança erro.
 */
async function buscarPaginado(
  categorias: string,
  filter: string,
  limite: number,
  area: Area,
  keys: string[],
  pegarChave: () => { key: string; idx: number } | null,
  exauridas: Set<number>
): Promise<Resultado[]> {
  const todas: Resultado[] = [];
  let offset = 0;
  while (todas.length < limite) {
    const lote = Math.min(100, limite - todas.length);

    // Faz a requisição com retry trocando de chave em caso de limite (429/403).
    let feats: any[] = [];
    let tentativas = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const k = pegarChave();
      if (!k) throw new Error("Todas as chaves Geoapify atingiram o limite diário gratuito.");
      try {
        const { data } = await axios.get(GEOAPIFY_URL, {
          params: { categories: categorias, filter, limit: lote, offset, lang: "pt", apiKey: k.key },
          timeout: 20000,
        });
        feats = Array.isArray(data?.features) ? data.features : [];
        break;
      } catch (e: any) {
        const st = e?.response?.status;
        if (st === 429 || st === 403) {
          exauridas.add(k.idx);
          tentativas++;
          if (tentativas > keys.length * 3) throw new Error("Todas as chaves Geoapify atingiram o limite diário gratuito.");
          continue;
        }
        throw e; // 400 (categoria inválida) ou outro erro — propaga
      }
    }

    if (feats.length === 0) break;
    for (const f of feats) {
      const r = mapFeature(f);
      if (r) todas.push(r);
    }
    offset += lote;
    if (feats.length < lote) break;
  }

  for (const r of todas) {
    if (!r.cidade) r.cidade = area.cidade || "";
    if (!r.estado) r.estado = area.estado || "";
  }
  return todas;
}

export async function buscarEmpresasSemSite(
  query: string,
  limit = 20,
  modo: "leads" | "completo" = "leads"
): Promise<Resultado[]> {
  const keys = getGeoapifyKeys();
  if (keys.length === 0) {
    throw new Error(
      "Nenhuma chave Geoapify configurada. Defina GEOAPIFY_KEY no .env ou adicione em Configurações (menu do app)."
    );
  }

  const { termo, local } = parseQuery(query);
  const area = await geocodificar(local || termo);
  if (!area.bbox && !area.center) {
    throw new Error(
      "Não foi possível localizar a região. Inclua uma cidade na busca, ex: 'restaurantes em São Paulo'."
    );
  }

  const filter: string = area.bbox
    ? (() => {
        const [s, w, n, e] = area.bbox!;
        return `rect:${w},${s},${e},${n}`;
      })()
    : `circle:${area.center!.lon},${area.center!.lat},6000`;

  const limite = Math.min(Math.max(limit, 1), 5000);
  const candidatos = mapearCategoria(termo);

  // Rotação de chaves: round-robin, pulando as exauridas (429/403).
  let rot = 0;
  const exauridas = new Set<number>();
  const pegarChave = (): { key: string; idx: number } | null => {
    for (let i = 0; i < keys.length; i++) {
      const idx = rot % keys.length;
      rot++;
      if (!exauridas.has(idx)) return { key: keys[idx], idx };
    }
    return null;
  };

  // Tenta a categoria específica; se a Geoapify rejeitar (400), cai no grupo e depois no geral.
  let ultimoErro: unknown;
  for (const cats of candidatos) {
    try {
      const todas = await buscarPaginado(cats, filter, limite, area, keys, pegarChave, exauridas);
      const unicas = filtrarPorModo(todas, modo);
      return unicas.slice(0, Math.max(1, limite));
    } catch (e: any) {
      if (e?.response?.status === 400) {
        ultimoErro = e;
        continue; // tenta o próximo candidato (grupo / geral)
      }
      throw e;
    }
  }
  throw ultimoErro ?? new Error("Falha ao consultar o Geoapify");
}
