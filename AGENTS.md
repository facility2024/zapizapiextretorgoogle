# AGENTS.md

## Projeto
Zapizapi — disparo/agendamento WhatsApp via W-API (`w-api.app`). App única: Express serve API + `client/dist` (SPA fallback) na mesma porta.

## Comandos
```bash
# Instalar (monorepo manual, sem workspaces — instale em cada pasta)
npm install && cd server && npm install && cd ../client && npm install

# Dev (server :3001 via tsx watch + client :5173 via Vite, concurrently)
npm run dev
# Só server / só client
cd server && npm run dev
cd client && npm run dev

# Prisma — rode ANTES de subir o server (gera client e cria/atualiza tabelas)
cd server && npm run db:generate && npm run db:push
# equivale a: npx prisma generate && npx prisma db push

# Build (só frontend; server roda .ts direto via tsx, não usa dist)
npm run build        # alias para build:client
npm run build:client # cd client && vite build
```
Não há `npm test`, lint ou format — não procure esses comandos.

## Variáveis de ambiente
Copie `server/.env.example` → `server/.env`:
- `WAPI_INSTANCE_ID`, `WAPI_TOKEN` — instância W-API
- `WAPI_API_KEY` — chave da CONTA `w-api.app` (diferente do token); usada em `POST /v1/client/create-instance` para auto-provisionar (`server/src/services/wapiClient.ts:156`)
- `WAPI_BASE_URL` — padrão `https://api.w-api.app` (ver `wapiClient.ts:16` e `.env.example`); `docker-compose.yml` traz default errado `https://api.wapi.chat`
- `DATABASE_URL` — **Postgres/Supabase** (provider `postgresql` em `server/prisma/schema.prisma:6`); string do pooler Supabase porta 6543 (ex. no `.env.example`). O `file:./dev.db` legado ainda existe em `server/prisma/dev.db` mas não é mais usado
- `GEOAPIFY_KEY` — única fonte do extrator (`server/src/services/geoapifyScraper.ts`); chaves extras podem ser salvas no banco (`ApiKey`) via UI Config e há rotação automática (`configStore.ts`)
- `AUTH_EMAIL` / `AUTH_SENHA` / `AUTH_SECRET` — auth HMAC (`server/src/services/auth.ts:9`); default `otavio@gmail.com` / `123` se não definidos; tokens expiram em 7 dias. **Sem `AUTH_SECRET` no `.env`, o secret é aleatório por boot** — todos os tokens/sessões morrem a cada restart do server
- `PORT` — padrão 3001 (`server/src/index.ts:37`)

Nunca commite `.env` (está no `.gitignore`).

## Arquitetura
- **Monorepo manual** (`server/` Express + Prisma + Postgres, `client/` React + Vite + Tailwind + PWA `vite-plugin-pwa`). Sem `workspaces`; entrypoints: `server/src/index.ts`, `client/vite.config.ts`.
- **Banco**: Prisma `postgresql` — espelho DDL em `server/supabase.sql` (não usado em dev, apenas ref. Supabase). Modelos principais: `Campanha`, `Contato`, `CampanhaContato`, `Envio` (`schema.prisma:10`).
- **Fila**: em memória por campanha (`Map` em `server/src/services/queue.ts:28`) com persistência via Prisma; suporta campanhas concorrentes, pausa/cancelamento, delay inicial 10-20s e delay aleatório entre envios (`delayEntreMsgMin/Max`).
- **Scheduler**: `server/src/services/scheduler.ts:11` — poll a cada 30s por `Campanha` com `status=agendada` e `agendarPara <= now`; marca `em_andamento` antes de enfileirar para evitar duplo disparo.
- **WebSocket**: `socket.io` emite `campaign-update` (`queue.ts:43` registra callback via `onStatusUpdate` em `index.ts:94`); extrator usa `socket/extractorSocket.ts`.
- **Proxy dev**: Vite `server.proxy` encaminha `/api` e `/uploads` para `localhost:3001` (`client/vite.config.ts:39`).
- **Auth**: middleware em `index.ts:48` protege TODAS as rotas `/api` (Bearer token HMAC); exceções públicas: `/api/webhook`, `/api/auth/login`, `/api/health`, `/api/wapi/debug`. Rota nova no `/api` já nasce protegida — inclua na allowlist se for pública.
- **Deploy = 1 serviço**: `Dockerfile` builda client (`npx prisma generate` + `npm run build`) e sobe `tsx src/index.ts` na `PORT`. Express serve `client/dist` com fallback SPA (`index.ts:76`).

## Convenções
- Código/comentários em português. Lógica de domínio em `server/src/services/`.
- **Imports ESM com `.js`** mesmo em `.ts` (`tsconfig.json:4` `module: NodeNext`); mantenha a extensão — sem isso quebra em runtime via `tsx`.
- **Server roda `.ts` via `tsx`** (`server/package.json:6` `tsx watch` / `tsx src/index.ts`); `npm run build` só compila `tsc` mas o Docker não usa o `dist`.
- Variáveis/spintax (`messageParser.ts:71`): resolver `{{var}}` antes de `{a|b}`; `{{ola}}` dinâmico por horário, `{{bom_dia}}`/`{{boa_tarde}}`/`{{boa_noite}}` fixos; `{{numero}}`/`{{nome}}`/`{{empresa}}`/`{{cidade}}` + colunas extras da planilha.
- Números normalizados com DDI 55 automaticamente (`excelParser.ts:30`, `geoapifyScraper.ts:47`).

## Gotchas
- `fluent-ffmpeg` exige `ffmpeg` no host (`Dockerfile:4` instala via `apk add ffmpeg`).
- W-API não-oficial — payloads mudam; cheque `wapiClient.ts` antes de alterar.
- Planilha precisa coluna de número; aliases na importação: `numero`, `telefone`, `whatsapp`, `phone`, `celular`, `número`, `num` (`excelParser.ts:25`). **Atenção**: `messageParser.ts:22` tem aliases menores (`nome`, `numero`, `empresa`, `cidade`) — se a planilha usar `celular` ou `número` como nome de coluna, a variável extra ficará no JSON `extras` em vez de mapear para `numero` automaticamente.
- `db:seed` aponta para `prisma/seed.ts` inexistente — não use (`server/package.json:11`).
- `docker-compose.yml:9` default `WAPI_BASE_URL` está errado (`wapi.chat`); correto é `w-api.app`.
- `Dockerfile:36` só roda `prisma generate`, **não** `prisma db push` (comentário na linha 41 está errado); sem `db push` as tabelas não existem em runtime. No deploy, garanta `npx prisma db push` no step de build ou manual no container; `DATABASE_URL=file:/app/data/dev.db` só vale para SQLite legado — para Postgres/Supabase troque a URL e monte volumes apenas em `/app/data` e `/app/server/uploads` (nunca o `/app/server` inteiro).
