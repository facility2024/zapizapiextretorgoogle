/**
 * auth.ts (rotas)
 * POST /api/auth/login — valida credenciais e retorna o token.
 * POST /api/auth/register — registro público (opcional, pode ser desabilitado).
 */
import { Router } from "express";
import { login, hashSenha } from "../services/auth.js";
import { prisma } from "../db.js";

const router = Router();

// ─── Login ──────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, senha } = req.body || {};
    if (!email || !senha) {
      res.status(400).json({ error: "email e senha são obrigatórios" });
      return;
    }
    const resultado = await login(email, senha);
    res.json(resultado);
  } catch (e: any) {
    res.status(401).json({ error: e.message || "Credenciais inválidas" });
  }
});

// ─── Registro público (cria user comum, sem licença) ────────
router.post("/register", async (req, res) => {
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
    res.json({ id: usuario.id, email: usuario.email, nome: usuario.nome, mensagem: "Conta criada. Aguarde ativação do admin." });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
