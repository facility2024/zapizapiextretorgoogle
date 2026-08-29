/**
 * configStore.ts
 * Armazena configurações do app em arquivo JSON (server/data/config.json),
 * para que o usuário possa alterar chaves pelo menu sem editar o .env ou reiniciar o server.
 * As chaves Geoapify também podem vir do .env (GEOAPIFY_KEY) como fallback.
 */

import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

interface AppConfig {
  geoapifyKeys?: string[];
}

function ler(): AppConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8")) as AppConfig;
    }
  } catch {
    // ignora arquivo corrompido
  }
  return {};
}

function gravar(cfg: AppConfig): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

/** Retorna as chaves Geoapify (do menu/arquivo, ou do .env como fallback). */
export function getGeoapifyKeys(): string[] {
  const cfg = ler();
  if (cfg.geoapifyKeys && cfg.geoapifyKeys.length) {
    return cfg.geoapifyKeys.map((k) => k.trim()).filter(Boolean);
  }
  return (process.env.GEOAPIFY_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

/** Salva as chaves Geoapify recebidas como texto (quebras de linha ou vírgulas separam as chaves). */
export function setGeoapifyKeys(texto: string): string[] {
  const chaves = texto
    .split(/[\n,;]+/)
    .map((k) => k.trim())
    .filter(Boolean);
  const cfg = ler();
  cfg.geoapifyKeys = chaves;
  gravar(cfg);
  return chaves;
}
