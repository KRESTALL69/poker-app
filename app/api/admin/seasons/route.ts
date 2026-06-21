import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const { data: seasons, error: seasonsError } = await supabase
      .from("seasons")
      .select("id, title, start_date, end_date, is_active")
      .order("start_date", { ascending: false });

    if (seasonsError) throw new Error(seasonsError.message);

    const { data: tournaments, error: tournamentsError } = await supabase
      .from("tournaments")
      .select("season_id");

    if (tournamentsError) throw new Error(tournamentsError.message);

    const countMap = new Map<string, number>();
    for (const t of tournaments ?? []) {
      if (t.season_id) {
        countMap.set(t.season_id, (countMap.get(t.season_id) ?? 0) + 1);
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

    const { data, error } = await supabase
      .from("seasons")
      .insert({ title: body.title.trim(), start_date: body.start_date, is_active: false })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ season: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось создать сезон" },
      { status: 500 }
    );
  }
}
