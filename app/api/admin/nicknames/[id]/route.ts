import { NextResponse } from "next/server";
import { approveNickname, rejectNickname } from "@/features/auth";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { action?: "approve" | "reject" };

    if (body.action !== "approve" && body.action !== "reject") {
      return NextResponse.json(
        { error: "Некорректное действие" },
        { status: 400 }
      );
    }

    const player =
      body.action === "approve"
        ? await approveNickname(id)
        : await rejectNickname(id);

    return NextResponse.json({ player });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не удалось обработать ник",
      },
      { status: 500 }
    );
  }
}
