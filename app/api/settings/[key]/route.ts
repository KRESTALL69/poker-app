import { NextResponse } from "next/server";
import { getAppSettingBool } from "@/features/settings";

export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await context.params;
    const value = await getAppSettingBool(key);
    return NextResponse.json({ value });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read setting" },
      { status: 500 }
    );
  }
}
