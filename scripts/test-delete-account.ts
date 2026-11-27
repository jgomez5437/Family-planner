/* eslint-disable no-console */
/**
 * Account deletion & complete history erasure tests.
 * Run: npx tsx scripts/test-delete-account.ts
 */
import {
  addFamilyMember,
  addPostCommentRecord,
  createEventRecord,
  createGameRecord,
  createPostRecord,
  createTaskRecord,
  deleteFamilyMember,
  deleteUserAccount,
  getFamilyPreviewByInviteCode,
  getFamilyState,
  getNotificationsForMember,
  getSessionContext,
  loginAccount,
  registerAccount,
  saveMedicationRecord,
  toggleDoseRecord,
  togglePostReactionRecord,
  toggleTaskRecord,
  updateEventRecord,
  updateTaskRecord,
} from "../src/db/repository";

let failures = 0;
let passes = 0;

function check(cond: unknown, msg: string) {
  if (cond) {
    passes += 1;
  } else {
    failures += 1;
    console.error("  ✗", msg);
  }
}

async function run() {
  console.log("Setting up test family with Admin A, Adult B, Child C, and Pending D…");

  const regA = await registerAccount({
    name: "Alice",
    email: "alice@example.com",
    password: "password-alice",
    mode: "create",
    familyName: "Test Family",
  });
  check(regA.ok, "Admin Alice registered");
  if (!regA.ok) throw new Error("Failed to register Alice");

  const familyId = regA.state.familyId;
  const aliceId = regA.state.currentUser.id;
  const aliceToken = regA.token;
  const inviteCode = regA.state.inviteCode;

  const regB = await registerAccount({
    name: "Bob",
    email: "bob@example.com",
    password: "password-bob",
    mode: "join",
    inviteCode,
  });
  check(regB.ok, "Adult Bob joined via invite code");
  if (!regB.ok) throw new Error("Failed to join Bob");

  const bobId = regB.state.currentUser.id;
  const bobToken = regB.token;

  const childRes = await addFamilyMember(
    familyId,
    { name: "Charlie", emoji: "🧒", color: "#3E6FD9", light: "#E6ECFC", isChild: true },
    aliceId
  );
  check(childRes.ok, "Child Charlie added");
  if (!childRes.ok) throw new Error("Failed to add Charlie");
  const childId = childRes.member.id;

  const pendingRes = await addFamilyMember(
    familyId,
    {
      name: "Grandma",
      emoji: "👵",
      color: "#B25CC9",
      light: "#F3E5F7",
      isChild: false,
      email: "grandma@example.com",
    },
    bobId
  );
  check(pendingRes.ok, "Pending adult Grandma added");
  if (!pendingRes.ok) throw new Error("Failed to add Grandma");
  const pendingId = pendingRes.member.id;

  console.log("Populating shared & personal history across all features…");

  // Events: evByA (created by Alice), evByB (created by Bob, Alice participant + edited by Alice and Bob)
  const evByA = await createEventRecord(
    familyId,
    {
      title: "Alice Doctor Visit",
      date: "2026-12-01",
      startTime: "10:00",
      participants: [aliceId, bobId],
    },
    aliceId
  );
  const evByB = await createEventRecord(
    familyId,
    {
      title: "Family Dinner",
      date: "2026-12-02",
      startTime: "18:00",
      participants: [aliceId, bobId, childId],
      history: [{ by: bobId, at: new Date().toISOString(), note: "Created event" }],
    },
    bobId
  );
  await updateEventRecord(
    familyId,
    evByB.id,
    "location",
    "Grandma's House",
    "Updated venue",
    "series",
    aliceId
  );

  // Tasks:
  // 1) Created by Alice
  await createTaskRecord(
    familyId,
    { title: "Alice private chore", dueDate: "2026-12-01", assignedTo: bobId },
    aliceId
  );
  // 2) Created by Bob, assigned to Alice, completed by Alice, linked to evByA
  const taskByB = await createTaskRecord(
    familyId,
    {
      title: "Prepare forms",
      dueDate: "2026-12-01",
      assignedTo: aliceId,
      linkedEventId: evByA.id,
      linkedEventTitle: evByA.title,
    },
    bobId
  );
  await toggleTaskRecord(familyId, taskByB.id, aliceId);
  // 3) Recurring task created by Bob with an occurrence override referencing Alice
  const recurringByB = await createTaskRecord(
    familyId,
    {
      title: "Weekly Trash",
      dueDate: "2026-12-01",
      recurrence: "Weekly",
      assignedTo: bobId,
    },
    bobId
  );
  await updateTaskRecord(
    familyId,
    `${recurringByB.id}::2026-12-08`,
    { assignedTo: aliceId, linkedEventId: evByA.id },
    "instance",
    bobId
  );
  await toggleTaskRecord(familyId, `${recurringByB.id}::2026-12-08`, aliceId);

  // Medications & dose logs
  const med = await saveMedicationRecord(
    familyId,
    {
      id: "med_test_1",
      kidId: childId,
      name: "Vitamin D",
      dose: "1 drop",
      frequency: "Every day",
      times: ["08:00", "20:00"],
      startDate: "2026-11-01",
      endDate: null,
      instructions: "",
    },
    true,
    bobId
  );
  await toggleDoseRecord(
    familyId,
    `${med.id}|2026-11-26|08:00`,
    med.id,
    childId,
    med.name,
    "08:00",
    aliceId
  );
  await toggleDoseRecord(
    familyId,
    `${med.id}|2026-11-26|20:00`,
    med.id,
    childId,
    med.name,
    "20:00",
    bobId
  );

  // Wall posts, comments, reactions
  const postByA = await createPostRecord(
    familyId,
    { type: "Update", content: "Hello from Alice", images: [] },
    aliceId
  );
  await addPostCommentRecord(familyId, postByA.id, "Bob replies", bobId);
  await togglePostReactionRecord(familyId, postByA.id, "❤️", bobId);

  const postByB = await createPostRecord(
    familyId,
    { type: "Announcement", content: "Hello from Bob", images: [] },
    bobId
  );
  await addPostCommentRecord(familyId, postByB.id, "Alice comments here", aliceId);
  await addPostCommentRecord(familyId, postByB.id, "Bob's own comment", bobId);
  await togglePostReactionRecord(familyId, postByB.id, "👍", aliceId);
  await togglePostReactionRecord(familyId, postByB.id, "❤️", bobId);

  // Games
  const gameRes = await createGameRecord(familyId, aliceId, {
    gameType: "tic_tac_toe",
    opponentId: bobId,
  });
  check(gameRes.ok, "Game between Alice and Bob created");

  // Confirm Bob has notifications from Alice before deletion
  const bobNotifsBefore = await getNotificationsForMember(familyId, bobId);
  check(
    bobNotifsBefore.some((n) => n.actorId === aliceId),
    "Bob received notifications from Alice prior to deletion"
  );

  console.log("Testing password & member-endpoint safeguards…");

  const emptyPwdRes = await deleteUserAccount(familyId, aliceId, "");
  check(!emptyPwdRes.ok && emptyPwdRes.status === 400, "Empty password rejected (400)");

  const wrongPwdRes = await deleteUserAccount(familyId, aliceId, "wrong-password");
  check(!wrongPwdRes.ok && wrongPwdRes.status === 401, "Wrong password rejected (401)");

  const memberEndpointSelfRes = await deleteFamilyMember(familyId, aliceId, aliceId);
  check(
    !memberEndpointSelfRes.ok && memberEndpointSelfRes.status === 400,
    "deleteFamilyMember blocks deleting registered accounts directly"
  );

  const memberEndpointOtherRes = await deleteFamilyMember(familyId, bobId, aliceId);
  check(
    !memberEndpointOtherRes.ok && memberEndpointOtherRes.status === 403,
    "deleteFamilyMember blocks deleting another user's registered account (403)"
  );

  console.log("Deleting Alice's account…");
  const delAlice = await deleteUserAccount(familyId, aliceId, "password-alice");
  check(delAlice.ok && delAlice.familyDeleted === false, "Alice deleted without deleting shared family");

  // Verify Alice's auth & session are gone
  check((await getSessionContext(aliceToken)) === null, "Alice's session invalidated");
  const aliceLoginAfter = await loginAccount("alice@example.com", "password-alice");
  check(!aliceLoginAfter.ok, "Alice can no longer sign in");

  // Verify Bob's session & family state
  check((await getSessionContext(bobToken)) !== null, "Bob's session remains active");
  const stateAfterAlice = await getFamilyState(familyId, bobId);
  check(Boolean(stateAfterAlice), "Family state still loads for Bob");
  if (!stateAfterAlice) throw new Error("Family state missing after Alice deletion");

  check(
    !stateAfterAlice.members.some((m) => m.id === aliceId),
    "Alice removed from family members"
  );
  const bobUpdated = stateAfterAlice.members.find((m) => m.id === bobId);
  check(bobUpdated?.role === "admin", "Bob automatically promoted to admin");

  // Posts, comments, reactions
  check(
    stateAfterAlice.posts.length === 1 && stateAfterAlice.posts[0].id === postByB.id,
    "Alice's post deleted; Bob's post kept"
  );
  const keptPost = stateAfterAlice.posts[0];
  check(
    keptPost.comments.length === 1 && keptPost.comments[0].by === bobId,
    "Alice's comment erased from Bob's post; Bob's comment kept"
  );
  check(
    !(keptPost.reactions["👍"] || []).includes(aliceId) &&
      (keptPost.reactions["❤️"] || []).includes(bobId),
    "Alice's reaction erased from Bob's post; Bob's reaction kept"
  );

  // Events & history
  check(
    stateAfterAlice.events.length === 1 && stateAfterAlice.events[0].id === evByB.id,
    "Alice's event deleted; Bob's event kept"
  );
  const keptEvent = stateAfterAlice.events[0];
  check(
    !keptEvent.participants.includes(aliceId) &&
      keptEvent.participants.includes(bobId) &&
      keptEvent.participants.includes(childId),
    "Alice removed from shared event participants"
  );
  check(
    keptEvent.history.every((h) => h.by !== aliceId) &&
      keptEvent.history.some((h) => h.by === bobId),
    "Alice's edit history entries erased; Bob's history preserved"
  );

  // Tasks & overrides
  check(
    !stateAfterAlice.tasks.some((t) => t.createdBy === aliceId),
    "Tasks created by Alice deleted"
  );
  const keptTaskB = stateAfterAlice.tasks.find((t) => t.id === taskByB.id);
  check(
    Boolean(keptTaskB) &&
      keptTaskB?.assignedTo === null &&
      keptTaskB?.completedBy === null &&
      keptTaskB?.completedAt === null &&
      !keptTaskB?.linkedEventId &&
      !keptTaskB?.linkedEventTitle,
    "Bob's task scrubbed of Alice assignment, completion, and deleted event link"
  );
  const keptRecurring = stateAfterAlice.tasks.find((t) => t.id === recurringByB.id);
  const scrubbedOv = keptRecurring?.overrides?.["2026-12-08"];
  check(
    Boolean(scrubbedOv) &&
      scrubbedOv?.assignedTo === null &&
      scrubbedOv?.completedBy === null &&
      scrubbedOv?.completedAt === null &&
      scrubbedOv?.linkedEventId === null,
    "Recurring task overrides scrubbed of Alice references and deleted event link"
  );

  // Dose logs
  check(
    !stateAfterAlice.doseLog[`${med.id}|2026-11-26|08:00`] &&
      stateAfterAlice.doseLog[`${med.id}|2026-11-26|20:00`]?.by === bobId,
    "Alice's dose log erased; Bob's dose log preserved"
  );

  // Activities & Notifications & Games
  check(
    stateAfterAlice.activity.every(
      (a) => a.by !== aliceId && a.targetEventId !== evByA.id
    ),
    "Alice's activity feed items and deleted-event activities erased"
  );
  check(
    stateAfterAlice.notifications.every(
      (n) =>
        n.actorId !== aliceId &&
        n.recipientId !== aliceId &&
        n.target.entityId !== postByA.id
    ),
    "Notifications from/to Alice and targeting Alice's deleted post erased"
  );
  check(stateAfterAlice.games.length === 0, "Games involving Alice deleted");
  check(
    stateAfterAlice.meds.length === 1 && Boolean(stateAfterAlice.profiles[childId]),
    "Child profile and medications preserved"
  );

  // Verify pending member can still be deleted via deleteFamilyMember
  const delPending = await deleteFamilyMember(familyId, pendingId, bobId);
  check(delPending.ok, "Pending member can still be removed via deleteFamilyMember");

  // Verify Alice's email can be re-registered cleanly
  const reRegA = await registerAccount({
    name: "Alice New",
    email: "alice@example.com",
    password: "new-password",
    mode: "create",
    familyName: "Alice Solo Family",
  });
  check(reRegA.ok, "Former email can be re-registered after account deletion");
  if (reRegA.ok) {
    // Clean up Alice's new solo family
    const cleanup = await deleteUserAccount(
      reRegA.state.familyId,
      reRegA.state.currentUser.id,
      "new-password"
    );
    check(
      cleanup.ok && cleanup.familyDeleted === true,
      "Solo family deleted when its only account is deleted"
    );
  }

  console.log("Deleting Bob (now the last login account in Test Family)…");
  const delBob = await deleteUserAccount(familyId, bobId, "password-bob");
  check(
    delBob.ok && delBob.familyDeleted === true,
    "Deleting the last login account deletes the entire family workspace"
  );
  check((await getSessionContext(bobToken)) === null, "Bob's session invalidated");
  check(
    (await getFamilyState(familyId, bobId)) === null,
    "Family state no longer exists after last-account deletion"
  );
  check(
    (await getFamilyPreviewByInviteCode(inviteCode)) === null,
    "Family invite code no longer resolves after family deletion"
  );

  console.log(`Passed ${passes} check(s), failed ${failures} check(s).`);
  if (failures > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
