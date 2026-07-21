import { NextResponse } from "next/server";
import { setAppSettingBool } from "@/features/settings";

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as { key?: string; value?: unknown };
    const { key, value } = body;

    if (!key || typeof value !== "boolean") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    await setAppSettingBool(key, value);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update setting" },
      { status: 500 }
    );
  }
}
