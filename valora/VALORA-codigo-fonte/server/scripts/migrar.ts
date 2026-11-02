/**
 * Aplica as migrações de `drizzle/` sem precisar criar schemas no banco.
 *
 *   pnpm db:migrate:schema
 *
 * Em produção o VALORA fica num schema próprio ("valora") dentro de um banco
 * compartilhado, e o usuário dele não pode criar schemas. O `drizzle-kit migrate`
 * sempre roda CREATE SCHEMA, então este script faz o mesmo trabalho usando só o
 * schema que já existe (DATABASE_MIGRATIONS_SCHEMA) e o mesmo registro de
 * migrações do Drizzle (`__drizzle_migrations`), compatível com o drizzle-kit.
 */
import "dotenv/config";
import { readMigrationFiles } from "drizzle-orm/migrator";
import pg from "pg";

const fail = (message: string): never => {
  console.error(`Erro: ${message}`);
  process.exit(1);
};

async function main() {
  const url = process.env.DATABASE_URL || fail("DATABASE_URL não está definido.");
  const schema = process.env.DATABASE_MIGRATIONS_SCHEMA || fail("DATABASE_MIGRATIONS_SCHEMA não está definido.");
  const migrations = readMigrationFiles({ migrationsFolder: "./drizzle" });
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const table = `${client.escapeIdentifier(schema)}."__drizzle_migrations"`;
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS ${table} (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`);
    const { rows } = await client.query<{ created_at: string }>(`SELECT created_at FROM ${table} ORDER BY created_at DESC LIMIT 1`);
    const last = rows[0] ? Number(rows[0].created_at) : 0;
    const pending = migrations.filter((migration) => migration.folderMillis > last);
    if (!pending.length) {
      console.log("Nenhuma migração pendente.");
      return;
    }
    await client.query("BEGIN");
    for (const migration of pending) {
      for (const statement of migration.sql) if (statement.trim()) await client.query(statement);
      await client.query(`INSERT INTO ${table} (hash, created_at) VALUES ($1, $2)`, [migration.hash, migration.folderMillis]);
    }
    await client.query("COMMIT");
    console.log(`${pending.length} migração(ões) aplicada(s) no schema ${schema}.`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
