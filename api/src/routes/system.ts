import type { Express } from "express";

type SystemHealthSnapshot = {
  readiness: { ok: boolean; db: "up" | "down"; error?: string };
  details: {
    ok: boolean;
    uptimeSec: number;
    db: "up" | "down";
    wsClients: number;
    worker: { intervalMs: number; maxRetries: number };
    error?: string;
  };
};

type SystemRouteDeps = {
  buildSystemHealthSnapshot: () => Promise<SystemHealthSnapshot>;
};

export function registerSystemRoutes(app: Express, deps: SystemRouteDeps): void {
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/system/readiness", async (_req, res) => {
    const snapshot = await deps.buildSystemHealthSnapshot();
    if (snapshot.readiness.ok) {
      res.json(snapshot.readiness);
      return;
    }

    res.status(503).json(snapshot.readiness);
  });

  app.get("/api/system/health-details", async (_req, res) => {
    const snapshot = await deps.buildSystemHealthSnapshot();
    if (snapshot.details.ok) {
      res.json(snapshot.details);
      return;
    }

    res.status(503).json(snapshot.details);
  });
}
