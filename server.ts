import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import db from "./src/db.ts";
import { generateWorkflowPlan, executeAgentStep } from "./src/services/geminiService.ts";

dotenv.config();

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  app.use(express.json());

  // WebSocket connection handling
  const clients = new Map<string, WebSocket>();
  wss.on("connection", (ws) => {
    const id = uuidv4();
    clients.set(id, ws);
    ws.on("close", () => clients.delete(id));
  });

  function broadcast(message: any) {
    const payload = JSON.stringify(message);
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

  // API Routes
  app.get("/api/workflows", (req, res) => {
    const workflows = db.prepare("SELECT * FROM workflows ORDER BY created_at DESC").all();
    res.json(workflows);
  });

  app.post("/api/workflows/create", async (req, res) => {
    const { prompt } = req.body;
    try {
      const plan = await generateWorkflowPlan(prompt);
      const id = uuidv4();
      db.prepare(`
        INSERT INTO workflows (id, name, description, original_prompt, steps_json)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, plan.name, plan.description, prompt, JSON.stringify(plan.steps));
      
      res.json({ id, ...plan });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/executions", (req, res) => {
    const executions = db.prepare(`
      SELECT e.*, w.name as workflow_name 
      FROM workflow_executions e 
      JOIN workflows w ON e.workflow_id = w.id 
      ORDER BY e.started_at DESC
    `).all();
    res.json(executions);
  });

  app.get("/api/executions/:id", (req, res) => {
    const execution = db.prepare("SELECT * FROM workflow_executions WHERE id = ?").get(req.params.id);
    const steps = db.prepare("SELECT * FROM execution_steps WHERE execution_id = ? ORDER BY step_index ASC").all(req.params.id);
    res.json({ ...execution, steps });
  });

  app.post("/api/executions/execute", async (req, res) => {
    const { workflowId } = req.body;
    const workflow: any = db.prepare("SELECT * FROM workflows WHERE id = ?").get(workflowId);
    if (!workflow) return res.status(404).json({ error: "Workflow not found" });

    const executionId = uuidv4();
    db.prepare("INSERT INTO workflow_executions (id, workflow_id, status) VALUES (?, ?, ?)").run(executionId, workflowId, "running");

    const steps = JSON.parse(workflow.steps_json);
    
    // Start execution in background
    (async () => {
      const context = {};
      broadcast({ type: "execution_update", executionId, status: "running" });

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepId = uuidv4();
        
        db.prepare(`
          INSERT INTO execution_steps (id, execution_id, step_index, name, agent_type, status, started_at)
          VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(stepId, executionId, i, step.name, step.agentType, "running");

        broadcast({ type: "step_update", executionId, stepId, status: "running", stepIndex: i });

        try {
          const result = await executeAgentStep(step, context);
          
          const status = result.success ? "completed" : "failed";
          db.prepare(`
            UPDATE execution_steps 
            SET status = ?, result_json = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(status, JSON.stringify(result.result), result.error, stepId);

          broadcast({ type: "step_update", executionId, stepId, status, stepIndex: i, result: result.result, error: result.error });

          if (!result.success) {
            db.prepare("UPDATE workflow_executions SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?")
              .run(result.error, executionId);
            broadcast({ type: "execution_update", executionId, status: "failed", error: result.error });
            return;
          }

          Object.assign(context, { [step.name]: result.result });
        } catch (error: any) {
          db.prepare("UPDATE execution_steps SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?")
            .run(error.message, stepId);
          db.prepare("UPDATE workflow_executions SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?")
            .run(error.message, executionId);
          broadcast({ type: "execution_update", executionId, status: "failed", error: error.message });
          return;
        }
      }

      db.prepare("UPDATE workflow_executions SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(executionId);
      broadcast({ type: "execution_update", executionId, status: "completed" });
    })();

    res.json({ executionId });
  });

  app.get("/api/analytics/overview", (req, res) => {
    const totalWorkflows = db.prepare("SELECT COUNT(*) as count FROM workflows").get().count;
    const totalExecutions = db.prepare("SELECT COUNT(*) as count FROM workflow_executions").get().count;
    const successRate = db.prepare("SELECT (COUNT(CASE WHEN status = 'completed' THEN 1 END) * 100.0 / COUNT(*)) as rate FROM workflow_executions").get().rate || 0;
    const recentExecutions = db.prepare("SELECT status, COUNT(*) as count FROM workflow_executions GROUP BY status").all();
    
    res.json({
      totalWorkflows,
      totalExecutions,
      successRate: Math.round(successRate),
      statusBreakdown: recentExecutions
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
