// `supabase/schema.sql` is run by hand, in Rê's live project, sometimes more than once.
// Nothing here talks to Postgres — these read the file for the mistakes that only show up
// on a database that already exists, which is the one case a fresh project never reveals.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sql = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

/** The columns a table has after the whole file has run: the create block plus every alter. */
function columnsOf(table: string): Set<string> {
  const columns = new Set<string>();
  const block = sql.match(new RegExp(`create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`));
  if (block) {
    for (const line of block[1].split("\n")) {
      const bare = line.trim();
      if (!bare || bare.startsWith("--")) continue;
      // "score_space smallint check (...)" and "age_band text, life_stage text" both appear.
      for (const part of bare.split(",")) {
        const name = part.trim().split(/\s+/)[0];
        if (/^[a-z_][a-z0-9_]*$/.test(name) && !["check", "constraint", "primary", "unique"].includes(name)) {
          columns.add(name);
        }
      }
    }
  }
  for (const m of sql.matchAll(new RegExp(`alter table public\\.${table} add column if not exists (\\w+)`, "g"))) {
    columns.add(m[1]);
  }
  return columns;
}

test("every column an index needs actually exists by the time the index is made", () => {
  // `create table if not exists` does nothing on a table that already exists, so a column
  // added inside that block reaches a new project and silently skips the live one. This is
  // exactly how `link_token` failed in Rê's project: the index two lines later had nothing
  // to index. A column added later belongs in an `alter table … add column if not exists`.
  for (const m of sql.matchAll(/create index if not exists \w+ on public\.(\w+) \(([\w ]+)/g)) {
    const [, table, column] = m;
    const known = columnsOf(table);
    const name = column.trim().split(/\s+/)[0];
    assert.ok(
      known.has(name),
      `the index on public.${table} uses "${name}", which no create-table block or ` +
        `"alter table public.${table} add column if not exists" ever creates`,
    );
  }
});

test("a function reads no column the schema does not create", () => {
  // The same failure one step later: a security-definer function naming a column that only
  // exists in the create block would pass on a new project and fail on Rê's.
  const mapColumns = columnsOf("maps");
  for (const name of ["link_token", "shared_at", "finished_at", "status", "note"]) {
    assert.ok(mapColumns.has(name), `maps.${name}`);
  }
  assert.ok(columnsOf("contacts").has("answers"), "contacts.answers");
});

test("the file says plainly that it is meant to be run again", () => {
  assert.match(sql, /repeatable|run it again|safe to run/i);
  // Anything that would refuse a second run.
  assert.doesNotMatch(sql, /^create table public\./m, "use `create table if not exists`");
  assert.doesNotMatch(sql, /^create index (?!if not exists)/m, "use `create index if not exists`");
});
