"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import type { FamilyStatePayload } from "@/types/family";
import { AuthScreen } from "@/components/auth/AuthScreen";
import FamilyApp from "@/components/FamilyApp";

export function AppShell({
  initialState,
  initialInviteCode = null,
  invitedFamilyName = null,
}: {
  initialState: FamilyStatePayload | null;
  initialInviteCode?: string | null;
  invitedFamilyName?: string | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<FamilyStatePayload | null>(initialState);

  if (!state) {
    return (
      <AuthScreen
        initialInviteCode={initialInviteCode}
        invitedFamilyName={invitedFamilyName}
        onAuthenticated={(nextState) => {
          setState(nextState);
          if (typeof window !== "undefined") {
            const url = new URL(window.location.href);
            if (url.searchParams.has("invite") || url.searchParams.has("code")) {
              url.searchParams.delete("invite");
              url.searchParams.delete("code");
              window.history.replaceState({}, "", url.pathname + url.search + url.hash);
            }
          }
          router.refresh();
        }}
      />
    );
  }

  return (
    <FamilyApp
      key={`${state.familyId}-${state.currentUser.id}`}
      initialState={state}
      onSignedOut={() => {
        setState(null);
        router.refresh();
      }}
    />
  );
}
