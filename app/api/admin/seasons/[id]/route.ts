import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { action?: string };

    if (body.action === "close") {
      const today = new Date().toISOString().split("T")[0];
      const { error } = await supabase
        .from("seasons")
        .update({ is_active: false, end_date: today })
        .eq("id", id);

      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "activate") {
      // Deactivate any currently active season first — prevents two active seasons
      const { error: deactivateError } = await supabase
        .from("seasons")
        .update({ is_active: false })
        .eq("is_active", true)
        .neq("id", id);

      if (deactivateError) throw new Error(deactivateError.message);

      const { error: activateError } = await supabase
        .from("seasons")
        .update({ is_active: true, end_date: null })
        .eq("id", id);

      if (activateError) throw new Error(activateError.message);

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
