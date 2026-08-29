/**
 * auth.ts
 * Autenticação simples baseada em token assinado (HMAC, sem dependências externas).
 * Credenciais definidas por env (AUTH_EMAIL / AUTH_SENHA) com fallback para o padrão.
 */
import crypto from "crypto";

// SECRET aleatório por boot quando não definido no .env (impede forjar token).
const SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString("hex");
const EMAIL_PADRAO = process.env.AUTH_EMAIL || "otavio@gmail.com";
const SENHA_PADRAO = process.env.AUTH_SENHA || "123";

if (!process.env.AUTH_EMAIL || !process.env.AUTH_SENHA) {
  console.warn(
    "[AUTH] Usando credenciais padrão (otavio@gmail.com / 123). " +
      "Defina AUTH_EMAIL e AUTH_SENHA no .env para produção."
  );
}

function base64url(str: string): string {
  return Buffer.from(str).toString("base64url");
}

export function credenciaisValidas(email: string, senha: string): boolean {
  return email === EMAIL_PADRAO && senha === SENHA_PADRAO;
}

export function gerarToken(email: string): string {
  const payload = base64url(
    JSON.stringify({ email, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 }) // 7 dias
  );
  const signature = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verificarToken(token: string): string | null {
  try {
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return null;
    const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
    // Comparação de tempo constante para evitar timing attack
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.exp && Date.now() > data.exp) return null;
    return data.email as string;
  } catch {
    return null;
  }
}
