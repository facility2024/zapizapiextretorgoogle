import { Router } from "express";
import { extrairParticipantesComNome, paraCSV, paraExcel, listarGrupos } from "../services/grupoService.js";
import { getCredenciaisUsuario } from "./userInstances.js";

const router = Router();

// Helper: busca credenciais W-API do usuário logado
async function getCred(usuarioId: string) {
  const cred = await getCredenciaisUsuario(usuarioId);
  if (!cred) throw new Error("Instância W-API não configurada. Vá em Configurações e salve suas credenciais.");
  return cred;
}

// GET /api/grupos -> listar grupos da instância
router.get("/", async (req, res) => {
  try {
    const cred = await getCred(req.usuarioId);
    const grupos = await listarGrupos(cred);
    res.json({ grupos });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/grupos/participantes?groupId=... -> JSON com participantes
router.get("/participantes", async (req, res) => {
  try {
    const groupId = String(req.query.groupId || "").trim();
    if (!groupId) { res.status(400).json({ error: "groupId é obrigatório" }); return; }
    const cred = await getCred(req.usuarioId);
    const dados = await extrairParticipantesComNome(groupId, cred);
    res.json({ total: dados.length, groupId, participantes: dados });
  } catch (e: any) {
    const msg = e.message || "Erro desconhecido";
    const status = msg.includes("não configurada") ? 400 : 500;
    res.status(status).json({ error: msg });
  }
});

// GET /api/grupos/export?groupId=...&semPrefixo=true -> CSV
router.get("/export", async (req, res) => {
  try {
    const groupId = String(req.query.groupId || "").trim();
    if (!groupId) { res.status(400).json({ error: "groupId é obrigatório" }); return; }
    const semPrefixo = req.query.semPrefixo === "true";
    const cred = await getCred(req.usuarioId);
    const dados = await extrairParticipantesComNome(groupId, cred);
    const csv = paraCSV(dados, semPrefixo);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="participantes_${groupId.split("@")[0]}.csv"`);
    res.send(csv);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/grupos/export-excel?groupId=...&semPrefixo=true -> Excel
router.get("/export-excel", async (req, res) => {
  try {
    const groupId = String(req.query.groupId || "").trim();
    if (!groupId) { res.status(400).json({ error: "groupId é obrigatório" }); return; }
    const semPrefixo = req.query.semPrefixo === "true";
    const cred = await getCred(req.usuarioId);
    const dados = await extrairParticipantesComNome(groupId, cred);
    const buffer = paraExcel(dados, semPrefixo);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="participantes_${groupId.split("@")[0]}.xlsx"`);
    res.send(buffer);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
