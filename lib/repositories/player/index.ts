import { databaseProvider } from "../provider";
import type { PlayerRepository } from "./Interface";
import { PostgresPlayerRepository } from "./PostgresPlayerRepository";
import { SupabasePlayerRepository } from "./SupabasePlayerRepository";

export const playerRepository: PlayerRepository =
  databaseProvider === "postgres" ? new PostgresPlayerRepository() : new SupabasePlayerRepository();
export type {
  PlayerRepository,
  DisplayNameCandidate,
  PlayerAccessFlags,
  PlayerNotificationRecipient,
  PlayerExportRow,
  PlayerProfileSummary,
} from "./Interface";
