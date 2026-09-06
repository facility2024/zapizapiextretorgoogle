/**
 * admin.ts
 * Rotas de administração — CRUD de usuários e licenças.
 * Apenas admin pode acessar.
 */
import { Router } from "express";
import { prisma } from "../db.js";
import { hashSenha } from "../services/auth.js";

const router = Router();

// ─── Listar todos os usuários ───────────────────────────────
router.get("/usuarios", async (_req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      select: {
        id: true, email: true, nome: true, whatsapp: true, role: true, createdAt: true,
        licencas: { orderBy: { dataExpiracao: "desc" }, take: 1 },
        instancias: { select: { wapiInstanceId: true, conectado: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ usuarios });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Criar usuário ──────────────────────────────────────────
router.post("/usuarios", async (req, res) => {
  try {
    const { email, senha, nome, whatsapp } = req.body || {};
    if (!email || !senha) {
      res.status(400).json({ error: "email e senha são obrigatórios" });
      return;
    }
    const existe = await prisma.usuario.findUnique({ where: { email } });
    if (existe) {
      res.status(409).json({ error: "Email já cadastrado" });
      return;
    }
    const hash = await hashSenha(senha);
    const usuario = await prisma.usuario.create({
      data: { email, senha: hash, nome: nome || null, whatsapp: whatsapp || null, role: "user" },
    });
    res.json({ id: usuario.id, email: usuario.email, nome: usuario.nome });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Atualizar usuário ──────────────────────────────────────
router.put("/usuarios/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, whatsapp, senha } = req.body || {};
    const data: any = {};
    if (nome !== undefined) data.nome = nome;
    if (whatsapp !== undefined) data.whatsapp = whatsapp;
    if (senha) data.senha = await hashSenha(senha);
    const usuario = await prisma.usuario.update({ where: { id }, data });
    res.json({ id: usuario.id, email: usuario.email, nome: usuario.nome });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Deletar usuário ────────────────────────────────────────
router.delete("/usuarios/:id", async (req, res) => {
  try {
    const { id } = req.params;
    // Não deletar a si mesmo
    if (id === req.usuarioId) {
      res.status(400).json({ error: "Não é possível deletar seu próprio usuário" });
      return;
    }
    await prisma.usuario.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Criar licença para um usuário ──────────────────────────
router.post("/licencas", async (req, res) => {
  try {
    const { usuarioId, dias } = req.body || {};
    if (!usuarioId || !dias) {
      res.status(400).json({ error: "usuarioId e dias são obrigatórios" });
      return;
    }
    const dataExpiracao = new Date();
    dataExpiracao.setDate(dataExpiracao.getDate() + Number(dias));
    const licenca = await prisma.licenca.create({
      data: {
        usuarioId,
        dataExpiracao,
        ativo: true,
        criadoPor: req.usuarioId,
      },
    });
    res.json(licenca);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Listar licenças de um usuário ──────────────────────────
router.get("/licencas/:usuarioId", async (req, res) => {
  try {
    const { usuarioId } = req.params;
    const licencas = await prisma.licenca.findMany({
      where: { usuarioId },
      orderBy: { createdAt: "desc" },
    });
    res.json({ licencas });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Ativar/desativar licença ───────────────────────────────
router.patch("/licencas/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { ativo } = req.body || {};
    const licenca = await prisma.licenca.update({
      where: { id },
      data: { ativo: ativo !== undefined ? ativo : undefined },
    });
    res.json(licenca);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Dashboard admin: resumo ────────────────────────────────
router.get("/dashboard", async (_req, res) => {
  try {
    const totalUsuarios = await prisma.usuario.count();
    const licencasAtivas = await prisma.licenca.count({
      where: { ativo: true, dataExpiracao: { gt: new Date() } },
    });
    const totalCampanhas = await prisma.campanha.count();
    const totalEnvios = await prisma.envio.count();
    res.json({ totalUsuarios, licencasAtivas, totalCampanhas, totalEnvios });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
