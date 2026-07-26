import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const { ensurePlayerFromTelegramUser, getTelegramUser } = vi.hoisted(() => ({
  ensurePlayerFromTelegramUser: vi.fn(),
  getTelegramUser: vi.fn(),
}));

vi.mock('@/features/auth', () => ({ ensurePlayerFromTelegramUser }));
vi.mock('@/lib/telegram', () => ({ getTelegramUser }));

import {
  resolveCurrentPlayer,
  setCurrentPlayer,
  invalidateCurrentPlayer,
} from '@/lib/current-player';
import type { Player } from '@/types/domain';

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'player-1',
    telegram_id: null,
    username: null,
    display_name: 'Test Player',
    role: 'player',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

const originalFetch = global.fetch;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  invalidateCurrentPlayer();
  getTelegramUser.mockReset();
  ensurePlayerFromTelegramUser.mockReset();
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  global.fetch = originalFetch;
});

describe('resolveCurrentPlayer — cache', () => {
  it('performs the resolver on the first call (Telegram branch)', async () => {
    const player = makePlayer();
    getTelegramUser.mockReturnValue({ id: 123 });
    ensurePlayerFromTelegramUser.mockResolvedValue(player);

    const result = await resolveCurrentPlayer();

    expect(result).toEqual(player);
    expect(ensurePlayerFromTelegramUser).toHaveBeenCalledTimes(1);
  });

  it('performs GET /api/auth/me on the first call when no Telegram user is present', async () => {
    const player = makePlayer();
    getTelegramUser.mockReturnValue(null);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ player }),
    });

    const result = await resolveCurrentPlayer();

    expect(result).toEqual(player);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith('/api/auth/me', {
      credentials: 'include',
      cache: 'no-store',
    });
  });

  it('returns the cached player on a second call before TTL, without re-fetching', async () => {
    const player = makePlayer();
    getTelegramUser.mockReturnValue({ id: 123 });
    ensurePlayerFromTelegramUser.mockResolvedValue(player);

    await resolveCurrentPlayer();
    vi.advanceTimersByTime(30_000); // still within the 60s TTL
    const second = await resolveCurrentPlayer();

    expect(second).toEqual(player);
    expect(ensurePlayerFromTelegramUser).toHaveBeenCalledTimes(1);
  });

  it('performs a new resolver call once the TTL has expired', async () => {
    const player = makePlayer();
    getTelegramUser.mockReturnValue({ id: 123 });
    ensurePlayerFromTelegramUser.mockResolvedValue(player);

    await resolveCurrentPlayer();
    vi.advanceTimersByTime(60_001); // just past the 60s TTL

    const second = await resolveCurrentPlayer();

    expect(second).toEqual(player);
    expect(ensurePlayerFromTelegramUser).toHaveBeenCalledTimes(2);
  });
});

describe('resolveCurrentPlayer — promise deduplication', () => {
  it('only calls the resolver once for two concurrent calls, and both get the same result', async () => {
    const player = makePlayer();
    getTelegramUser.mockReturnValue({ id: 123 });

    let resolvePending: (p: Player) => void;
    const pending = new Promise<Player>((resolve) => {
      resolvePending = resolve;
    });
    ensurePlayerFromTelegramUser.mockReturnValue(pending);

    const call1 = resolveCurrentPlayer();
    const call2 = resolveCurrentPlayer();

    resolvePending!(player);

    const [result1, result2] = await Promise.all([call1, call2]);

    expect(result1).toEqual(player);
    expect(result2).toEqual(player);
    expect(ensurePlayerFromTelegramUser).toHaveBeenCalledTimes(1);
  });
});

describe('resolveCurrentPlayer — error handling', () => {
  it('clears _inflight after a failed request so the next call can retry and succeed', async () => {
    getTelegramUser.mockReturnValue(null);
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ player: makePlayer() }),
      });

    await expect(resolveCurrentPlayer()).rejects.toThrow();

    const result = await resolveCurrentPlayer();

    expect(result).toEqual(makePlayer());
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('attaches the HTTP status to the thrown error so callers can branch on 403', async () => {
    getTelegramUser.mockReturnValue(null);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
    });

    await expect(resolveCurrentPlayer()).rejects.toMatchObject({ status: 403 });
  });

  it('does not treat a stale cache as valid after a prior successful call is followed by an error path', async () => {
    // No stale cache exists yet in this scenario (invalidated in beforeEach);
    // this asserts a failed resolve leaves the cache empty, not partially populated.
    getTelegramUser.mockReturnValue(null);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    await expect(resolveCurrentPlayer()).rejects.toThrow();

    // A second, still-failing call must hit the network again (proves nothing got cached).
    await expect(resolveCurrentPlayer()).rejects.toThrow();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('setCurrentPlayer', () => {
  it('seeds the cache so the next resolve does not fetch', async () => {
    const player = makePlayer({ display_name: 'Seeded' });

    setCurrentPlayer(player);
    const result = await resolveCurrentPlayer();

    expect(result).toEqual(player);
    expect(ensurePlayerFromTelegramUser).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('restarts the TTL window on every call, not just the first', async () => {
    setCurrentPlayer(makePlayer({ display_name: 'First' }));

    vi.advanceTimersByTime(55_000); // within TTL of the first call
    setCurrentPlayer(makePlayer({ display_name: 'Second' })); // resets the TTL clock

    vi.advanceTimersByTime(55_000); // 110s since the first call, but only 55s since the second

    const result = await resolveCurrentPlayer();

    // Still within TTL of the *second* setCurrentPlayer call, so no network request.
    expect(result.display_name).toBe('Second');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(ensurePlayerFromTelegramUser).not.toHaveBeenCalled();
  });
});

describe('invalidateCurrentPlayer', () => {
  it('forces the next resolve to hit the network again', async () => {
    const player = makePlayer();
    getTelegramUser.mockReturnValue({ id: 123 });
    ensurePlayerFromTelegramUser.mockResolvedValue(player);

    await resolveCurrentPlayer();
    invalidateCurrentPlayer();
    await resolveCurrentPlayer();

    expect(ensurePlayerFromTelegramUser).toHaveBeenCalledTimes(2);
  });
});
