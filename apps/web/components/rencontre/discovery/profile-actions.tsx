"use client";

import type { MemberCard, ProfileView } from "@atomes/contracts";
import { ORPCError } from "@orpc/client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createContext, type ReactNode, use, useState } from "react";
import { SafetyMenu } from "@/components/acces/safety/safety-menu";
import { api } from "@/lib/api-client";
import { Liaison } from "../matches/liaison";
import { type LikeRequest, LikeSheet } from "./like-sheet";
import { HeartButton, type LikedContent } from "./member-card";

interface ProfileState {
  readonly profile: ProfileView;
  readonly decision: ProfileView["myDecision"];
  readonly matchId: string | null;
  requestLike(content: LikedContent | null, superlike: boolean): void;
  pass(): Promise<void>;
}

const ProfileContext = createContext<ProfileState | null>(null);

function useProfile(): ProfileState {
  const state = use(ProfileContext);
  if (!state) {
    throw new Error("Profile actions must be rendered inside <ProfileInteractions>.");
  }
  return state;
}

/** Interactive layer of a member profile: like sheet, match screen and decision state. */
export function ProfileInteractions({
  profile,
  me,
  children,
}: {
  profile: ProfileView;
  me: MemberCard | null;
  children: ReactNode;
}) {
  const t = useTranslations("discovery");
  const router = useRouter();
  const [decision, setDecision] = useState(profile.myDecision);
  const [matchId, setMatchId] = useState(profile.matchId);
  const [request, setRequest] = useState<LikeRequest | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liaison, setLiaison] = useState<string | null>(null);
  const [superlikesLeft, setSuperlikesLeft] = useState(1);

  const decide = async (
    kind: "like" | "superlike" | "pass",
    content: LikedContent | null,
    comment: string | null,
  ) => {
    setPending(true);
    setError(null);
    try {
      const result = await api.discovery.decide({
        targetId: profile.card.userId,
        kind,
        content: content ? { type: content.type, id: content.id } : null,
        comment,
      });
      setSuperlikesLeft(result.quota.superlikesLeft);
      setDecision(kind);
      if (result.matchId) {
        setMatchId(result.matchId);
        setLiaison(result.matchId);
      }
      return true;
    } catch (cause) {
      const code = cause instanceof ORPCError ? cause.message : "generic";
      setError(t(`errors.${code}` as "errors.generic"));
      return false;
    } finally {
      setPending(false);
    }
  };

  const state: ProfileState = {
    profile,
    decision,
    matchId,
    requestLike: (content, superlike) => {
      setError(null);
      setRequest({ name: profile.card.firstName, content, superlike });
    },
    pass: async () => {
      if (await decide("pass", null, null)) {
        router.back();
      }
    },
  };

  return (
    <ProfileContext value={state}>
      {children}
      <LikeSheet
        request={request}
        superlikesLeft={superlikesLeft}
        pending={pending}
        error={error}
        onCancel={() => setRequest(null)}
        onSend={async (comment, superlike) => {
          if (request && (await decide(superlike ? "superlike" : "like", request.content, comment || null))) {
            setRequest(null);
          }
        }}
      />
      {liaison && (
        <Liaison
          matchId={liaison}
          me={{
            firstName: me?.firstName ?? "",
            schoolSlug: me?.school.slug ?? "",
            photoUrl: me?.photos[0]?.url ?? null,
          }}
          other={{
            firstName: profile.card.firstName,
            schoolSlug: profile.card.school.slug,
            photoUrl: profile.card.photos[0]?.url ?? null,
          }}
          onClose={() => setLiaison(null)}
        />
      )}
    </ProfileContext>
  );
}

export function ProfileLikeButton({
  content,
  small = false,
}: {
  profile: ProfileView;
  content: LikedContent;
  small?: boolean;
}) {
  const t = useTranslations("discovery.actions");
  const { decision, matchId, requestLike } = useProfile();
  if (matchId || (decision && decision !== "pass")) {
    return null;
  }
  return <HeartButton label={t("likeThis")} small={small} onClick={() => requestLike(content, false)} />;
}

export function ProfileHeaderActions({
  userId,
  name,
  matchId,
  backLabel,
}: {
  userId: string;
  name: string;
  matchId: string | null;
  backLabel: string;
}) {
  const router = useRouter();
  const { matchId: currentMatch } = useProfile();
  return (
    <>
      <button
        type="button"
        onClick={() => (window.history.length > 1 ? router.back() : router.push("/decouvrir"))}
        aria-label={backLabel}
        className="grid size-11 place-items-center rounded-full border border-paper/20 bg-ink/60 backdrop-blur-md"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path d="M15 18 9 12l6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <SafetyMenu
        target={{ userId, firstName: name }}
        matchId={currentMatch ?? matchId}
        className="size-11 border border-paper/20 bg-ink/60 backdrop-blur-md"
        onDone={(action) => {
          if (action === "reported") {
            return;
          }
          router.replace(action === "blocked" ? "/decouvrir" : "/messages");
        }}
      />
    </>
  );
}

/** Sticky bottom bar: write (match), like / pass (discovery), or the like already sent. */
export function ProfileActions({ profile }: { profile: ProfileView }) {
  const t = useTranslations("matches.profile");
  const actions = useTranslations("discovery.actions");
  const { decision, matchId, requestLike, pass } = useProfile();
  const canDecide = profile.canLike && !matchId && (!decision || decision === "pass");

  if (profile.via === "self") {
    return null;
  }
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t lg:left-60 from-ink via-ink/95 to-transparent px-4 pt-8 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-xl items-center justify-center gap-3">
        {matchId ? (
          <a
            href={`/messages/${matchId}`}
            className="flex-1 rounded-full bg-plasma px-6 py-3.5 text-center font-semibold text-ink"
          >
            {t("message")}
          </a>
        ) : canDecide ? (
          <>
            <button type="button" onClick={pass} className="rounded-full border-2 border-paper/25 px-6 py-3">
              {actions("pass")}
            </button>
            <button
              type="button"
              onClick={() => requestLike(null, true)}
              className="rounded-full border-2 border-volt/60 px-5 py-3 text-volt"
            >
              {actions("superlike")}
            </button>
            <button
              type="button"
              onClick={() => {
                const photo = profile.card.photos[0];
                requestLike(photo ? { type: "photo", id: photo.id, url: photo.url } : null, false);
              }}
              className="flex-1 rounded-full bg-plasma px-6 py-3 font-semibold text-ink"
            >
              {actions("like")}
            </button>
          </>
        ) : decision && decision !== "pass" ? (
          <p className="rounded-full border border-paper/15 px-6 py-3 text-paper/70">{t("alreadyLiked")}</p>
        ) : null}
      </div>
    </div>
  );
}
