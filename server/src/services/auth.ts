/**
 * auth.ts
 * Autenticação multi-tenant com banco de dados.
 * Admin: credenciais do .env (AUTH_EMAIL/AUTH_SENHA) — não precisa de registro.
 * Usuários: criados pelo admin, login via email+senha no banco.
 */
import crypto from "crypto";
import bcrypt from "bcrypt";
import { prisma } from "../db.js";

const SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString("hex");
const ADMIN_EMAIL = process.env.AUTH_EMAIL || "";
const ADMIN_SENHA = process.env.AUTH_SENHA || "";

const SALT_ROUNDS = 10;

// ─── Senha ──────────────────────────────────────────────────

export async function hashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, SALT_ROUNDS);
}

export async function compararSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}

// ─── Token HMAC ─────────────────────────────────────────────

function base64url(str: string): string {
  return Buffer.from(str).toString("base64url");
}

export function gerarToken(usuarioId: string, email: string, role: string): string {
  const payload = base64url(
    JSON.stringify({ uid: usuarioId, email, role, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 })
  );
  const signature = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export interface TokenData {
  uid: string;
  email: string;
  role: string;
  exp: number;
}

export function verificarToken(token: string): TokenData | null {
  try {
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return null;
    const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as TokenData;
    if (data.exp && Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

// ─── Login ──────────────────────────────────────────────────

export interface LoginResult {
  token: string;
  usuario: { id: string; email: string; nome: string | null; role: string };
  licenca?: { dataExpiracao: Date; ativo: boolean } | null;
}

export async function login(email: string, senha: string): Promise<LoginResult> {
  // Admin do .env (não precisa de registro no banco)
  if (ADMIN_EMAIL && ADMIN_SENHA && email === ADMIN_EMAIL && senha === ADMIN_SENHA) {
    // Busca ou cria o admin no banco
    let admin = await prisma.usuario.findUnique({ where: { email } });
    if (!admin) {
      const hash = await hashSenha(senha);
      admin = await prisma.usuario.create({
        data: { email, senha: hash, nome: "Admin", role: "admin" },
      });
    }
    const token = gerarToken(admin.id, admin.email, admin.role);
    return {
      token,
      usuario: { id: admin.id, email: admin.email, nome: admin.nome, role: admin.role },
    };
  }

  // Usuário comum do banco
  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (!usuario) throw new Error("Credenciais inválidas");

  const ok = await compararSenha(senha, usuario.senha);
  if (!ok) throw new Error("Credenciais inválidas");

  // Verifica licença ativa
  const licenca = await prisma.licenca.findFirst({
    where: { usuarioId: usuario.id, ativo: true, dataExpiracao: { gt: new Date() } },
    orderBy: { dataExpiracao: "desc" },
  });

  const token = gerarToken(usuario.id, usuario.email, usuario.role);
  return {
    token,
    usuario: { id: usuario.id, email: usuario.email, nome: usuario.nome, role: usuario.role },
    licenca: licenca ? { dataExpiracao: licenca.dataExpiracao, ativo: licenca.ativo } : null,
  };
}

// ─── Verificação de licença ─────────────────────────────────

export async function usuarioAtivo(usuarioId: string): Promise<boolean> {
  const licenca = await prisma.licenca.findFirst({
    where: { usuarioId, ativo: true, dataExpiracao: { gt: new Date() } },
  });
  return !!licenca;
}

export async function isAdmin(usuarioId: string): Promise<boolean> {
  const u = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { role: true } });
  return u?.role === "admin";
}
