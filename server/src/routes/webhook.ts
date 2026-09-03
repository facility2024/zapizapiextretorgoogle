/**
 * webhook.ts
 * Endpoints públicos para W-API (Configurar Webhook da instância FD2A1Q-ZMM3LU-NFLZW0).
 * Não exigem auth — W-API chama direto. Auth é bypassado em index.ts para /api/webhook.
 */
import { Router } from "express";

const router = Router();

function handle(tipo: string) {
  return (req: any, res: any) => {
    console.log(`[WEBHOOK:${tipo}]`, JSON.stringify(req.body).slice(0, 2000));
    // opcional: emitir via socket.io se precisar em tempo real
    // payload fica logado — estenda aqui para salvar no banco / disparar lógica
    res.json({ ok: true, tipo });
  };
}

// 4 eventos mostrados no painel W-API (print do usuário)
router.post("/ao_conectar", handle("ao_conectar"));
router.post("/ao_desconectar", handle("ao_desconectar"));
router.post("/ao_enviar", handle("ao_enviar"));
router.post("/ao_receber", handle("ao_receber"));

// fallback genérico (se W-API mudar path)
router.post("/", handle("geral"));

router.get("/health", (_req, res) => res.json({ ok: true, webhook: "ativo" }));

export default router;
