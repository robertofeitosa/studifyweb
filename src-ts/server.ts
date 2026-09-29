import crypto from "node:crypto";
import path from "node:path";
import express, {
  NextFunction,
  Request,
  Response
} from "express";

import { StudifyDatabase } from "./database";

const PORT = Number.parseInt(process.env.PORT ?? "8080", 10);

const AUTH_USER = (process.env.STUDIFY_USER ?? "robertof7b").trim();
const AUTH_PASSWORD = process.env.STUDIFY_PASSWORD ?? "";

const SECOND_USER = (process.env.STUDIFY_SECOND_USER ?? "julia").trim();
const SECOND_PASSWORD = process.env.STUDIFY_SECOND_PASSWORD ?? "";

const MAX_PDF_BYTES = 15 * 1024 * 1024;
const SESSION_COOKIE = "studify_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface SessionData {
  username: string;
  expiresAt: number;
}

const sessions = new Map<string, SessionData>();

validateConfiguration();

const primaryDb = new StudifyDatabase();
const secondDb = new StudifyDatabase("studify-julia.db", false);

const app = express();
app.disable("x-powered-by");

const publicDir = path.resolve(
  process.cwd(),
  "src/main/resources/public"
);

app.use((req, res, next) => {
  applySecurityHeaders(res);

  const origin = req.header("origin");
  if (origin && isAllowedDevOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS"
    );
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
});

app.use(express.json({ limit: "1mb" }));

function validateConfiguration(): void {
  if (!AUTH_USER || !AUTH_PASSWORD) {
    throw new Error(
      "Defina STUDIFY_USER e STUDIFY_PASSWORD antes de iniciar o Studify."
    );
  }

  if (AUTH_PASSWORD.length < 8) {
    throw new Error(
      "STUDIFY_PASSWORD deve ter pelo menos 8 caracteres."
    );
  }

  if (!SECOND_USER || !SECOND_PASSWORD) {
    throw new Error(
      "Defina STUDIFY_SECOND_USER e STUDIFY_SECOND_PASSWORD antes de iniciar o Studify."
    );
  }

  if (SECOND_PASSWORD.length < 8) {
    throw new Error(
      "STUDIFY_SECOND_PASSWORD deve ter pelo menos 8 caracteres."
    );
  }

  if (AUTH_USER.toLowerCase() === SECOND_USER.toLowerCase()) {
    throw new Error(
      "Os usuários do Studify precisam ter nomes diferentes."
    );
  }
}

function isAllowedDevOrigin(origin: string): boolean {
  return /^http:\/\/(localhost|127\.0\.0\.1):(5500|5501)$/.test(origin);
}

function applySecurityHeaders(res: Response): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
}

function safeMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Erro inesperado.";
}

function constantTimeEquals(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(actual, "utf8");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function authenticate(
  username: string,
  password: string
): string | null {
  if (
    constantTimeEquals(AUTH_USER, username) &&
    constantTimeEquals(AUTH_PASSWORD, password)
  ) {
    return AUTH_USER;
  }

  if (
    constantTimeEquals(SECOND_USER, username) &&
    constantTimeEquals(SECOND_PASSWORD, password)
  ) {
    return SECOND_USER;
  }

  return null;
}

function createSession(username: string): string {
  const token = crypto.randomBytes(32).toString("base64url");

  sessions.set(token, {
    username,
    expiresAt: Date.now() + SESSION_TTL_MS
  });

  return token;
}

function parseCookies(req: Request): Record<string, string> {
  const raw = req.header("cookie");
  if (!raw) return {};

  const cookies: Record<string, string> = {};

  for (const item of raw.split(";")) {
    const index = item.indexOf("=");
    if (index < 0) continue;

    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();

    cookies[key] = value;
  }

  return cookies;
}

function sessionToken(req: Request): string | null {
  return parseCookies(req)[SESSION_COOKIE] ?? null;
}

function authenticatedSession(
  req: Request
): SessionData | null {
  const token = sessionToken(req);
  if (!token) return null;

  const session = sessions.get(token);
  if (!session) return null;

  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }

  const renewed = {
    username: session.username,
    expiresAt: Date.now() + SESSION_TTL_MS
  };

  sessions.set(token, renewed);
  return renewed;
}

function isAuthenticated(req: Request): boolean {
  return authenticatedSession(req) !== null;
}

function setSessionCookie(
  req: Request,
  res: Response,
  token: string,
  clear: boolean
): void {
  const forwardedProto = req.header("x-forwarded-proto");

  res.cookie(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: forwardedProto?.toLowerCase() === "https",
    maxAge: clear ? 0 : SESSION_TTL_MS
  });
}

function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!isAuthenticated(req)) {
    res.status(401).json({
      error: "Sessão expirada. Entre novamente.",
      authenticated: false
    });
    return;
  }

  next();
}

function ensurePrimaryUser(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const session = authenticatedSession(req);

  if (
    !session ||
    session.username.toLowerCase() !== AUTH_USER.toLowerCase()
  ) {
    res.status(403).json({
      error: "Este recurso está disponível apenas no perfil robertof7b."
    });
    return;
  }

  next();
}

function databaseFor(req: Request): StudifyDatabase {
  const session = authenticatedSession(req);

  if (!session) {
    throw new Error("Sessão inválida.");
  }

  if (
    session.username.toLowerCase() === SECOND_USER.toLowerCase()
  ) {
    return secondDb;
  }

  return primaryDb;
}

function methodNotAllowed(_req: Request, res: Response): void {
  res.status(405).json({ error: "Método não permitido." });
}

app.get("/health", (_req, res) => {
  try {
    primaryDb.studySummary();
    secondDb.studySummary();
    res.type("text/plain").status(200).send("ok");
  } catch {
    res.type("text/plain").status(503).send("unavailable");
  }
});

app.post("/api/auth/login", (req, res) => {
  try {
    const username =
      typeof req.body?.username === "string"
        ? req.body.username.trim()
        : "";

    const password =
      typeof req.body?.password === "string"
        ? req.body.password
        : "";

    const authenticatedUser = authenticate(username, password);

    if (!authenticatedUser) {
      res.status(401).json({
        error: "Usuário ou senha incorretos."
      });
      return;
    }

    const token = createSession(authenticatedUser);
    setSessionCookie(req, res, token, false);

    res.status(200).json({
      ok: true,
      username: authenticatedUser
    });
  } catch {
    res.status(400).json({
      error: "Não foi possível fazer login."
    });
  }
});

app.get("/api/auth/status", (req, res) => {
  const session = authenticatedSession(req);
  const authenticated = session !== null;

  res.status(200).json({
    authenticated,
    username: session?.username ?? "",
    primary:
      authenticated &&
      session!.username.toLowerCase() === AUTH_USER.toLowerCase()
  });
});

app.post("/api/auth/logout", requireAuth, (req, res) => {
  const token = sessionToken(req);

  if (token) {
    sessions.delete(token);
  }

  setSessionCookie(req, res, "", true);
  res.status(200).json({ ok: true });
});

app.all("/api/auth/login", methodNotAllowed);
app.all("/api/auth/status", methodNotAllowed);
app.all("/api/auth/logout", methodNotAllowed);

app.get("/api/subjects", requireAuth, (req, res) => {
  try {
    res.status(200).json(databaseFor(req).subjects());
  } catch (error) {
    res.status(400).json({ error: safeMessage(error) });
  }
});

app.post("/api/subjects", requireAuth, (req, res) => {
  try {
    databaseFor(req).addSubject(String(req.body?.name ?? ""));
    res.status(201).json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: safeMessage(error) });
  }
});

app.put("/api/subjects", requireAuth, (req, res) => {
  try {
    const id = Number(req.body?.id);

    if (req.body?.name !== null && req.body?.name !== undefined) {
      databaseFor(req).renameSubject(id, String(req.body.name));
    }

    if (
      req.body?.direction !== null &&
      req.body?.direction !== undefined
    ) {
      databaseFor(req).moveSubject(
        id,
        String(req.body.direction)
      );
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: safeMessage(error) });
  }
});

app.delete("/api/subjects", requireAuth, (req, res) => {
  try {
    databaseFor(req).deleteSubject(Number(req.query.id ?? -1));
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: safeMessage(error) });
  }
});

app.all("/api/subjects", methodNotAllowed);

app.get("/api/contents", requireAuth, (req, res) => {
  try {
    const subject =
      typeof req.query.subject === "string"
        ? req.query.subject
        : "";

    if (!subject.trim()) {
      res.status(400).json({
        error: "Informe a matéria."
      });
      return;
    }

    res.status(200).json(databaseFor(req).contents(subject));
  } catch (error) {
    res.status(400).json({ error: safeMessage(error) });
  }
});

app.post("/api/contents", requireAuth, (req, res) => {
  try {
    databaseFor(req).addContent(
      String(req.body?.subject ?? ""),
      String(req.body?.name ?? "")
    );

    res.status(201).json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: safeMessage(error) });
  }
});

app.put("/api/contents", requireAuth, (req, res) => {
  try {
    const id = Number(req.body?.id);

    if (
      req.body?.status !== null &&
      req.body?.status !== undefined
    ) {
      databaseFor(req).updateStatus(id, String(req.body.status));
    }

    if (req.body?.name !== null && req.body?.name !== undefined) {
      databaseFor(req).renameContent(id, String(req.body.name));
    }

    if (
      req.body?.direction !== null &&
      req.body?.direction !== undefined
    ) {
      databaseFor(req).moveContent(
        id,
        String(req.body.direction)
      );
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: safeMessage(error) });
  }
});

app.delete("/api/contents", requireAuth, (req, res) => {
  try {
    databaseFor(req).deleteContent(Number(req.query.id ?? -1));
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: safeMessage(error) });
  }
});

app.all("/api/contents", methodNotAllowed);

app.get("/api/reviews", requireAuth, (req, res) => {
  try {
    res.status(200).json(databaseFor(req).reviews());
  } catch (error) {
    res.status(400).json({ error: safeMessage(error) });
  }
});

app.post("/api/reviews", requireAuth, (req, res) => {
  try {
    databaseFor(req).addReview(
      Number(req.body?.contentId),
      String(req.body?.date ?? "")
    );

    res.status(201).json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: safeMessage(error) });
  }
});

app.put("/api/reviews", requireAuth, (req, res) => {
  try {
    databaseFor(req).completeReview(Number(req.body?.id));
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: safeMessage(error) });
  }
});

app.all("/api/reviews", methodNotAllowed);

app.get("/api/progress", requireAuth, (req, res) => {
  try {
    res.status(200).json(databaseFor(req).progress());
  } catch (error) {
    res.status(400).json({ error: safeMessage(error) });
  }
});

app.all("/api/progress", methodNotAllowed);

app.get("/api/notes", requireAuth, (req, res) => {
  try {
    res.status(200).json(databaseFor(req).notes());
  } catch (error) {
    res.status(400).json({ error: safeMessage(error) });
  }
});

app.post("/api/notes", requireAuth, (req, res) => {
  try {
    databaseFor(req).addNote(
      req.body?.subjectId == null
        ? null
        : Number(req.body.subjectId),
      String(req.body?.title ?? ""),
      String(req.body?.body ?? "")
    );

    res.status(201).json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: safeMessage(error) });
  }
});

app.put("/api/notes", requireAuth, (req, res) => {
  try {
    databaseFor(req).updateNote(
      Number(req.body?.id),
      req.body?.subjectId == null
        ? null
        : Number(req.body.subjectId),
      String(req.body?.title ?? ""),
      String(req.body?.body ?? "")
    );

    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: safeMessage(error) });
  }
});

app.delete("/api/notes", requireAuth, (req, res) => {
  try {
    databaseFor(req).deleteNote(Number(req.query.id ?? -1));
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: safeMessage(error) });
  }
});

app.all("/api/notes", methodNotAllowed);

app.get("/api/sessions", requireAuth, (req, res) => {
  try {
    res.status(200).json(databaseFor(req).studySessions());
  } catch (error) {
    res.status(400).json({ error: safeMessage(error) });
  }
});

app.post("/api/sessions", requireAuth, (req, res) => {
  try {
    databaseFor(req).addStudySession(
      req.body?.subjectId == null
        ? null
        : Number(req.body.subjectId),
      Number(req.body?.durationSeconds)
    );

    res.status(201).json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: safeMessage(error) });
  }
});

app.all("/api/sessions", methodNotAllowed);

app.get("/api/summary", requireAuth, (req, res) => {
  try {
    res.status(200).json(databaseFor(req).studySummary());
  } catch (error) {
    res.status(400).json({ error: safeMessage(error) });
  }
});

app.all("/api/summary", methodNotAllowed);

app.get(
  "/api/study-roadmap",
  requireAuth,
  ensurePrimaryUser,
  (_req, res) => {
    try {
      res.status(200).json({
        progress: primaryDb.roadmapProgress()
      });
    } catch (error) {
      res.status(400).json({ error: safeMessage(error) });
    }
  }
);

app.put(
  "/api/study-roadmap",
  requireAuth,
  ensurePrimaryUser,
  (req, res) => {
    try {
      if (req.body?.itemKey == null) {
        res.status(400).json({
          error: "Item de roadmap inválido."
        });
        return;
      }

      primaryDb.setRoadmapProgress(
        String(req.body.itemKey),
        Boolean(req.body.completed)
      );

      res.status(200).json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: safeMessage(error) });
    }
  }
);

app.all("/api/study-roadmap", methodNotAllowed);

app.get(
  "/api/documents",
  requireAuth,
  ensurePrimaryUser,
  (_req, res) => {
    try {
      res.status(200).json(primaryDb.documents());
    } catch (error) {
      res.status(400).json({ error: safeMessage(error) });
    }
  }
);

app.post(
  "/api/documents",
  requireAuth,
  ensurePrimaryUser,
  express.raw({
    type: "application/pdf",
    limit: MAX_PDF_BYTES
  }),
  (req, res) => {
    try {
      const contentType = req.header("content-type") ?? "";

      if (!contentType.toLowerCase().startsWith("application/pdf")) {
        res.status(400).json({
          error: "Envie um arquivo PDF válido."
        });
        return;
      }

      const data = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.alloc(0);

      if (data.length === 0) {
        res.status(400).json({
          error: "O PDF está vazio."
        });
        return;
      }

      if (
        data.length < 5 ||
        data.subarray(0, 5).toString("ascii") !== "%PDF-"
      ) {
        res.status(400).json({
          error: "O arquivo enviado não parece ser um PDF válido."
        });
        return;
      }

      const name =
        typeof req.query.name === "string"
          ? req.query.name.trim()
          : "material.pdf";

      const id = primaryDb.addDocument(name, data);

      res.status(201).json({
        ok: true,
        id
      });
    } catch (error) {
      res.status(400).json({ error: safeMessage(error) });
    }
  }
);

app.delete(
  "/api/documents",
  requireAuth,
  ensurePrimaryUser,
  (req, res) => {
    try {
      const id = Number(req.query.id ?? -1);

      if (id <= 0) {
        res.status(400).json({
          error: "PDF inválido."
        });
        return;
      }

      primaryDb.deleteDocument(id);
      res.status(200).json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: safeMessage(error) });
    }
  }
);

app.all("/api/documents", methodNotAllowed);

app.get(
  "/api/documents/file",
  requireAuth,
  ensurePrimaryUser,
  (req, res) => {
    try {
      const id = Number(req.query.id ?? -1);
      const document = primaryDb.document(id);

      if (!document) {
        res.status(404).json({
          error: "PDF não encontrado."
        });
        return;
      }

      applySecurityHeaders(res);
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline");
      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).end(document.data);
    } catch (error) {
      res.status(400).json({ error: safeMessage(error) });
    }
  }
);

app.all("/api/documents/file", methodNotAllowed);

const publicAssets = new Set([
  "/login.html",
  "/login.css",
  "/login.js",
  "/robots.txt",
  "/studify.ico",
  "/studify-icon.png"
]);

app.use((req, res, next) => {
  if (req.path.startsWith("/api/") || req.path === "/health") {
    next();
    return;
  }

  if (req.method !== "GET") {
    methodNotAllowed(req, res);
    return;
  }

  const requestPath =
    req.path === "/" ? "/index.html" : req.path;

  const authenticated = isAuthenticated(req);
  const publicAsset = publicAssets.has(requestPath);

  if (requestPath === "/login.html" && authenticated) {
    res.redirect(302, "/");
    return;
  }

  if (!publicAsset && !authenticated) {
    res.redirect(302, "/login.html");
    return;
  }

  next();
});

app.use(
  express.static(publicDir, {
    index: "index.html",
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".ico") || filePath.endsWith(".png")) {
        res.setHeader("Cache-Control", "public, max-age=86400");
      } else {
        res.setHeader(
          "Cache-Control",
          "no-store, no-cache, must-revalidate, max-age=0"
        );
      }
    }
  })
);

app.use((_req, res) => {
  res.status(404).send("404");
});

app.use(
  (
    error: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    const candidate = error as {
      type?: string;
      status?: number;
      statusCode?: number;
    };

    if (
      candidate?.type === "entity.too.large" ||
      candidate?.status === 413 ||
      candidate?.statusCode === 413
    ) {
      res.status(413).json({
        error: "O PDF deve ter no máximo 15 MB."
      });
      return;
    }

    console.error(error);

    if (!res.headersSent) {
      res.status(500).json({
        error: "Erro interno do servidor."
      });
    }
  }
);

app.listen(PORT, "0.0.0.0", () => {
  console.log();
  console.log("Studify TypeScript iniciado com acesso privado.");
  console.log("Porta:", PORT);
  console.log("Banco principal:", primaryDb.databasePath());
  console.log(
    `Banco de ${SECOND_USER}:`,
    secondDb.databasePath()
  );
  console.log();
});
