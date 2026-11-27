import { NextResponse } from "next/server";
import {
  clearNotificationsRecord,
  getAuthenticatedSession,
  getGamesForFamily,
  getMembersForFamily,
  getNotificationsForMember,
  getPostsForFamily,
  markAllNotificationsReadRecord,
  markNotificationReadRecord,
} from "@/db/repository";
import { sanitizeGamesForViewer } from "@/lib/games/registry";

export async function GET() {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [items, posts, familyMembers, familyGames] = await Promise.all([
      getNotificationsForMember(session.familyId, session.member.id),
      getPostsForFamily(session.familyId),
      getMembersForFamily(session.familyId),
      getGamesForFamily(session.familyId),
    ]);
    return NextResponse.json({
      notifications: items,
      posts,
      members: familyMembers,
      games: sanitizeGamesForViewer(familyGames, session.member.id),
    });
  } catch (err) {
    console.error("Fetch notifications error:", err);
    return NextResponse.json(
      { error: "Could not load notifications." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    if (body?.markAllRead) {
      await markAllNotificationsReadRecord(session.familyId, session.member.id);
      return NextResponse.json({ ok: true });
    }
    if (typeof body?.id === "string" && body.id.trim()) {
      await markNotificationReadRecord(
        session.familyId,
        session.member.id,
        body.id.trim()
      );
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(
      { error: "Provide a notification id or markAllRead: true." },
      { status: 400 }
    );
  } catch (err) {
    console.error("Update notifications error:", err);
    return NextResponse.json(
      { error: "Could not update notifications." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await clearNotificationsRecord(session.familyId, session.member.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Clear notifications error:", err);
    return NextResponse.json(
      { error: "Could not clear notifications." },
      { status: 500 }
    );
  }
}
