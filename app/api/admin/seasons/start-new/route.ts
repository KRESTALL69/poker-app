import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { title?: string };

    if (!body.title?.trim()) {
      return NextResponse.json({ error: "Название нового сезона обязательно" }, { status: 400 });
    }

    const today = new Date().toISOString().split("T")[0];

    // Close current active season
    const { error: closeError } = await supabase
      .from("seasons")
      .update({ is_active: false, end_date: today })
      .eq("is_active", true);

    if (closeError) throw new Error(closeError.message);

    // Create new active season starting today
    const { data, error: createError } = await supabase
      .from("seasons")
      .insert({ title: body.title.trim(), start_date: today, is_active: true })
      .select("*")
      .single();

    if (createError) throw new Error(createError.message);

    return NextResponse.json({ season: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось начать новый сезон" },
      { status: 500 }
    );
  }
}
