"use client";

import React, { useEffect, useRef, useState } from "react";
import { Camera, Crop, Smile, Trash2, Upload } from "lucide-react";
import { MEMBER_EMOJIS } from "@/lib/constants";
import { isLikelyImageFile, type ImageTransformState } from "@/lib/images";
import { ImageCropModal, type ImageCropResult } from "./ImageCropModal";

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
  const [rawSource, setRawSource] = useState<File | string | null>(null);
  const [lastTransform, setLastTransform] = useState<
    ImageTransformState | undefined
  >(undefined);
  const [cropSession, setCropSession] = useState<{
    source: File | string;
    initialTransform?: ImageTransformState;
    isNewUpload: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (avatarUrl) {
      setDraftPhoto(avatarUrl);
      setMode("photo");
    }
  }, [avatarUrl]);

  useEffect(() => {
    onProcessingChange?.(Boolean(cropSession));
  }, [cropSession, onProcessingChange]);

  function selectMode(nextMode: "emoji" | "photo") {
    setError(null);
    setMode(nextMode);
    if (nextMode === "emoji") {
      onAvatarUrlChange(null);
    } else {
      onAvatarUrlChange(draftPhoto);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    if (!isLikelyImageFile(file)) {
      setError("Please select an image file (JPEG, PNG, or WebP).");
      return;
    }

    setCropSession({
      source: file,
      initialTransform: undefined,
      isNewUpload: true,
    });
  }

  function handleOpenAdjust() {
    const sourceToEdit = rawSource || draftPhoto;
    if (!sourceToEdit) return;
    setError(null);
    setCropSession({
      source: sourceToEdit,
      initialTransform: rawSource ? lastTransform : undefined,
      isNewUpload: false,
    });
  }

  function handleCropApply(result: ImageCropResult) {
    if (cropSession?.isNewUpload) {
      setRawSource(cropSession.source);
    } else if (!rawSource && draftPhoto) {
      setRawSource(draftPhoto);
    }
    setLastTransform(result.transform);
    setDraftPhoto(result.dataUrl);
    setMode("photo");
    onAvatarUrlChange(result.dataUrl);
    setCropSession(null);
  }

  function handleRemovePhoto() {
    setError(null);
    setDraftPhoto(null);
    setRawSource(null);
    setLastTransform(undefined);
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
              onClick={() =>
                draftPhoto ? handleOpenAdjust() : fileInputRef.current?.click()
              }
              aria-label={
                draftPhoto ? "Adjust profile photo framing" : "Choose profile photo"
              }
              title={draftPhoto ? "Click to zoom or reposition" : "Choose profile photo"}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
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
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: "1.5px solid #EFE4D2",
                    background: "#fff",
                    color: "#2B2622",
                    borderRadius: 10,
                    padding: "7px 12px",
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Upload size={13} />
                  {draftPhoto ? "Change Photo" : "Choose Photo"}
                </button>

                {draftPhoto && (
                  <button
                    type="button"
                    onClick={handleOpenAdjust}
                    style={{
                      border: "1.5px solid #F2C4AF",
                      background: "#FCE9DF",
                      color: "#B24A1D",
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
                    <Crop size={13} /> Adjust
                  </button>
                )}

                {draftPhoto && (
                  <button
                    type="button"
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
                  ? "Framed for your circular profile picture. Tap Adjust to zoom or reposition."
                  : "Upload a JPG, PNG, or WebP photo — you can zoom and position it inside the frame."}
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

      {cropSession && (
        <ImageCropModal
          mode="avatar"
          source={cropSession.source}
          initialTransform={cropSession.initialTransform}
          accentColor={color}
          onCancel={() => setCropSession(null)}
          onApply={handleCropApply}
        />
      )}
    </div>
  );
}
