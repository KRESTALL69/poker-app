import { NextResponse } from "next/server";
import { seasonRepository } from "@/lib/repositories/season";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { title?: string };

    if (!body.title?.trim()) {
      return NextResponse.json({ error: "Название нового сезона обязательно" }, { status: 400 });
    }

    const today = new Date().toISOString().split("T")[0];

    let season;
    try {
      // Close current active season
      await seasonRepository.closeActiveSeason(today);

      // Create new active season starting today
      season = await seasonRepository.create({
        title: body.title.trim(),
        startDate: today,
        isActive: true,
      });
    } catch (error) {
      throw new Error((error as { message?: string })?.message ?? "Unknown error");
    }

    return NextResponse.json({ season });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось начать новый сезон" },
      { status: 500 }
    );
  }
}
