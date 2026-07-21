import { NextResponse } from "next/server";
import { seasonRepository } from "@/lib/repositories/season";
import { tournamentRepository } from "@/lib/repositories/tournament";

export async function GET() {
  try {
    let seasons;
    try {
      seasons = await seasonRepository.list();
    } catch (error) {
      throw new Error((error as { message?: string })?.message ?? "Unknown error");
    }

    let seasonIds: Array<string | null>;
    try {
      seasonIds = await tournamentRepository.listSeasonIds();
    } catch (error) {
      throw new Error((error as { message?: string })?.message ?? "Unknown error");
    }

    const countMap = new Map<string, number>();
    for (const seasonId of seasonIds) {
      if (seasonId) {
        countMap.set(seasonId, (countMap.get(seasonId) ?? 0) + 1);
      }
    }

    const result = (seasons ?? []).map((s) => ({
      ...s,
      tournament_count: countMap.get(s.id) ?? 0,
    }));

    return NextResponse.json({ seasons: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось загрузить сезоны" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { title?: string; start_date?: string };

    if (!body.title?.trim()) {
      return NextResponse.json({ error: "Название сезона обязательно" }, { status: 400 });
    }
    if (!body.start_date) {
      return NextResponse.json({ error: "Дата начала обязательна" }, { status: 400 });
    }

    let season;
    try {
      season = await seasonRepository.create({
        title: body.title.trim(),
        startDate: body.start_date,
        isActive: false,
      });
    } catch (error) {
      throw new Error((error as { message?: string })?.message ?? "Unknown error");
    }

    return NextResponse.json({ season });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось создать сезон" },
      { status: 500 }
    );
  }
}
