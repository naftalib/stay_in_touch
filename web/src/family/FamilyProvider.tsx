import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, Outlet, useParams } from "react-router";
import { isUuid } from "../lib/uuid.ts";
import { useMemberships } from "./useMemberships.ts";
import { useSpaces } from "./useSpaces.ts";
import SpaceUnavailable from "../spaces/SpaceUnavailable.tsx";
import type { MembershipContext } from "./types.ts";
import styles from "./FamilyProvider.module.css";

const FamilyContext = createContext<MembershipContext | null>(null);

export function useFamily(): MembershipContext {
  const ctx = useContext(FamilyContext);
  if (!ctx) {
    throw new Error("useFamily must be used within an active family route");
  }
  return ctx;
}

export function FamilyGate() {
  const { familyId } = useParams<{ familyId: string }>();
  const membershipsQuery = useMemberships();
  const spacesQuery = useSpaces(familyId && isUuid(familyId) ? familyId : "");
  const refreshedEmptySpaces = useRef(false);
  const sawAccess = useRef(false);
  const [removed, setRemoved] = useState(false);

  const membership = useMemo(() => {
    if (!familyId || !membershipsQuery.data) return undefined;
    return membershipsQuery.data.find((m) => m.family_id === familyId);
  }, [familyId, membershipsQuery.data]);

  useEffect(() => {
    if (membership) {
      sawAccess.current = true;
      return;
    }
    if (sawAccess.current) setRemoved(true);
  }, [membership]);

  useEffect(() => {
    if (refreshedEmptySpaces.current) return;
    if (!membership) return;
    if (spacesQuery.isSuccess && spacesQuery.data.length === 0) {
      refreshedEmptySpaces.current = true;
      void membershipsQuery.refetch();
    }
  }, [membership, membershipsQuery, spacesQuery.data, spacesQuery.isSuccess]);

  if (!familyId || !isUuid(familyId)) {
    return <Navigate to="/" replace />;
  }

  if (membershipsQuery.isPending) {
    return (
      <div className={styles.loading} role="status">
        Loading your family…
      </div>
    );
  }

  if (membershipsQuery.isError) {
    return (
      <div className={styles.error} role="alert">
        <p>Could not load memberships.</p>
        <button type="button" onClick={() => void membershipsQuery.refetch()}>
          Try again
        </button>
      </div>
    );
  }

  if (!membership) {
    if (removed) {
      return (
        <main className={styles.empty}>
          <h1>You no longer have access to this family</h1>
          <p>Ask a parent if you think this is a mistake.</p>
          <Link to="/">Back to your families</Link>
        </main>
      );
    }
    return <SpaceUnavailable familyId={familyId} generalTo="/" />;
  }

  const value: MembershipContext = {
    membership,
    role: membership.role,
    memberId: membership.id,
    familyId: membership.family_id,
    userId: membership.user_id,
  };

  return (
    <FamilyContext.Provider value={value}>
      <Outlet />
    </FamilyContext.Provider>
  );
}

export function FamilyPicker({ children }: { children?: ReactNode }) {
  const membershipsQuery = useMemberships();

  if (membershipsQuery.isPending) {
    return (
      <div className={styles.loading} role="status">
        Loading…
      </div>
    );
  }

  if (membershipsQuery.isError) {
    return (
      <div className={styles.error} role="alert">
        <p>Could not load memberships.</p>
        <button type="button" onClick={() => void membershipsQuery.refetch()}>
          Try again
        </button>
      </div>
    );
  }

  const first = membershipsQuery.data?.[0];
  if (first) {
    return <Navigate to={`/f/${first.family_id}`} replace />;
  }

  return (
    children ?? (
      <main className={styles.empty}>
        <h1>No family yet</h1>
        <p>When a parent adds you, your spaces will show up here.</p>
      </main>
    )
  );
}
