/**
 * auth.ts (rotas)
 * POST /api/auth/login — valida credenciais e retorna o token.
 */
import { Router } from "express";
import { credenciaisValidas, gerarToken } from "../services/auth.js";

const router = Router();

router.post("/login", (req, res) => {
  const { email, senha } = req.body || {};
  if (!email || !senha) {
    res.status(400).json({ error: "email e senha são obrigatórios" });
    return;
  }
  if (!credenciaisValidas(email, senha)) {
    res.status(401).json({ error: "Credenciais inválidas" });
    return;
  }
  const token = gerarToken(email);
  res.json({ token });
});

export default router;
