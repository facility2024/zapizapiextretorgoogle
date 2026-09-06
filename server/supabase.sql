-- ============================================================
-- ZAPIZAPI — SQL para Supabase (Postgres)
-- Execute no SQL Editor do Supabase antes de subir o server
-- ============================================================

-- ─── EXTENSÕES ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── USUÁRIOS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Usuario" (
  "id" TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  "email" TEXT NOT NULL UNIQUE,
  "senha" TEXT NOT NULL,
  "nome" TEXT,
  "whatsapp" TEXT,
  "role" TEXT NOT NULL DEFAULT 'user',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);

-- ─── LICENÇAS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Licenca" (
  "id" TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  "usuarioId" TEXT NOT NULL REFERENCES "Usuario"("id") ON DELETE CASCADE,
  "dataInicio" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "dataExpiracao" TIMESTAMP(3) NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "criadoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Licenca_usuarioId_idx" ON "Licenca"("usuarioId");

-- ─── INSTÂNCIAS W-API POR USUÁRIO ──────────────────────────
CREATE TABLE IF NOT EXISTS "UserInstance" (
  "id" TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  "usuarioId" TEXT NOT NULL UNIQUE REFERENCES "Usuario"("id") ON DELETE CASCADE,
  "wapiInstanceId" TEXT NOT NULL,
  "wapiToken" TEXT NOT NULL,
  "wapiApiKey" TEXT,
  "wapiBaseUrl" TEXT NOT NULL DEFAULT 'https://api.w-api.app',
  "conectado" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);

-- ─── CONTATOS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Contato" (
  "id" TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  "usuarioId" TEXT REFERENCES "Usuario"("id") ON DELETE CASCADE,
  "numero" TEXT NOT NULL,
  "nome" TEXT,
  "empresa" TEXT,
  "cidade" TEXT,
  "extras" TEXT DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  UNIQUE ("usuarioId", "numero")
);

-- ─── CAMPANHAS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Campanha" (
  "id" TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  "usuarioId" TEXT REFERENCES "Usuario"("id") ON DELETE CASCADE,
  "nome" TEXT NOT NULL,
  "tipoDisparo" TEXT NOT NULL,
  "textoMensagem" TEXT NOT NULL,
  "imagemUrl" TEXT,
  "imagensUrls" TEXT,
  "audioUrl" TEXT,
  "variavelFallback" TEXT,
  "status" TEXT NOT NULL DEFAULT 'rascunho',
  "agendarPara" TIMESTAMP(3),
  "totalContatos" INTEGER NOT NULL DEFAULT 0,
  "enviados" INTEGER NOT NULL DEFAULT 0,
  "erros" INTEGER NOT NULL DEFAULT 0,
  "delayEntreMsgMin" INTEGER NOT NULL DEFAULT 20,
  "delayEntreMsgMax" INTEGER NOT NULL DEFAULT 40,
  "delayImagemTexto" INTEGER NOT NULL DEFAULT 4,
  "limitePorHora" INTEGER,
  "limitePorDia" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);

-- ─── CAMPANHA CONTATO ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CampanhaContato" (
  "id" TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  "campanhaId" TEXT NOT NULL REFERENCES "Campanha"("id") ON DELETE CASCADE,
  "contatoId" TEXT NOT NULL REFERENCES "Contato"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'pendente',
  "errorMsg" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "enviadoEm" TIMESTAMP(3),
  UNIQUE ("campanhaId", "contatoId")
);

-- ─── ENVIOS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Envio" (
  "id" TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  "campanhaId" TEXT NOT NULL REFERENCES "Campanha"("id") ON DELETE CASCADE,
  "contatoId" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "response" TEXT,
  "errorMsg" TEXT,
  "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT now()
);

-- ─── CONFIGURAÇÃO DELAY ────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ConfiguracaoDelay" (
  "id" TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  "chave" TEXT NOT NULL UNIQUE,
  "valor" TEXT NOT NULL,
  "descricao" TEXT
);

-- ─── API KEYS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ApiKey" (
  "id" TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  "usuarioId" TEXT REFERENCES "Usuario"("id") ON DELETE CASCADE,
  "label" TEXT,
  "key" TEXT NOT NULL UNIQUE,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "falhas" INTEGER NOT NULL DEFAULT 0,
  "ultimoErro" TEXT,
  "ultimoUso" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);

-- ─── CRIAR ADMIN PADRÃO ────────────────────────────────────
-- Senha bcrypt de "123": $2b$10$YQ8GvFOJnNwF.G5pQt5H3OQxJ5J5J5J5J5J5J5J5J5J5J5J5J5J5
-- (hash real gerado abaixo — rode o server uma vez para criar, ou insira manualmente)
INSERT INTO "Usuario" ("id", "email", "senha", "nome", "role", "createdAt", "updatedAt")
VALUES (
  'admin-001',
  'otavio@gmail.com',
  '$2b$10$DvKWwEq/ikRuMPgxV06chO8EWRBicF5QyEdBhumAg0eq3/ebbu2T2',
  'Admin',
  'admin',
  now(),
  now()
)
ON CONFLICT ("email") DO NOTHING;

-- ─── LICENÇA ADMIN (validade 10 anos) ──────────────────────
INSERT INTO "Licenca" ("id", "usuarioId", "dataInicio", "dataExpiracao", "ativo", "createdAt")
VALUES (
  'lic-admin-001',
  'admin-001',
  now(),
  now() + INTERVAL '10 years',
  true,
  now()
)
ON CONFLICT ("id") DO NOTHING;
