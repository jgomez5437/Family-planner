import { NextResponse } from "next/server";
import {
  forfeitGameRecord,
  getAuthenticatedSession,
  getGameForViewer,
  makeGameMoveRecord,
  respondToGameInviteRecord,
} from "@/db/repository";
import { sanitizeGameForViewer } from "@/lib/games/registry";

/** Lightweight single-game read used for fast real-time polling. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  try {
    const game = await getGameForViewer(
      session.familyId,
      decodeURIComponent(id),
      session.member.id
    );
    if (!game) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }
    return NextResponse.json(
      { game, serverNow: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("Fetch game error:", err);
    return NextResponse.json(
      { error: "Could not load game." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const decodedId = decodeURIComponent(id);

  try {
    const body = await request.json().catch(() => ({}));
    const action = body?.action;

    if (action === "accept" || action === "decline" || action === "cancel") {
      const result = await respondToGameInviteRecord(
        session.familyId,
        decodedId,
        session.member.id,
        action
      );
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error },
          { status: result.status }
        );
      }
      return NextResponse.json({
        game: sanitizeGameForViewer(result.game, session.member.id),
        serverNow: new Date().toISOString(),
      });
    }

    if (action === "move") {
      const result = await makeGameMoveRecord(
        session.familyId,
        decodedId,
        session.member.id,
        body?.move
      );
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error, serverNow: new Date().toISOString() },
          { status: result.status }
        );
      }
      return NextResponse.json({
        game: sanitizeGameForViewer(result.game, session.member.id),
        serverNow: new Date().toISOString(),
      });
    }

    if (action === "forfeit") {
      const result = await forfeitGameRecord(
        session.familyId,
        decodedId,
        session.member.id
      );
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error },
          { status: result.status }
        );
      }
      return NextResponse.json({
        game: sanitizeGameForViewer(result.game, session.member.id),
        serverNow: new Date().toISOString(),
      });
    }

    return NextResponse.json(
      { error: "Unknown game action." },
      { status: 400 }
    );
  } catch (err) {
    console.error("Update game error:", err);
    return NextResponse.json(
      { error: "Could not update game." },
      { status: 500 }
    );
  }
}
