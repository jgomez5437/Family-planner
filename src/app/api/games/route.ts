import { NextResponse } from "next/server";
import {
  createGameRecord,
  getAuthenticatedSession,
  getGamesForFamily,
} from "@/db/repository";
import {
  sanitizeGameForViewer,
  sanitizeGamesForViewer,
} from "@/lib/games/registry";

export async function GET() {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const familyGames = await getGamesForFamily(session.familyId);
    return NextResponse.json({
      games: sanitizeGamesForViewer(familyGames, session.member.id),
      serverNow: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Fetch games error:", err);
    return NextResponse.json(
      { error: "Could not load games." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const result = await createGameRecord(session.familyId, session.member.id, {
      gameType: body?.gameType,
      opponentId: body?.opponentId,
      mode: body?.mode === "pass_and_play" ? "pass_and_play" : "remote",
      rematchOfId:
        typeof body?.rematchOfId === "string" ? body.rematchOfId : null,
      options:
        body?.options &&
        typeof body.options === "object" &&
        !Array.isArray(body.options)
          ? (body.options as Record<string, unknown>)
          : undefined,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json(
      {
        game: sanitizeGameForViewer(result.game, session.member.id),
        serverNow: new Date().toISOString(),
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("Create game error:", err);
    return NextResponse.json(
      { error: "Could not create game." },
      { status: 500 }
    );
  }
}
