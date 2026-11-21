"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import type { FamilyStatePayload } from "@/types/family";
import { AuthScreen } from "@/components/auth/AuthScreen";
import FamilyApp from "@/components/FamilyApp";

export function AppShell({
  initialState,
}: {
  initialState: FamilyStatePayload | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<FamilyStatePayload | null>(initialState);

  if (!state) {
    return (
      <AuthScreen
        onAuthenticated={(nextState) => {
          setState(nextState);
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
