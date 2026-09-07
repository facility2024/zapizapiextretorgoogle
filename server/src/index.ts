/**
 * index.ts
 * Servidor principal do Zapizapi — multi-tenant
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

import wapiRoutes from "./routes/wapi.js";
import uploadRoutes from "./routes/upload.js";
import campaignRoutes from "./routes/campaigns.js";
import extractorRoutes from "./routes/extractor.js";
import configRoutes from "./routes/config.js";
import authRoutes from "./routes/auth.js";
import gruposRoutes from "./routes/grupos.js";
import webhookRoutes from "./routes/webhook.js";
import adminRoutes from "./routes/admin.js";
import userInstancesRoutes from "./routes/userInstances.js";
import { onStatusUpdate } from "./services/queue.js";
import { verificarToken, usuarioAtivo, isAdmin } from "./services/auth.js";
import { iniciarScheduler } from "./services/scheduler.js";
import { registerExtractorSocket } from "./socket/extractorSocket.js";
import { prisma } from "./db.js";

console.log("[BOOT] Iniciando Zapizapi...");

// Migração automática: adiciona coluna geoapifyKeys se não existir
prisma.$executeRawUnsafe(`ALTER TABLE "UserInstance" ADD COLUMN IF NOT EXISTS "geoapifyKeys" TEXT`).then(() => {
  console.log("[BOOT] Coluna geoapifyKeys verificada/criada.");
}).catch((e) => {
  console.error("[BOOT] Erro ao criar coluna geoapifyKeys:", e.message);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Webhook W-API — público (W-API chama sem token)
app.use("/api/webhook", webhookRoutes);

// Autenticação: protege todas as rotas /api exceto login, health, webhook, debug e register
app.use("/api", (req, res, next) => {
  if (req.method === "OPTIONS") return next();
  const publicPaths = ["/auth/login", "/auth/register", "/health"];
  if (publicPaths.includes(req.path) || req.path.startsWith("/webhook") || req.path === "/wapi/debug") {
    return next();
  }

  const auth = req.headers.authorization;
  const token = auth && auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const tokenData = token ? verificarToken(token) : null;

  if (!tokenData) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  // Anexa dados do usuário ao request para uso nas rotas
  (req as any).usuarioId = tokenData.uid;
  (req as any).usuarioEmail = tokenData.email;
  (req as any).usuarioRole = tokenData.role;

  next();
});

// Middleware de admin: verifica se é admin
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if ((req as any).usuarioRole !== "admin") {
    res.status(403).json({ error: "Acesso restrito a administradores" });
    return;
  }
  next();
}

// Middleware de licença ativa: verifica se o usuário tem licença válida
async function requireLicenca(req: express.Request, res: express.Response, next: express.NextFunction) {
  const role = (req as any).usuarioRole;
  // Admin não precisa de licença
  if (role === "admin") return next();

  const ativo = await usuarioAtivo((req as any).usuarioId);
  if (!ativo) {
    res.status(403).json({ error: "Licença expirada ou inativa. Entre em contato com o administrador." });
    return;
  }
  next();
}

// Arquivos estáticos (uploads)
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// ─── Rotas públicas ─────────────────────────────────────────
app.use("/api/auth", authRoutes);

// ─── Rotas admin (só admin) ─────────────────────────────────
app.use("/api/admin", requireAdmin, adminRoutes);

// ─── Rotas de instância do usuário ──────────────────────────
app.use("/api/instances", requireLicenca, userInstancesRoutes);

// ─── Rotas do sistema (precisam licença) ────────────────────
app.use("/api/wapi", requireLicenca, wapiRoutes);
app.use("/api/upload", requireLicenca, uploadRoutes);
app.use("/api/campaigns", requireLicenca, campaignRoutes);
app.use("/api/extractor", requireLicenca, extractorRoutes);
app.use("/api/config", requireLicenca, configRoutes);
app.use("/api/grupos", requireLicenca, gruposRoutes);

// Frontend (produção): serve o build do client e SPA fallback
const clientDist = path.join(__dirname, "..", "..", "client", "dist");
app.use(express.static(clientDist));
app.get(/^(?!\/(api|uploads|socket\.io)).*/, (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) res.status(404).send("Client não buildado. Rode 'npm run build:client'.");
  });
});

// WebSocket — atualização em tempo real
io.on("connection", (socket) => {
  console.log("Cliente conectado via WebSocket:", socket.id);

  registerExtractorSocket(socket);

  socket.on("disconnect", () => {
    console.log("Cliente desconectado:", socket.id);
  });
});

// Registra callback de atualização de status para enviar via WebSocket
onStatusUpdate((campanhaId, contatoId, status, erro) => {
  io.emit("campaign-update", { campanhaId, contatoId, status, erro, timestamp: new Date().toISOString() });
});

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Agendador de campanhas (dispara automaticamente no horário agendado)
try {
  iniciarScheduler();
} catch (e) {
  console.error("[BOOT] Falha ao iniciar o agendador:", e);
}

// Inicia servidor
httpServer.listen(PORT, () => {
  console.log(`🚀 Zapizapi server rodando na porta ${PORT}`);
  console.log(`   http://localhost:${PORT}`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

// Trata erros não tratados para não crashar o servidor
process.on("unhandledRejection", (err) => {
  console.error("[UNHANDLED REJECTION]", err);
});

process.on("uncaughtException", (err) => {
  console.error("[UNCAUGHT EXCEPTION]", err);
});
