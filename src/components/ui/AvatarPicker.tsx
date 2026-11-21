"use client";

import React, { useEffect, useRef, useState } from "react";
import { Camera, Smile, Trash2, Upload } from "lucide-react";
import { MEMBER_EMOJIS } from "@/lib/constants";
import { compressAvatarImage } from "@/lib/images";

export function AvatarPreview({
  emoji,
  avatarUrl,
  color,
  light,
  size = 46,
  name = "Avatar",
}: {
  emoji: string;
  avatarUrl?: string | null;
  color: string;
  light: string;
  size?: number;
  name?: string;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `linear-gradient(145deg, ${light}, #fff)`,
        border: `2px solid ${color}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.52),
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : (
        emoji
      )}
    </div>
  );
}

export function AvatarPicker({
  emoji,
  avatarUrl,
  color,
  light,
  onEmojiChange,
  onAvatarUrlChange,
  onProcessingChange,
}: {
  emoji: string;
  avatarUrl: string | null;
  color: string;
  light: string;
  onEmojiChange: (emoji: string) => void;
  onAvatarUrlChange: (url: string | null) => void;
  onProcessingChange?: (processing: boolean) => void;
}) {
  const [mode, setMode] = useState<"emoji" | "photo">(
    avatarUrl ? "photo" : "emoji"
  );
  const [draftPhoto, setDraftPhoto] = useState<string | null>(avatarUrl);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (avatarUrl) {
      setDraftPhoto(avatarUrl);
      setMode("photo");
    }
  }, [avatarUrl]);

  function selectMode(nextMode: "emoji" | "photo") {
    setError(null);
    setMode(nextMode);
    if (nextMode === "emoji") {
      onAvatarUrlChange(null);
    } else {
      onAvatarUrlChange(draftPhoto);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    setProcessing(true);
    onProcessingChange?.(true);
    try {
      const compressed = await compressAvatarImage(file);
      setDraftPhoto(compressed);
      setMode("photo");
      onAvatarUrlChange(compressed);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load that photo. Please try another image."
      );
    } finally {
      setProcessing(false);
      onProcessingChange?.(false);
    }
  }

  function handleRemovePhoto() {
    setError(null);
    setDraftPhoto(null);
    onAvatarUrlChange(null);
  }

  return (
    <div>
      {/* Segmented Toggle: Use Avatar vs Upload Photo */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <button
          type="button"
          onClick={() => selectMode("emoji")}
          aria-pressed={mode === "emoji"}
          style={{
            border: `1.5px solid ${mode === "emoji" ? "#E8622C" : "#EFE4D2"}`,
            background: mode === "emoji" ? "#FCE9DF" : "#fff",
            color: mode === "emoji" ? "#B24A1D" : "#6B6259",
            borderRadius: 12,
            padding: "8px 10px",
            fontSize: 12.5,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Smile size={14} /> Use Avatar
        </button>
        <button
          type="button"
          onClick={() => selectMode("photo")}
          aria-pressed={mode === "photo"}
          style={{
            border: `1.5px solid ${mode === "photo" ? "#E8622C" : "#EFE4D2"}`,
            background: mode === "photo" ? "#FCE9DF" : "#fff",
            color: mode === "photo" ? "#B24A1D" : "#6B6259",
            borderRadius: 12,
            padding: "8px 10px",
            fontSize: 12.5,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Camera size={14} /> Upload Photo
        </button>
      </div>

      {mode === "emoji" ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {MEMBER_EMOJIS.map((em) => (
            <button
              key={em}
              type="button"
              onClick={() => {
                onEmojiChange(em);
                onAvatarUrlChange(null);
              }}
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                border:
                  emoji === em
                    ? `2px solid ${color}`
                    : "1.5px solid #EFE4D2",
                background: emoji === em ? light : "#fff",
                fontSize: 18,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {em}
            </button>
          ))}
        </div>
      ) : (
        <div
          style={{
            background: "#FFFDF9",
            border: "1.5px dashed #E4D9C6",
            borderRadius: 14,
            padding: 12,
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={processing}
              aria-label="Choose profile photo"
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: processing ? "wait" : "pointer",
                flexShrink: 0,
              }}
            >
              <AvatarPreview
                emoji={emoji}
                avatarUrl={draftPhoto}
                color={color}
                light={light}
                size={58}
                name="Profile preview"
              />
            </button>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button
                  type="button"
                  disabled={processing}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: "1.5px solid #EFE4D2",
                    background: "#fff",
                    color: "#2B2622",
                    borderRadius: 10,
                    padding: "7px 12px",
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: processing ? "wait" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    opacity: processing ? 0.65 : 1,
                  }}
                >
                  <Upload size={13} />
                  {processing
                    ? "Processing..."
                    : draftPhoto
                      ? "Change Photo"
                      : "Choose Photo"}
                </button>

                {draftPhoto && (
                  <button
                    type="button"
                    disabled={processing}
                    onClick={handleRemovePhoto}
                    style={{
                      border: "1.5px solid #F3D9D2",
                      background: "#fff",
                      color: "#C4402A",
                      borderRadius: 10,
                      padding: "7px 10px",
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <Trash2 size={13} /> Remove
                  </button>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: "#8A7F70", marginTop: 6 }}>
                {draftPhoto
                  ? "Square cropped and ready to save."
                  : "Upload a JPG, PNG, or WebP photo from your device."}
              </div>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              style={{
                marginTop: 8,
                fontSize: 12,
                fontWeight: 600,
                color: "#C4402A",
              }}
            >
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
