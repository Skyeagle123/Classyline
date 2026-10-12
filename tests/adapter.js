import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
export function database() {
  const sqlite = new DatabaseSync(":memory:");
  const migrations = new URL("../migrations/", import.meta.url);
  for (const file of readdirSync(migrations)
    .filter((x) => x.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync(new URL(file, migrations), "utf8"));
  const db = {
    prepare(sql) {
      let args = [];
      return {
        bind(...v) {
          args = v;
          return this;
        },
        async first() {
          return sqlite.prepare(sql).get(...args) || null;
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...args) };
        },
        async run() {
          const statement = sqlite.prepare(sql);
          if (statement.columns().length)
            return { results: statement.all(...args), meta: { changes: 0 } };
          const result = statement.run(...args);
          return { meta: { changes: Number(result.changes) } };
        },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const result = [];
        for (const s of statements) result.push(await s.run());
        sqlite.exec("COMMIT");
        return result;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
    sqlite,
  };
  return db;
}
