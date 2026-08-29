/**
 * geoapifyScraper.ts
 * Extrator via Geoapify Places API — FREE TIER de 3.000 chamadas/dia POR CHAVE.
 *
 * Suporta ROTAÇÃO de chaves (GEOAPIFY_KEYS no .env, vírgula-separado) para
 * multiplicar a cota gratuita (ex.: 5 chaves = 15.000 chamadas/dia sem custo).
 *
 * Em caso de 429/403 a chave é marcada como exaurida e a próxima da lista assume.
 * Retorna os mesmos campos do Overpass (phone, site, email, endereço, cidade, coords…),
 * para que o restante do pipeline (leads/completo, save, frontend) funcione igual.
 *
 * Observação: a fonte é OpenStreetMap por baixo, então e-mail/redes sociais/avaliações
 * continuam raros — mas o telefone/WhatsApp (o que importa pro disparo) vem bem.
 */

import axios from "axios";
import { geocodificar, parseQuery, filtrarPorModo, toWhatsappLink, Resultado } from "./overpassScraper.js";

const GEOAPIFY_URL = "https://api.geoapify.com/v2/places";

function getKeys(): string[] {
  return (process.env.GEOAPIFY_KEYS || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

let rotacao = 0;
const chavesExauridas = new Set<number>();

/**
 * Faz GET na Geoapify rotacionando chaves. Em 429/403 tenta a próxima chave disponível.
 * Se todas esgotarem, zera o cache de exauridas (a cota diária pode ter renovado).
 */
async function geoapifyGet(params: Record<string, string>): Promise<any> {
  const keys = getKeys();
  if (keys.length === 0) {
    throw new Error("Nenhuma GEOAPIFY_KEYS configurada no .env. Defina uma ou mais chaves (vírgula-separadas).");
  }

  let ultimoErro: unknown;
  let tentativas = 0;
  while (tentativas < keys.length) {
    const idx = rotacao % keys.length;
    rotacao++;
    tentativas++;
    if (chavesExauridas.has(idx)) continue;

    try {
      const { data } = await axios.get(GEOAPIFY_URL, {
        params: { ...params, apiKey: keys[idx] },
        timeout: 20000,
      });
      chavesExauridas.delete(idx);
      return data;
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 429 || status === 403) {
        chavesExauridas.add(idx);
        ultimoErro = e;
        continue; // tenta a próxima chave
      }
      throw e;
    }
  }

  // Todas esgotadas: limpa para não travar caso a cota tenha renovado.
  if (chavesExauridas.size >= keys.length) chavesExauridas.clear();
  throw ultimoErro ?? new Error("Geoapify: todas as chaves atingiram o limite diário gratuito.");
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

export async function buscarEmpresasGeoapify(
  query: string,
  limit = 20,
  modo: "leads" | "completo" = "leads"
): Promise<Resultado[]> {
  const { termo, local } = parseQuery(query);
  const area = await geocodificar(local || termo);
  if (!area.bbox && !area.center) {
    throw new Error(
      "Não foi possível localizar a região. Inclua uma cidade na busca, ex: 'restaurantes em São Paulo'."
    );
  }

  // Geoapify aceita bbox (rect) ou círculo em torno do centro.
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
    const data = await geoapifyGet({
      text: termo,
      filter,
      limit: String(lote),
      offset: String(offset),
      lang: "pt",
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
