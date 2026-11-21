import { NextResponse } from "next/server";
import { saveChildProfileRecord } from "@/db/repository";

export async function PUT(
  request: Request,
  context: { params: Promise<{ kidId: string }> }
) {
  const { kidId } = await context.params;
  const body = await request.json();
  const profile = await saveChildProfileRecord(
    kidId,
    body.profile,
    body.currentUser || "mom"
  );
  return NextResponse.json({ profile });
}
