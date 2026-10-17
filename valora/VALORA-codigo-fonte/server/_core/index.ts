import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { ENV, MIN_SESSION_SECRET_LENGTH } from "./env";
import { serveStatic, setupVite } from "./vite";

function checkConfiguration() {
  const problems: string[] = [];
  if (!ENV.databaseUrl) problems.push("DATABASE_URL não foi definido.");
  if (ENV.sessionSecret.length < MIN_SESSION_SECRET_LENGTH) {
    problems.push(`JWT_SECRET precisa ter pelo menos ${MIN_SESSION_SECRET_LENGTH} caracteres.`);
  }
  if (problems.length) {
    throw new Error(`Configuração incompleta no arquivo .env:\n- ${problems.join("\n- ")}`);
  }
}

async function startServer() {
  checkConfiguration();
  const app = express();
  const server = createServer(app);
  // Honour X-Forwarded-* from one reverse proxy (HTTPS detection and client IP for login throttling).
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
    next();
  });
  // Profile photos travel as compressed data URLs (max ~400 KB).
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  server.on("error", error => { console.error("Server failed:", error.message); process.exit(1); });
  server.listen(port, "0.0.0.0", () => console.log(`VALORA rodando em http://localhost:${port}`));
}

startServer().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
