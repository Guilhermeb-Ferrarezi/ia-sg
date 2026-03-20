import type { Express, Request, Response } from "express";

type SessionUser = {
  username: string;
  role: string;
  exp: number;
};

type AuthRouteDeps = {
  dashboardUser: string;
  dashboardPass: string;
  signSession: (input: { username: string; role: string }) => string;
  setAuthCookie: (res: Response, token: string) => void;
  clearAuthCookie: (res: Response) => void;
  getSessionFromRequest: (req: Request) => SessionUser | null;
};

export function registerAuthRoutes(app: Express, deps: AuthRouteDeps): void {
  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body as { username?: string; password?: string };

    if (!username || !password) {
      res.status(400).json({ message: "Usuario e senha sao obrigatorios." });
      return;
    }

    if (username !== deps.dashboardUser || password !== deps.dashboardPass) {
      res.status(401).json({ message: "Credenciais invalidas." });
      return;
    }

    const token = deps.signSession({ username, role: "admin" });
    deps.setAuthCookie(res, token);

    res.json({
      message: "Login realizado com sucesso.",
      user: { username, role: "admin" }
    });
  });

  app.post("/api/auth/logout", (_req, res) => {
    deps.clearAuthCookie(res);
    res.json({ message: "Logout realizado com sucesso." });
  });

  app.get("/api/auth/me", (req, res) => {
    const session = deps.getSessionFromRequest(req);
    if (!session) {
      res.status(401).json({ message: "Nao autenticado." });
      return;
    }

    res.json({
      user: {
        username: session.username,
        role: session.role,
        exp: session.exp
      }
    });
  });
}
