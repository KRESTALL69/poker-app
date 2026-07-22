import { vi, describe, it, expect, beforeEach } from "vitest";

const {
  playerRepository,
  tournamentLiveStateRepository,
  achievementRepository,
  resultRepository,
  registrationRepository,
} = vi.hoisted(() => ({
  playerRepository: {
    findById: vi.fn(),
    deleteById: vi.fn(),
  },
  tournamentLiveStateRepository: {
    deleteByPlayerId: vi.fn(),
  },
  achievementRepository: {
    deleteByPlayerId: vi.fn(),
  },
  resultRepository: {
    deleteByPlayerId: vi.fn(),
  },
  registrationRepository: {
    deleteByPlayerId: vi.fn(),
  },
}));

vi.mock("@/lib/repositories/player", () => ({ playerRepository }));
vi.mock("@/lib/repositories/tournament-live-state", () => ({ tournamentLiveStateRepository }));
vi.mock("@/lib/repositories/achievement", () => ({ achievementRepository }));
vi.mock("@/lib/repositories/result", () => ({ resultRepository }));
vi.mock("@/lib/repositories/registration", () => ({ registrationRepository }));

import { deleteManualPlayer } from "@/features/admin";

beforeEach(() => {
  playerRepository.findById.mockReset();
  playerRepository.deleteById.mockReset();
  tournamentLiveStateRepository.deleteByPlayerId.mockReset();
  achievementRepository.deleteByPlayerId.mockReset();
  resultRepository.deleteByPlayerId.mockReset();
  registrationRepository.deleteByPlayerId.mockReset();
});

describe("deleteManualPlayer", () => {
  it("deletes Telegram players and their related records, in order", async () => {
    playerRepository.findById.mockResolvedValue({ id: "player-1", telegram_id: 123456789 });
    tournamentLiveStateRepository.deleteByPlayerId.mockResolvedValue(undefined);
    achievementRepository.deleteByPlayerId.mockResolvedValue(undefined);
    resultRepository.deleteByPlayerId.mockResolvedValue(undefined);
    registrationRepository.deleteByPlayerId.mockResolvedValue(undefined);
    playerRepository.deleteById.mockResolvedValue(undefined);

    await expect(deleteManualPlayer("player-1")).resolves.toBeUndefined();

    expect(tournamentLiveStateRepository.deleteByPlayerId).toHaveBeenCalledWith("player-1");
    expect(achievementRepository.deleteByPlayerId).toHaveBeenCalledWith("player-1");
    expect(resultRepository.deleteByPlayerId).toHaveBeenCalledWith("player-1");
    expect(registrationRepository.deleteByPlayerId).toHaveBeenCalledWith("player-1");
    expect(playerRepository.deleteById).toHaveBeenCalledWith("player-1");
  });

  it("throws when the player does not exist", async () => {
    playerRepository.findById.mockResolvedValue(null);

    await expect(deleteManualPlayer("missing-player")).rejects.toThrow("Игрок не найден");
    expect(playerRepository.deleteById).not.toHaveBeenCalled();
  });
});
