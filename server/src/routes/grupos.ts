import { Router } from "express";
import { buscarParticipantes, buscarTodosContatos, extrairParticipantesComNome, paraCSV, paraExcel, listarGrupos } from "../services/grupoService.js";

const router = Router();

// GET /api/grupos -> listar grupos da instância
router.get("/", async (_req, res) => {
  try {
    const grupos = await listarGrupos();
    res.json({ grupos });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/grupos/participantes?groupId=1203...@g.us -> JSON com participantes + nomes
router.get("/participantes", async (req, res) => {
  try {
    const groupId = String(req.query.groupId || "").trim();
    if (!groupId) { res.status(400).json({ error: "groupId é obrigatório. Formato: 1203...@g.us" }); return; }
    const dados = await extrairParticipantesComNome(groupId);
    res.json({ total: dados.length, groupId, participantes: dados });
  } catch (e: any) {
    const msg = e.message || "Erro desconhecido";
    const status = msg.includes("WAPI_TOKEN") || msg.includes("WAPI_INSTANCE_ID") ? 500 : msg.includes("Token inválido") || msg.includes("Invalid token") ? 401 : 500;
    // erros comuns: token inválido, grupo inexistente, instância desconectada
    if (msg.includes("not found") || msg.includes("inexistente")) res.status(404).json({ error: msg });
    else res.status(status).json({ error: msg });
  }
});

// GET /api/grupos/export?groupId=... -> CSV download
router.get("/export", async (req, res) => {
  try {
    const groupId = String(req.query.groupId || "").trim();
    if (!groupId) { res.status(400).json({ error: "groupId é obrigatório" }); return; }
    const dados = await extrairParticipantesComNome(groupId);
    const csv = paraCSV(dados);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="participantes_${groupId.split("@")[0]}.csv"`);
    res.send(csv);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/grupos/export-excel?groupId=... -> Excel download
router.get("/export-excel", async (req, res) => {
  try {
    const groupId = String(req.query.groupId || "").trim();
    if (!groupId) { res.status(400).json({ error: "groupId é obrigatório" }); return; }
    const dados = await extrairParticipantesComNome(groupId);
    const buffer = paraExcel(dados);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="participantes_${groupId.split("@")[0]}.xlsx"`);
    res.send(buffer);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Para debug: buscar só participantes crus ou só contatos
router.get("/raw-participantes", async (req, res) => {
  try {
    const groupId = String(req.query.groupId || "").trim();
    if (!groupId) { res.status(400).json({ error: "groupId obrigatório" }); return; }
    const p = await buscarParticipantes(groupId);
    res.json({ total: p.length, participantes: p });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
