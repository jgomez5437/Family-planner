"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { FamilyStatePayload } from "@/types/family";
import { AuthScreen } from "@/components/auth/AuthScreen";
import FamilyApp from "@/components/FamilyApp";

function clearInviteParamsFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (url.searchParams.has("invite") || url.searchParams.has("code")) {
    url.searchParams.delete("invite");
    url.searchParams.delete("code");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }
}

export function AppShell({
  initialState,
  initialInviteCode = null,
  invitedFamilyName = null,
  initialInviteInvalid = false,
}: {
  initialState: FamilyStatePayload | null;
  initialInviteCode?: string | null;
  invitedFamilyName?: string | null;
  initialInviteInvalid?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<FamilyStatePayload | null>(initialState);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(initialInviteCode);
  const [inviteFamilyName, setInviteFamilyName] = useState<string | null>(
    invitedFamilyName
  );
  const [inviteInvalid, setInviteInvalid] = useState<boolean>(
    initialInviteInvalid
  );

  // If the user is already signed in and opens an invite link for their own family,
  // clean the query parameter from the address bar.
  useEffect(() => {
    if (
      state &&
      inviteCode &&
      state.inviteCode.toUpperCase() === inviteCode.toUpperCase()
    ) {
      clearInviteParamsFromUrl();
      setInviteCode(null);
      setInviteFamilyName(null);
      setInviteInvalid(false);
    }
  }, [state, inviteCode]);

  if (!state) {
    return (
      <AuthScreen
        initialInviteCode={inviteCode}
        invitedFamilyName={inviteFamilyName}
        initialInviteInvalid={inviteInvalid}
        initialNotice={authNotice}
        onAuthenticated={(nextState) => {
          setAuthNotice(null);
          setState(nextState);
          setInviteCode(null);
          setInviteFamilyName(null);
          setInviteInvalid(false);
          clearInviteParamsFromUrl();
          router.refresh();
        }}
      />
    );
  }

  return (
    <FamilyApp
      key={`${state.familyId}-${state.currentUser.id}`}
      initialState={state}
      onSignedOut={(options) => {
        setAuthNotice(options?.notice || null);
        setState(null);
        router.refresh();
      }}
    />
  );
}
