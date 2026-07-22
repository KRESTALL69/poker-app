import type { PlayerRepository } from "./Interface";
import { PostgresPlayerRepository } from "./PostgresPlayerRepository";

export const playerRepository: PlayerRepository = new PostgresPlayerRepository();
export type {
  PlayerRepository,
  DisplayNameCandidate,
  PlayerAccessFlags,
  PlayerNotificationRecipient,
  PlayerExportRow,
  PlayerProfileSummary,
} from "./Interface";
