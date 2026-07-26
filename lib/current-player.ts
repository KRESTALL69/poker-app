import { ensurePlayerFromTelegramUser } from "@/features/auth";
import { getTelegramUser } from "@/lib/telegram";
import type { Player } from "@/types/domain";

const TTL_MS = 60_000;

let _cachedPlayer: Player | null = null;
let _cachedAt: number | null = null;
let _inflight: Promise<Player> | null = null;

function isCacheValid(): boolean {
  return (
    _cachedPlayer !== null &&
    _cachedAt !== null &&
    Date.now() - _cachedAt < TTL_MS
  );
}

/**
 * Resolves the current player, same as every page already does today
 * (Telegram user -> ensurePlayerFromTelegramUser, else -> GET /api/auth/me),
 * but shares one in-memory result across the whole tab instead of every
 * page/component re-running that resolution from scratch.
 *
 * Cache is valid for TTL_MS. A rejected /api/auth/me response is re-thrown
 * with its HTTP status attached, so callers that currently branch on 403
 * (blocked) vs other failures keep working unchanged.
 */
export async function resolveCurrentPlayer(): Promise<Player> {
  if (isCacheValid()) {
    return _cachedPlayer as Player;
  }

  if (_inflight) {
    return _inflight;
  }

  _inflight = (async () => {
    try {
      const telegramUser = getTelegramUser();
      let player: Player;

      if (telegramUser) {
        player = await ensurePlayerFromTelegramUser(telegramUser);
      } else {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        });

        if (!response.ok) {
          const error = new Error("Необходимо войти в систему") as Error & {
            status?: number;
          };
          error.status = response.status;
          throw error;
        }

        const payload = (await response.json()) as { player: Player };
        player = payload.player;
      }

      _cachedPlayer = player;
      _cachedAt = Date.now();
      return player;
    } finally {
      _inflight = null;
    }
  })();

  return _inflight;
}

/**
 * Seeds the cache with a Player object the caller already has on hand
 * (e.g. the return value of a self-service mutation), avoiding a redundant
 * refetch. Resets the TTL window.
 */
export function setCurrentPlayer(player: Player): void {
  _cachedPlayer = player;
  _cachedAt = Date.now();
  _inflight = null;
}

/**
 * Clears the cache outright. Use on logout, or whenever there is no fresh
 * Player object to seed the cache with directly.
 */
export function invalidateCurrentPlayer(): void {
  _cachedPlayer = null;
  _cachedAt = null;
  _inflight = null;
}
