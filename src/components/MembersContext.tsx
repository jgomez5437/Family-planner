"use client";

import React, { createContext, useContext, useMemo } from "react";
import { findMemberById } from "@/lib/constants";
import type { Member, MemberId } from "@/types/family";

interface MembersContextValue {
  members: Member[];
  childrenMembers: Member[];
  memberById: (id?: MemberId | null) => Member;
}

const MembersContext = createContext<MembersContextValue>({
  members: [],
  childrenMembers: [],
  memberById: (id) => findMemberById(id, []),
});

export function MembersProvider({
  members,
  children,
}: {
  members: Member[];
  children: React.ReactNode;
}) {
  const value = useMemo<MembersContextValue>(
    () => ({
      members,
      childrenMembers: members.filter((m) => m.isChild),
      memberById: (id) => findMemberById(id, members),
    }),
    [members]
  );

  return (
    <MembersContext.Provider value={value}>{children}</MembersContext.Provider>
  );
}

export function useMembers(): MembersContextValue {
  return useContext(MembersContext);
}
