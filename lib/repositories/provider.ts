// Composition root — единственное место, которое читает DATABASE_PROVIDER.
// Ни один доменный index.ts не обращается к process.env самостоятельно (см.
// docs/POSTGRES_MIGRATION_ARCHITECTURE.md, Repository replacement strategy).
// Default — "supabase": добавление этого файла и переключателя не меняет
// поведение прода, пока флаг не выставлен явно.
export const databaseProvider: "supabase" | "postgres" =
  process.env.DATABASE_PROVIDER === "postgres" ? "postgres" : "supabase";
