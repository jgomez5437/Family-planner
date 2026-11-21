import { NextResponse } from "next/server";
import { getFamilyState, updateFamilyName } from "@/db/repository";

export async function GET() {
  const state = await getFamilyState();
  return NextResponse.json(state);
}

export async function PATCH(request: Request) {
  const body = await request.json();
  if (typeof body.familyName === "string" && body.familyName.trim()) {
    const familyName = await updateFamilyName(body.familyName);
    return NextResponse.json({ familyName });
  }
  return NextResponse.json({ error: "Invalid familyName" }, { status: 400 });
}
