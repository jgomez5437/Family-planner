"use client";

import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Send, X } from "lucide-react";
import {
  CARD_SHADOW,
  POST_TYPE_COLORS,
  POST_TYPE_EMOJI,
  REACTION_LABELS,
  REACTIONS,
} from "@/lib/constants";
import { useMembers } from "@/components/MembersContext";
import type { Member, MemberId, WallPost } from "@/types/family";
import { AvatarDot, EmptyState } from "@/components/ui/Primitives";
import type { ComposerKind } from "@/components/layout/QuickAddSheet";

export function WallTab({
  posts,
  currentUser,
  toggleReaction,
  addComment,
  openComposer,
  highlightedPostId,
}: {
  posts: WallPost[];
  currentUser: MemberId;
  toggleReaction: (postId: string, emoji: string) => void;
  addComment: (postId: string, text: string) => void;
  openComposer?: (
    type: ComposerKind,
    date?: string,
    participants?: MemberId[],
    postType?: string
  ) => void;
  highlightedPostId?: string | null;
}) {
  const { memberById } = useMembers();
  const me = memberById(currentUser);
  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <div
        style={{
          fontFamily: "'Baloo 2', sans-serif",
          fontSize: 22,
          fontWeight: 700,
          marginBottom: 2,
        }}
      >
        Family Wall
      </div>
      <div style={{ fontSize: 13, color: "#948C80", marginBottom: 14 }}>
        Your household&apos;s private feed.
      </div>

      {openComposer && (
        <div
          style={{
            background: "#fff",
            border: "1px solid #F1E8D9",
            boxShadow: CARD_SHADOW,
            borderRadius: 20,
            padding: "12px 12px 6px",
            marginBottom: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <AvatarDot id={currentUser} size={42} />
            <button
              onClick={() => openComposer("post")}
              style={{
                flex: 1,
                textAlign: "left",
                background: "#FBF5EA",
                border: "1px solid #F1E8D9",
                borderRadius: 999,
                padding: "12px 16px",
                color: "#948C80",
                fontSize: 14,
                cursor: "pointer",
                minHeight: 44,
              }}
            >
              What&apos;s on your mind, {me.name}?
            </button>
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 8,
              paddingTop: 4,
              borderTop: "1px solid #F3ECE0",
            }}
          >
            {(
              [
                ["📸", "Photo", "Photo"],
                ["📢", "Announce", "Announcement"],
                ["🔔", "Remind", "Reminder"],
              ] as const
            ).map(([emoji, label, type]) => (
              <button
                key={type}
                onClick={() => openComposer("post", undefined, undefined, type)}
                style={{
                  flex: 1,
                  background: "none",
                  border: "none",
                  borderRadius: 12,
                  padding: "10px 4px",
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: "#6B6259",
                  cursor: "pointer",
                  minHeight: 42,
                }}
              >
                {emoji} {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {posts.length === 0 ? (
        <EmptyState
          text="No family updates yet."
          sub="Share something with everyone."
          actionLabel={openComposer ? "Post Update" : undefined}
          onAction={openComposer ? () => openComposer("post") : undefined}
        />
      ) : (
        posts.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            currentUser={currentUser}
            onReact={(e) => toggleReaction(p.id, e)}
            onComment={(text) => addComment(p.id, text)}
            highlighted={highlightedPostId === p.id}
          />
        ))
      )}
    </div>
  );
}

const clampStyle: React.CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 3,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

function reactionSummary(
  post: WallPost,
  memberById: (id?: MemberId | null) => Member,
  currentUser?: MemberId
) {
  const reactions = post.reactions || {};
  const ids = [...new Set(Object.values(reactions).flat())];
  if (!ids.length) return null;
  const emojis = Object.entries(reactions)
    .filter(([, u]) => u.length)
    .map(([e]) => e)
    .join("");
  const ordered = [...ids].sort((a, b) =>
    a === currentUser ? -1 : b === currentUser ? 1 : 0
  );
  const names = ordered.map((id) =>
    id === currentUser ? "You" : memberById(id).name
  );
  const text =
    names.length <= 2
      ? names.join(" and ")
      : `${names[0]}, ${names[1]} and ${names.length - 2} more`;
  return { emojis, text };
}

export function PostCard({
  post,
  onReact,
  onComment,
  currentUser,
  compact,
  highlighted,
}: {
  post: WallPost;
  onReact: (emoji: string) => void;
  onComment?: (text: string) => void;
  currentUser?: MemberId;
  compact?: boolean;
  highlighted?: boolean;
}) {
  const { memberById } = useMembers();
  const author = memberById(post.author);
  const color = POST_TYPE_COLORS[post.type] || "#6B6259";
  const emoji = POST_TYPE_EMOJI[post.type] || "💬";
  const images = post.images || [];
  const comments = post.comments || [];
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [showComments, setShowComments] = useState(
    !compact && comments.length > 0
  );
  const [draft, setDraft] = useState("");
  const summary = reactionSummary(post, memberById, currentUser);

  function sendComment() {
    const text = draft.trim();
    if (!text) return;
    onComment?.(text);
    setDraft("");
    setShowComments(true);
  }

  return (
    <article
      id={compact ? undefined : `post-${post.id}`}
      style={{
        background: "#fff",
        border: highlighted ? "2px solid #E8622C" : "1px solid #F1E8D9",
        boxShadow: highlighted
          ? "0 6px 24px rgba(232,98,44,0.22)"
          : CARD_SHADOW,
        borderRadius: 20,
        marginBottom: compact ? 10 : 14,
        overflow: "hidden",
        scrollMarginTop: 84,
        transition: "border-color 0.25s ease, box-shadow 0.25s ease",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 14px 0",
        }}
      >
        <AvatarDot id={post.author} size={compact ? 36 : 44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>{author.name}</div>
          <div style={{ fontSize: 11.5, color: "#A69C8E" }}>{post.createdAt}</div>
        </div>
        {post.type !== "Update" && (
          <span
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              color,
              background: `${color}15`,
              borderRadius: 999,
              padding: "5px 11px",
              whiteSpace: "nowrap",
            }}
          >
            {emoji} {post.type === "Change" ? "Schedule change" : post.type}
          </span>
        )}
      </div>

      {post.content && (
        <div
          style={{
            padding: "10px 14px 0",
            fontSize: compact ? 13.5 : 15,
            lineHeight: 1.5,
            color: "#2B2622",
            ...(compact ? clampStyle : {}),
          }}
        >
          {post.content}
        </div>
      )}

      {images.length > 0 && (
        <div
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: images.length === 1 ? "1fr" : "1fr 1fr",
            gap: 2,
          }}
        >
          {images.slice(0, 4).map((src, i) => (
            <button
              key={i}
              onClick={() => setLightbox(i)}
              aria-label={`Open photo ${i + 1} of ${images.length}`}
              style={{
                position: "relative",
                border: "none",
                padding: 0,
                cursor: "pointer",
                aspectRatio:
                  images.length === 1 ? (compact ? "16/9" : "4/3") : "1/1",
                overflow: "hidden",
                background: "#F1E9DA",
                borderRadius: 0,
              }}
            >
              <img
                src={src}
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
              {i === 3 && images.length > 4 && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(43,38,34,0.55)",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    fontWeight: 700,
                  }}
                >
                  +{images.length - 4}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {(summary || comments.length > 0) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            padding: "10px 14px 0",
            fontSize: 12.5,
            color: "#8A7F70",
          }}
        >
          <span style={{ minWidth: 0 }}>
            {summary ? `${summary.emojis} ${summary.text}` : ""}
          </span>
          {comments.length > 0 &&
            (compact ? (
              <span style={{ flexShrink: 0 }}>
                {comments.length} comment{comments.length > 1 ? "s" : ""}
              </span>
            ) : (
              <button
                onClick={() => setShowComments((v) => !v)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#8A7F70",
                  fontSize: 12.5,
                  cursor: "pointer",
                  padding: "4px 0",
                  flexShrink: 0,
                }}
              >
                {comments.length} comment{comments.length > 1 ? "s" : ""}
              </button>
            ))}
        </div>
      )}

      {!compact && (
        <div
          style={{
            display: "flex",
            gap: 2,
            margin: "10px 8px 0",
            padding: "4px 0",
            borderTop: "1px solid #F3ECE0",
          }}
        >
          {REACTIONS.map((emo) => {
            const mine = currentUser
              ? (post.reactions?.[emo] || []).includes(currentUser)
              : false;
            return (
              <button
                key={emo}
                onClick={() => onReact(emo)}
                aria-pressed={mine}
                aria-label={`${REACTION_LABELS[emo] || "React"}${mine ? " (selected)" : ""}`}
                style={{
                  flex: "1 1 0",
                  minWidth: 0,
                  minHeight: 44,
                  whiteSpace: "nowrap",
                  padding: "0 2px",
                  background: mine ? "#FCE9DF" : "transparent",
                  border: "none",
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: 700,
                  color: mine ? "#B24A1D" : "#6B6259",
                  cursor: "pointer",
                }}
              >
                <span className={mine ? "react-pop" : undefined}>{emo}</span>{" "}
                {REACTION_LABELS[emo]}
              </button>
            );
          })}
          <button
            onClick={() => setShowComments((v) => !v)}
            aria-expanded={showComments}
            style={{
              flex: "1.25 1 0",
              minWidth: 0,
              minHeight: 44,
              whiteSpace: "nowrap",
              padding: "0 2px",
              background: showComments ? "#F7F0E4" : "transparent",
              border: "none",
              borderRadius: 12,
              fontSize: 12,
              fontWeight: 700,
              color: "#6B6259",
              cursor: "pointer",
            }}
          >
            💬 Comment
          </button>
        </div>
      )}

      {!compact && showComments && (
        <div style={{ padding: "2px 14px 14px" }}>
          {comments.map((c) => (
            <div key={c.id} style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <AvatarDot id={c.by} size={32} />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    background: "#F7F0E4",
                    borderRadius: 16,
                    padding: "8px 12px",
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>
                    {memberById(c.by).name}
                  </div>
                  <div
                    style={{
                      fontSize: 13.5,
                      lineHeight: 1.4,
                      wordBreak: "break-word",
                    }}
                  >
                    {c.text}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "#A69C8E",
                    margin: "3px 0 0 10px",
                  }}
                >
                  {c.at}
                </div>
              </div>
            </div>
          ))}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 12,
            }}
          >
            <AvatarDot id={currentUser} size={32} />
            <input
              aria-label="Write a comment"
              value={draft}
              placeholder="Write a comment…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendComment()}
              style={{
                flex: 1,
                minWidth: 0,
                background: "#FBF5EA",
                border: "1px solid #F1E8D9",
                borderRadius: 999,
                padding: "10px 14px",
                fontSize: 13.5,
                fontFamily: "inherit",
                color: "#2B2622",
              }}
            />
            <button
              onClick={sendComment}
              disabled={!draft.trim()}
              aria-label="Send comment"
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                background: "#E8622C",
                color: "#fff",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: draft.trim() ? "pointer" : "default",
                opacity: draft.trim() ? 1 : 0.4,
                flexShrink: 0,
              }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
      {!compact && !showComments && <div style={{ height: 8 }} />}
      {compact && <div style={{ height: 12 }} />}

      {lightbox !== null && (
        <ImageLightbox
          images={images}
          index={lightbox}
          onClose={() => setLightbox(null)}
          onNav={setLightbox}
        />
      )}
    </article>
  );
}

export function ImageLightbox({
  images,
  index,
  onClose,
  onNav,
}: {
  images: string[];
  index: number;
  onClose: () => void;
  onNav: (idx: number) => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,17,14,0.92)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: "calc(16px + env(safe-area-inset-top))",
          right: "calc(16px + env(safe-area-inset-right))",
          background: "rgba(255,255,255,0.15)",
          border: "none",
          borderRadius: "50%",
          width: 36,
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          color: "#fff",
        }}
      >
        <X size={18} />
      </button>
      {images.length > 1 && index > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNav(index - 1);
          }}
          style={{
            position: "absolute",
            left: 12,
            background: "rgba(255,255,255,0.15)",
            border: "none",
            borderRadius: "50%",
            width: 40,
            height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "#fff",
          }}
        >
          <ChevronLeft size={20} />
        </button>
      )}
      {images.length > 1 && index < images.length - 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNav(index + 1);
          }}
          style={{
            position: "absolute",
            right: 12,
            background: "rgba(255,255,255,0.15)",
            border: "none",
            borderRadius: "50%",
            width: 40,
            height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "#fff",
          }}
        >
          <ChevronRight size={20} />
        </button>
      )}
      <img
        src={images[index]}
        alt=""
        style={{
          maxWidth: "92%",
          maxHeight: "86%",
          borderRadius: 8,
          objectFit: "contain",
        }}
        onClick={(e) => e.stopPropagation()}
      />
      {images.length > 1 && (
        <div
          style={{
            position: "absolute",
            bottom: 20,
            color: "#fff",
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          {index + 1} / {images.length}
        </div>
      )}
    </div>
  );
}
