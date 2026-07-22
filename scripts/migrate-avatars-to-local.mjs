// One-off, re-runnable migration: moves any players.custom_avatar_url that
// still points at Supabase Storage onto the local filesystem served by
// LocalAvatarStorageRepository (see lib/repositories/avatar-storage/).
// Idempotent — only touches rows whose custom_avatar_url still contains
// "supabase.co/storage"; already-migrated rows are skipped on re-run.
// Intended to run via `docker compose run --rm migrate node
// scripts/migrate-avatars-to-local.mjs` so it has the same DATABASE_URL and
// the same ./storage bind mount as the app container.
import postgres from "postgres";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const DRY_RUN = process.argv.includes("--dry-run");

const EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function extensionFor(contentType) {
  return EXTENSIONS[contentType?.split(";")[0]?.trim()] ?? "jpg";
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error(JSON.stringify({ error: "DATABASE_URL is not set" }));
  process.exit(1);
}

const publicBaseUrl = process.env.NEXT_PUBLIC_APP_URL;
if (!publicBaseUrl) {
  console.error(JSON.stringify({ error: "NEXT_PUBLIC_APP_URL is not set" }));
  process.exit(1);
}

const storageRoot = path.join(process.cwd(), "public", "storage", "avatars");

const sql = postgres(connectionString, { max: 1 });

async function main() {
  const rows = await sql`
    SELECT id, custom_avatar_url
    FROM players
    WHERE custom_avatar_url LIKE '%supabase.co/storage%'
  `;

  console.log(JSON.stringify({ found: rows.length }));

  for (const row of rows) {
    const sourceUrl = row.custom_avatar_url.split("?")[0];

    const response = await fetch(sourceUrl);
    if (!response.ok) {
      console.error(
        JSON.stringify({
          player_id: row.id,
          error: `fetch failed: ${response.status}`,
          source_url: sourceUrl,
        })
      );
      continue;
    }

    const contentType = response.headers.get("content-type");
    const extension = extensionFor(contentType);
    const filePath = `${row.id}/avatar.${extension}`;
    const destination = path.join(storageRoot, filePath);
    const newUrl = `${publicBaseUrl}/storage/avatars/${filePath}?v=${Date.now()}`;

    if (DRY_RUN) {
      console.log(
        JSON.stringify({
          player_id: row.id,
          dry_run: true,
          content_type: contentType,
          destination,
          new_url: newUrl,
        })
      );
      continue;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buffer);

    await sql`
      UPDATE players SET custom_avatar_url = ${newUrl} WHERE id = ${row.id}
    `;

    console.log(
      JSON.stringify({
        player_id: row.id,
        bytes: buffer.length,
        content_type: contentType,
        destination,
        new_url: newUrl,
      })
    );
  }

  await sql.end();
  console.log(JSON.stringify({ done: true, dry_run: DRY_RUN }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
