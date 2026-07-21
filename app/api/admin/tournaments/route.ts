import { NextResponse } from "next/server";
import {
  getAdminNotificationTournaments,
  getOpenTournaments,
} from "@/features/tournaments";
import type { TournamentKind } from "@/types/domain";
import { seasonRepository } from "@/lib/repositories/season";
import { tournamentRepository } from "@/lib/repositories/tournament";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope");

    const tournaments =
      scope === "all"
        ? await getAdminNotificationTournaments()
        : await getOpenTournaments();

    return NextResponse.json({ tournaments });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не удалось загрузить турниры",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      title: string;
      description: string;
      location: string;
      start_at: string;
      max_players: number;
      kind: TournamentKind;
    };

    let activeSeasonId: string;
    try {
      const id = await seasonRepository.findActiveId();
      if (id === null) {
        return NextResponse.json(
          { error: "Активный сезон не найден" },
          { status: 400 }
        );
      }
      activeSeasonId = id;
    } catch (error) {
      const message = (error as { message?: string })?.message ?? "Unknown error";
      return NextResponse.json(
        { error: `Не удалось получить активный сезон: ${message}` },
        { status: 500 }
      );
    }

    let tournament;
    try {
      tournament = await tournamentRepository.create({
        title: body.title,
        description: body.description,
        location: body.location,
        start_at: body.start_at,
        max_players: body.max_players,
        kind: body.kind,
        season_id: activeSeasonId,
      });
    } catch (error) {
      const message = (error as { message?: string })?.message ?? "Unknown error";
      return NextResponse.json(
        { error: `Не удалось создать турнир: ${message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ tournament });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не удалось создать турнир",
      },
      { status: 500 }
    );
  }
}
