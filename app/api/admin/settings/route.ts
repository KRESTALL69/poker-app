import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function createSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase admin env is not configured");
  }

  return createClient(url, serviceRoleKey);
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as { key?: string; value?: unknown };
    const { key, value } = body;

    if (!key || typeof value !== "boolean") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const admin = createSupabaseAdmin();
    const { error } = await admin
      .from("app_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update setting" },
      { status: 500 }
    );
  }
}
