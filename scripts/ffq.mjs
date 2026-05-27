// scripts/ffq.mjs — dev-раннер для разовых SQL-запросов к prod-БД.
// Использование:
//   FFQ_DB_URL='postgresql://...' node scripts/ffq.mjs "select 1"
//   FFQ_DB_URL='postgresql://...' node scripts/ffq.mjs --file path/to/file.sql
// Можно передавать несколько statement'ов одной строкой через ;.
//
// Не в git как зависимость (pg ставится `npm install --no-save pg`).
import pg from "pg";
import { readFile } from "node:fs/promises";

const url = process.env.FFQ_DB_URL;
if (!url) {
  console.error("FFQ_DB_URL не задан");
  process.exit(1);
}

const args = process.argv.slice(2);
let sql;
if (args[0] === "--file") {
  if (!args[1]) {
    console.error("--file требует путь");
    process.exit(1);
  }
  sql = await readFile(args[1], "utf8");
} else {
  sql = args.join(" ");
}
if (!sql || !sql.trim()) {
  console.error("Пустой SQL");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const res = await client.query(sql);
  if (Array.isArray(res)) {
    for (const r of res) {
      console.log(`-- ${r.command} (${r.rowCount ?? 0} rows)`);
      if (r.rows?.length) console.table(r.rows);
    }
  } else {
    console.log(`-- ${res.command} (${res.rowCount ?? 0} rows)`);
    if (res.rows?.length) console.table(res.rows);
  }
} finally {
  await client.end();
}
