import { vi, describe, it, expect, beforeEach } from 'vitest';

const { registrationRepository, playerRepository, tournamentRepository } = vi.hoisted(() => ({
  registrationRepository: {
    findLatestByPlayerAndTournament: vi.fn(),
    findLatestActiveByPlayerAndTournament: vi.fn(),
    findRegisteredTournamentIds: vi.fn(),
    findOldestWaitlisted: vi.fn(),
    create: vi.fn(),
    setStatus: vi.fn(),
  },
  playerRepository: {
    findAccessFlags: vi.fn(),
  },
  tournamentRepository: {
    findById: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/registration', () => ({ registrationRepository }));
vi.mock('@/lib/repositories/player', () => ({ playerRepository }));
vi.mock('@/lib/repositories/tournament', () => ({ tournamentRepository }));

// Prevent achievements side-effects in unrelated tests
vi.mock('@/features/achievements', () => ({
  syncPlayersAchievements: vi.fn().mockResolvedValue(undefined),
}));

import {
  registerPlayerForTournament,
  cancelPlayerRegistration,
} from '@/features/tournaments';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal registration row factory */
function reg(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reg-1',
    player_id: 'player-1',
    tournament_id: 'tournament-1',
    status: 'registered',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

const FULL_TOURNAMENT = {
  id: 'tournament-1',
  title: 'Test Tournament',
  description: null,
  location: null,
  google_sheet_tab_name: null,
  start_at: '2024-12-01T18:00:00Z',
  max_players: 2, // 2 spots
  kind: 'free',
  season_id: null,
  status: 'open',
  created_at: '2024-01-01T00:00:00Z',
};

const FREE_ACCESS = { can_access_free: true, can_access_paid: false, can_access_cash: false };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  registrationRepository.findLatestByPlayerAndTournament.mockReset();
  registrationRepository.findLatestActiveByPlayerAndTournament.mockReset();
  registrationRepository.findRegisteredTournamentIds.mockReset();
  registrationRepository.findOldestWaitlisted.mockReset();
  registrationRepository.create.mockReset();
  registrationRepository.setStatus.mockReset();
  playerRepository.findAccessFlags.mockReset();
  tournamentRepository.findById.mockReset();
});

describe('registerPlayerForTournament', () => {
  it('assigns "waitlist" when all spots are taken', async () => {
    registrationRepository.findLatestByPlayerAndTournament.mockResolvedValue(null);
    playerRepository.findAccessFlags.mockResolvedValue(FREE_ACCESS);
    tournamentRepository.findById.mockResolvedValue(FULL_TOURNAMENT);
    registrationRepository.findRegisteredTournamentIds.mockResolvedValue([
      'tournament-1',
      'tournament-1',
    ]);
    registrationRepository.create.mockResolvedValue(reg({ id: 'reg-new', status: 'waitlist' }));

    const result = await registerPlayerForTournament('player-1', 'tournament-1');

    expect(result.status).toBe('waitlist');
    expect(registrationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'waitlist' })
    );
  });

  it('assigns "registered" when spots are available', async () => {
    registrationRepository.findLatestByPlayerAndTournament.mockResolvedValue(null);
    playerRepository.findAccessFlags.mockResolvedValue(FREE_ACCESS);
    tournamentRepository.findById.mockResolvedValue(FULL_TOURNAMENT);
    registrationRepository.findRegisteredTournamentIds.mockResolvedValue(['tournament-1']);
    registrationRepository.create.mockResolvedValue(reg({ id: 'reg-new', status: 'registered' }));

    const result = await registerPlayerForTournament('player-1', 'tournament-1');

    expect(result.status).toBe('registered');
    expect(registrationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'registered' })
    );
  });
});

describe('cancelPlayerRegistration', () => {
  it('promotes first waitlist player (created_at ASC) when a registered player cancels', async () => {
    registrationRepository.findLatestActiveByPlayerAndTournament.mockResolvedValue(
      reg({ status: 'registered' })
    );
    registrationRepository.setStatus.mockResolvedValue(undefined);
    registrationRepository.findOldestWaitlisted.mockResolvedValue(
      reg({
        id: 'waitlist-1',
        player_id: 'player-2',
        status: 'waitlist',
        created_at: '2024-01-01T01:00:00Z',
      })
    );

    await cancelPlayerRegistration('player-1', 'tournament-1');

    expect(registrationRepository.setStatus).toHaveBeenCalledTimes(2);
    expect(registrationRepository.setStatus).toHaveBeenNthCalledWith(1, 'reg-1', 'cancelled');
    expect(registrationRepository.setStatus).toHaveBeenNthCalledWith(2, 'waitlist-1', 'registered');
  });

  it('does NOT promote anyone when a waitlist player cancels', async () => {
    registrationRepository.findLatestActiveByPlayerAndTournament.mockResolvedValue(
      reg({ status: 'waitlist' })
    );
    registrationRepository.setStatus.mockResolvedValue(undefined);

    await cancelPlayerRegistration('player-1', 'tournament-1');

    expect(registrationRepository.setStatus).toHaveBeenCalledTimes(1);
    expect(registrationRepository.setStatus).toHaveBeenCalledWith('reg-1', 'cancelled');
    expect(registrationRepository.findOldestWaitlisted).not.toHaveBeenCalled();
  });
});
