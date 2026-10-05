# AGENTS.md

## Projeto
Zapizapi — disparo/agendamento WhatsApp via W-API (`w-api.app`). App única: Express serve API + `client/dist` (SPA fallback) na mesma porta.

## Comandos
```bash
# Instalar (monorepo manual, sem workspaces — instale em cada pasta)
npm install && cd server && npm install && cd ../client && npm install

# Dev (server :3001 via tsx watch + client :5173 via Vite, concurrently)
npm run dev
cd server && npm run dev   # só server
cd client && npm run dev   # só client

# Prisma — rode ANTES de subir o server (gera client e cria/atualiza tabelas)
cd server && npm run db:generate && npm run db:push

# Build (só frontend; server roda .ts direto via tsx, não usa dist)
npm run build              # alias para build:client

# Produção local (server :3001 serve API + client/dist — exige build antes)
npm run build && npm start
```
- Não há `npm test`, lint, format nem CI em nenhum pacote.
- **Typecheck não é porta de passagem**: `cd server && npx tsc --noEmit` dá hoje **21** erros pré-existentes; `cd client && npx tsc --noEmit` dá **6**. `vite build` e `tsx` ignoram tipos. Rode o tsc antes e depois da sua mudança e compare as listas — erros pré-existentes não são seus (principais: `req.usuarioId` sem tipagem em `Request`, `Contato` upsert com `where: { numero }`, `ffmpeg-static`, `import.meta` em módulo CommonJS).
- `start_dev.bat` = `npm run dev`. `start-server.bat` / `start-client.bat` apontam para um caminho antigo (`C:\Projeto2\...`) e estão quebrados.

## Variáveis de ambiente
Copie `server/.env.example` → `server/.env`:
- `DATABASE_URL` — **Postgres/Supabase** (`provider = "postgresql"` em `server/prisma/schema.prisma`); string do pooler porta 6543 com `pgbouncer=true`. O `server/prisma/dev.db` legado não é mais usado.
- `AUTH_EMAIL` / `AUTH_SENHA` — admin master, **sem default** (`services/auth.ts`); vazios = login de admin desativado. O primeiro login com eles cria a linha `Usuario` (`role=admin`) no banco.
- `AUTH_SECRET` — assinatura dos tokens. **Ausente = secret aleatório por boot** → todas as sessões morrem a cada restart.
- `WAPI_INSTANCE_ID` / `WAPI_TOKEN` — instância usada pelo disparo; `WAPI_API_KEY` — chave da CONTA `w-api.app` para auto-provisionar instância (`wapiClient.ts` → `ensureInstanceCreated`, só quando não há `WAPI_TOKEN`); `WAPI_BASE_URL` — padrão `https://api.w-api.app`.
- `GEOAPIFY_KEY` — fallback do extrator. Precedência em `geoapifyScraper.buscarEmpresasSemSite(query, limite, modo, usuarioId, geoapifyKeyDireto)`:
  1. `geoapifyKeyDireto` — chave enviada pelo browser no payload do socket (`extractorSocket.ts:39`); o client nem dispara sem `localStorage["geoapify_keys"]`;
  2. `getGeoapifyKeys(usuarioId)` — lê `UserInstance.geoapifyKeys` **só quando há `usuarioId`**, senão cai em `process.env`.
  O caminho do socket passa `usuarioId=undefined` (**o banco não entra**); a rota HTTP `/api/extractor/search` passa `req.usuarioId` → banco → env. Salvar via UI (`POST /api/config/geoapify`) grava em `process.env` **global** (afeta todos os usuários) e no banco.
- `PORT` — padrão 3001 (`server/src/index.ts`).

Nunca commite `.env` (está no `.gitignore` e no `.dockerignore`).

## Arquitetura
- **Monorepo manual** (sem workspaces): `server/` Express + Prisma + Postgres, `client/` React + Vite + Tailwind + PWA `vite-plugin-pwa`. Entrypoints: `server/src/index.ts`, `client/vite.config.ts`.
- **Multi-tenant é parcial**: existem `Usuario`, `Licenca` e `UserInstance` (1 por usuário) e o middleware de auth anexa `req.usuarioId`, mas rotas como `campaigns`, `upload` e `extractor` não filtram por dono (visão global). Credenciais W-API por usuário só são usadas em `grupos.ts`; **o disparo (`queue.ts` → `wapiClient.ts`) lê exclusivamente do `.env`**.
- **Camadas de rota** (`server/src/index.ts`): token HMAC em todo `/api` → `requireAdmin` em `/api/admin` → `requireLicenca` em `/api/instances|wapi|upload|campaigns|extractor|config|grupos` (admin ignora licença). Públicas (caminhos relativos a `/api`): `/auth/login`, `/auth/register`, `/health`, `/webhook*`, `/wapi/debug`. Rota nova em mount novo nasce só com token — some `requireLicenca` se precisar.
- **Fila**: estado em memória por campanha (`Map` em `queue.ts`) + persistência Prisma; delay inicial 10–20s e delay aleatório entre envios (`delayEntreMsgMin/Max`); pausa/cancel e contadores vivem no processo — reinício zera a fila.
- **Scheduler**: `services/scheduler.ts` — tick de 30s para `status=agendada` e `agendarPara <= now`; marca `em_andamento` antes de enfileirar para evitar duplo disparo. `agendarPara` entra como horário de Brasília (`services/timezone.ts` → `parseBrasilia`) e é salvo em UTC.
- **WebSocket**: `socket.io` **sem autenticação** (origin `*`); emite `campaign-update`. O extrator também roda pelo evento `extractor:search` (`socket/extractorSocket.ts`), contornando token/licença.
- **Proxy dev**: Vite encaminha `/api` e `/uploads` para `localhost:3001` (`client/vite.config.ts`), **mas NÃO `/socket.io`** — em dev o handshake do socket falha via `:5173` e só conecta direto em `:3001` (testado). Para testar extrator/campanhas via WebSocket, suba o build (`npm run build` + `npm start`) ou adicione o proxy de `/socket.io`.
- **Deploy = 1 serviço**: `Dockerfile` builda o client e sobe `tsx src/index.ts`; o `dist` gerado por `tsc` nunca é usado (`server/package.json` tem `build: tsc`, mas nada o chama). Express serve `client/dist` com fallback SPA.

## Convenções
- Código/comentários em português; lógica de domínio em `server/src/services/`.
- **Imports ESM com `.js` mesmo em `.ts`** (`module: NodeNext`); sem a extensão quebra em runtime via `tsx`.
- **O que `{{var}}` resolve** (`messageParser.ts`): `numero`, `nome`, `empresa`, `cidade`, `ola`/`bom_dia`/`boa_tarde`/`boa_noite` e colunas extras da planilha (JSON `extras`). Ordem: `{{var}}` primeiro, spintax `{a|b}` depois.
- Números ganham DDI 55 automaticamente (`excelParser.ts:normalizarNumero`, `geoapifyScraper.ts:toWhatsappLink`).

## Gotchas
- **Variáveis que a UI promete e o parser não resolve**: `detectarVariaveis` lista qualquer header da planilha, mas `resolveVariaveis` só entende a lista acima — `{{celular}}`, `{{telefone}}`, `{{whatsapp}}`, `{{name}}` caem em `variavelFallback`/vazio. Use `{{numero}}`.
- Coluna de telefone aceita `numero`, `telefone`, `whatsapp`, `phone`, `celular`, `número`, `num` (`excelParser.ts`); ela vira o campo `numero` e **não** é copiada para `extras`.
- **Chave única de `Contato`** no schema é o composto `@@unique([usuarioId, numero])`, mas `upload.ts` e `extractor.ts` usam `where: { numero }` (erro de `tsc`) e criam contato sem `usuarioId`.
- **Coluna criada no boot**: `index.ts` roda `ALTER TABLE "UserInstance" ADD COLUMN IF NOT EXISTS "geoapifyKeys"` — a coluna existe mesmo sem `db push`.
- **Deploy**: o `Dockerfile` só roda `prisma generate`, nunca `db push`; rode `npx prisma db push` (ou `server/supabase.sql` no SQL Editor) antes de subir — o pooler do Supabase falha no push em boot e entra em crash-loop. O default de `DATABASE_URL` no `Dockerfile`/`docker-compose.yml` é `file:/app/data/dev.db...` e o Prisma **rejeita** com `provider = "postgresql"` (exige `postgresql://`) — defina `DATABASE_URL` real sempre. `docker-compose.yml` só repassa `WAPI_INSTANCE_ID/TOKEN/BASE_URL`, `DATABASE_URL` e `PORT`: `AUTH_*`, `GEOAPIFY_KEY` e `WAPI_API_KEY` não chegam ao container.
- `db:seed` aponta para `prisma/seed.ts` inexistente — não use (`server/package.json`).
- `services/audioConverter.ts` importa `ffmpeg-static` (**não está em `package.json`**) mas ninguém o importa — não ligue esse arquivo sem instalar a dependência. `fluent-ffmpeg` usa o `ffmpeg` do sistema (`apk add ffmpeg` no Docker).
- W-API não-oficial — payloads mudam; cheque `wapiClient.ts` antes de alterar.
