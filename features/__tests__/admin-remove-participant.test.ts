import { vi, describe, it, expect, beforeEach } from 'vitest';

const { registrationRepository } = vi.hoisted(() => ({
  registrationRepository: {
    findStatusAndTournament: vi.fn(),
    deleteById: vi.fn(),
    findOldestWaitlisted: vi.fn(),
    setStatus: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/registration', () => ({ registrationRepository }));

vi.mock('@/features/achievements', () => ({
  syncPlayersAchievements: vi.fn().mockResolvedValue(undefined),
}));

import { removeAdminTournamentParticipant } from '@/features/tournaments';

beforeEach(() => {
  registrationRepository.findStatusAndTournament.mockReset();
  registrationRepository.deleteById.mockReset();
  registrationRepository.findOldestWaitlisted.mockReset();
  registrationRepository.setStatus.mockReset();
});

describe('removeAdminTournamentParticipant', () => {
  it('promotes first waitlist player when a registered participant is removed', async () => {
    registrationRepository.findStatusAndTournament.mockResolvedValue({
      status: 'registered',
      tournament_id: 'tournament-1',
    });
    registrationRepository.deleteById.mockResolvedValue(undefined);
    registrationRepository.findOldestWaitlisted.mockResolvedValue({
      id: 'waitlist-1',
      tournament_id: 'tournament-1',
      status: 'waitlist',
      created_at: '2024-01-01T01:00:00Z',
    });
    registrationRepository.setStatus.mockResolvedValue(undefined);

    await removeAdminTournamentParticipant('reg-1');

    expect(registrationRepository.deleteById).toHaveBeenCalledWith('reg-1');
    expect(registrationRepository.setStatus).toHaveBeenCalledWith('waitlist-1', 'registered');
  });

  it('does NOT promote anyone when a waitlist participant is removed', async () => {
    registrationRepository.findStatusAndTournament.mockResolvedValue({
      status: 'waitlist',
      tournament_id: 'tournament-1',
    });
    registrationRepository.deleteById.mockResolvedValue(undefined);

    await removeAdminTournamentParticipant('reg-waitlist-1');

    expect(registrationRepository.deleteById).toHaveBeenCalledWith('reg-waitlist-1');
    expect(registrationRepository.findOldestWaitlisted).not.toHaveBeenCalled();
    expect(registrationRepository.setStatus).not.toHaveBeenCalled();
  });

  it('does NOT throw when registered participant is removed but waitlist is empty', async () => {
    registrationRepository.findStatusAndTournament.mockResolvedValue({
      status: 'registered',
      tournament_id: 'tournament-1',
    });
    registrationRepository.deleteById.mockResolvedValue(undefined);
    registrationRepository.findOldestWaitlisted.mockResolvedValue(null);

    await expect(removeAdminTournamentParticipant('reg-1')).resolves.toBeUndefined();

    expect(registrationRepository.setStatus).not.toHaveBeenCalled();
  });
});
