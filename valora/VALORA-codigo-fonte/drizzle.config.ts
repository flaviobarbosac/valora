import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
  // In production the app shares a database with other systems: keep the migrations
  // journal inside the app's own schema instead of creating a separate "drizzle" schema.
  migrations: {
    schema: process.env.DATABASE_MIGRATIONS_SCHEMA || "drizzle",
  },
});
