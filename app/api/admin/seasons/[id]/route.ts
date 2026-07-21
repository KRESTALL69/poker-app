import { NextResponse } from "next/server";
import { seasonRepository } from "@/lib/repositories/season";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { action?: string };

    if (body.action === "close") {
      const today = new Date().toISOString().split("T")[0];
      try {
        await seasonRepository.closeById(id, today);
      } catch (error) {
        throw new Error((error as { message?: string })?.message ?? "Unknown error");
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "activate") {
      try {
        // Deactivate any currently active season first — prevents two active seasons
        await seasonRepository.deactivateOthers(id);
        await seasonRepository.activateById(id);
      } catch (error) {
        throw new Error((error as { message?: string })?.message ?? "Unknown error");
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось обновить сезон" },
      { status: 500 }
    );
  }
}
