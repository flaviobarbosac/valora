/**
 * Copia todos os dados do banco antigo (MariaDB/MySQL) para o PostgreSQL.
 *
 *   pnpm banco:copiar [--substituir]
 *
 * Lê de MARIADB_URL e grava em DATABASE_URL (as duas no .env). As tabelas do
 * PostgreSQL precisam existir (rode `pnpm db:migrate` antes) e estar vazias;
 * com --substituir, o conteúdo atual do PostgreSQL é apagado antes da cópia.
 * O MariaDB não é alterado.
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import mysql from "mysql2/promise";
import pg from "pg";

const fail = (message: string): never => {
  console.error(`Erro: ${message}`);
  process.exit(1);
};

async function main() {
  const { values } = parseArgs({ options: { substituir: { type: "boolean" } } });
  const source = process.env.MARIADB_URL || fail("MARIADB_URL não está definido no .env.");
  const target = process.env.DATABASE_URL || fail("DATABASE_URL não está definido no .env.");
  if (!target.startsWith("postgres")) fail("DATABASE_URL precisa apontar para o PostgreSQL.");

  // Datas como texto e em UTC, exatamente como estão gravadas.
  const from = await mysql.createConnection({ uri: source, dateStrings: true, timezone: "Z" });
  await from.query("SET time_zone = '+00:00'");
  const to = new pg.Client({ connectionString: target });
  await to.connect();

  const { rows: tables } = await to.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name",
  );
  if (!tables.length) fail("o PostgreSQL não tem tabelas. Rode `pnpm db:migrate` primeiro.");

  const filled: string[] = [];
  for (const { table_name } of tables) {
    const { rows } = await to.query(`SELECT 1 FROM "${table_name}" LIMIT 1`);
    if (rows.length) filled.push(table_name);
  }
  if (filled.length && !values.substituir) fail(`o PostgreSQL já tem dados (${filled.join(", ")}). Use --substituir para apagá-los e copiar de novo.`);

  await to.query("BEGIN");
  try {
    if (filled.length) await to.query(`TRUNCATE ${tables.map((table) => `"${table.table_name}"`).join(", ")} RESTART IDENTITY`);
    for (const { table_name: table } of tables) {
      const { rows: columns } = await to.query<{ column_name: string; data_type: string }>(
        "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
        [table],
      );
      const [sourceColumns] = await from.query<mysql.RowDataPacket[]>(`SHOW COLUMNS FROM \`${table}\``).catch(() => [[]] as unknown as [mysql.RowDataPacket[]]);
      const available = new Set(sourceColumns.map((column) => String(column.Field)));
      const shared = columns.filter((column) => available.has(column.column_name));
      if (!shared.length) { console.log(`${table}: não existe no MariaDB, ficou vazia.`); continue; }

      const [rows] = await from.query<mysql.RowDataPacket[]>(`SELECT ${shared.map((column) => `\`${column.column_name}\``).join(", ")} FROM \`${table}\``);
      const names = shared.map((column) => `"${column.column_name}"`).join(", ");
      const convert = (value: unknown, type: string) => (type === "boolean" && value !== null ? Boolean(Number(value)) : value);
      // Em lotes, para não estourar o limite de parâmetros do PostgreSQL.
      const batch = Math.max(1, Math.floor(30000 / shared.length));
      for (let start = 0; start < rows.length; start += batch) {
        const chunk = rows.slice(start, start + batch);
        const params: unknown[] = [];
        const tuples = chunk.map((row) => `(${shared.map((column) => { params.push(convert(row[column.column_name], column.data_type)); return `$${params.length}`; }).join(", ")})`);
        await to.query(`INSERT INTO "${table}" (${names}) VALUES ${tuples.join(", ")}`, params);
      }
      // Os próximos ids continuam depois dos que vieram do MariaDB.
      if (shared.some((column) => column.column_name === "id")) {
        await to.query(`SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 0) + 1, false)`);
      }
      console.log(`${table}: ${rows.length} ${rows.length === 1 ? "linha" : "linhas"}`);
    }
    await to.query("COMMIT");
  } catch (error) {
    await to.query("ROLLBACK");
    throw error;
  } finally {
    await from.end();
    await to.end();
  }
  console.log("Cópia concluída. O MariaDB continua intacto.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
