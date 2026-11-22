"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  CheckCircle2,
  Download,
  MoreVertical,
  PlusSquare,
  Share,
  Smartphone,
  WifiOff,
  X,
} from "lucide-react";
import {
  btnStyle,
  CARD_SHADOW,
  iconBtnStyle,
  overlayStyle,
  sheetStyle,
} from "@/lib/constants";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface PwaContextValue {
  isStandalone: boolean;
  isInstalled: boolean;
  isIos: boolean;
  isMobile: boolean;
  isOnline: boolean;
  canInstallNative: boolean;
  bannerDismissed: boolean;
  dismissBanner: () => void;
  triggerInstall: () => Promise<"accepted" | "dismissed" | "guide">;
  openInstallGuide: () => void;
}

const DISMISS_STORAGE_KEY = "fp_pwa_banner_dismissed_v1";

const PwaContext = createContext<PwaContextValue>({
  isStandalone: false,
  isInstalled: false,
  isIos: false,
  isMobile: false,
  isOnline: true,
  canInstallNative: false,
  bannerDismissed: false,
  dismissBanner: () => {},
  triggerInstall: async () => "guide",
  openInstallGuide: () => {},
});

export function usePwa(): PwaContextValue {
  return useContext(PwaContext);
}

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    nav.standalone === true
  );
}

function detectIos(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  const isClassicIos = /iPad|iPhone|iPod/.test(ua);
  const isIpadOs =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isClassicIos || isIpadOs;
}

function detectMobile(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  return (
    detectIos() ||
    /Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua) ||
    window.innerWidth < 900
  );
}

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [isStandalone, setIsStandalone] = useState(false);
  const [installedInSession, setInstalledInSession] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(true);
  const [guideOpen, setGuideOpen] = useState(false);

  const isInstalled = isStandalone || installedInSession;

  useEffect(() => {
    setIsStandalone(detectStandalone());
    setIsIos(detectIos());
    setIsMobile(detectMobile());
    setIsOnline(navigator.onLine);

    try {
      setBannerDismissed(
        window.localStorage.getItem(DISMISS_STORAGE_KEY) === "1"
      );
    } catch {
      setBannerDismissed(false);
    }

    // Register Service Worker for installability & offline support
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {
          /* ignore registration errors in unsupported/private contexts */
        });
    }

    const displayQuery = window.matchMedia("(display-mode: standalone)");
    const onDisplayChange = () => setIsStandalone(detectStandalone());
    if (displayQuery.addEventListener) {
      displayQuery.addEventListener("change", onDisplayChange);
    }

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setDeferredPrompt(null);
      setInstalledInSession(true);
      setGuideOpen(false);
    };

    const onResize = () => setIsMobile(detectMobile());
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    window.addEventListener("resize", onResize);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      if (displayQuery.removeEventListener) {
        displayQuery.removeEventListener("change", onDisplayChange);
      }
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const dismissBanner = useCallback(() => {
    setBannerDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, "1");
    } catch {
      /* ignore storage errors */
    }
  }, []);

  const openInstallGuide = useCallback(() => {
    setGuideOpen(true);
  }, []);

  const triggerInstall = useCallback(async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          setDeferredPrompt(null);
        }
        return choice.outcome;
      } catch {
        setGuideOpen(true);
        return "guide" as const;
      }
    }
    setGuideOpen(true);
    return "guide" as const;
  }, [deferredPrompt]);

  return (
    <PwaContext.Provider
      value={{
        isStandalone,
        isInstalled,
        isIos,
        isMobile,
        isOnline,
        canInstallNative: Boolean(deferredPrompt),
        bannerDismissed,
        dismissBanner,
        triggerInstall,
        openInstallGuide,
      }}
    >
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="no-print"
          style={{
            position: "fixed",
            top: "calc(10px + env(safe-area-inset-top))",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 250,
            background: "#2B2622",
            color: "#FFF9F0",
            padding: "7px 14px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            boxShadow: "0 8px 24px rgba(43,38,34,0.28)",
            whiteSpace: "nowrap",
            maxWidth: "calc(100vw - 24px)",
          }}
        >
          <WifiOff size={13} color="#F4C95D" />
          <span>You&apos;re offline — changes sync when reconnected</span>
        </div>
      )}

      {children}

      {guideOpen && (
        <InstallGuideModal
          isIos={isIos}
          canInstallNative={Boolean(deferredPrompt)}
          isStandalone={isStandalone}
          isInstalled={isInstalled}
          onNativeInstall={async () => {
            await triggerInstall();
          }}
          onClose={() => setGuideOpen(false)}
        />
      )}
    </PwaContext.Provider>
  );
}

export function PwaInstallBanner() {
  const {
    isInstalled,
    isIos,
    isMobile,
    canInstallNative,
    bannerDismissed,
    dismissBanner,
    triggerInstall,
  } = usePwa();

  if (isInstalled || bannerDismissed) return null;
  // Show on phones/mobile browsers or whenever the browser offers a native install prompt
  if (!isMobile && !canInstallNative) return null;

  return (
    <div
      className="no-print"
      style={{
        background: "#FFFDF9",
        border: "1px solid #F1E8D9",
        boxShadow: CARD_SHADOW,
        borderRadius: 16,
        padding: "12px 14px",
        marginBottom: 14,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <img
        src="/icons/icon-192.png"
        alt="Family Planner icon"
        width={42}
        height={42}
        style={{
          borderRadius: 11,
          flexShrink: 0,
          boxShadow: "0 2px 8px rgba(232,98,44,0.22)",
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "'Baloo 2', sans-serif",
            fontSize: 15,
            fontWeight: 700,
            color: "#2B2622",
            lineHeight: 1.2,
          }}
        >
          Install Family Planner
        </div>
        <div style={{ fontSize: 12, color: "#6B6259", marginTop: 2 }}>
          {canInstallNative
            ? "Add to your Home Screen for full-screen app access."
            : isIos
              ? "Add to your iPhone Home Screen for 1-tap access."
              : "Install on your phone for a full-screen app experience."}
        </div>
      </div>
      <button
        type="button"
        onClick={() => void triggerInstall()}
        style={{
          border: "none",
          background: "#E8622C",
          color: "#fff",
          borderRadius: 10,
          padding: "8px 12px",
          fontSize: 12.5,
          fontWeight: 700,
          cursor: "pointer",
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        <Download size={13} />
        {canInstallNative ? "Install" : "How"}
      </button>
      <button
        type="button"
        onClick={dismissBanner}
        aria-label="Dismiss install banner"
        style={{
          background: "transparent",
          border: "none",
          color: "#948C80",
          cursor: "pointer",
          padding: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}

function InstallGuideModal({
  isIos,
  canInstallNative,
  isStandalone,
  isInstalled,
  onNativeInstall,
  onClose,
}: {
  isIos: boolean;
  canInstallNative: boolean;
  isStandalone: boolean;
  isInstalled: boolean;
  onNativeInstall: () => Promise<void>;
  onClose: () => void;
}) {
  return (
    <div style={{ ...overlayStyle, zIndex: 220 }} onClick={onClose}>
      <div style={sheetStyle} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            width: 36,
            height: 4,
            background: "#E4D9C6",
            borderRadius: 4,
            margin: "0 auto 14px",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img
              src="/icons/icon-192.png"
              alt="Family Planner"
              width={36}
              height={36}
              style={{ borderRadius: 9 }}
            />
            <div>
              <div
                style={{
                  fontFamily: "'Baloo 2', sans-serif",
                  fontSize: 18,
                  fontWeight: 700,
                  lineHeight: 1.15,
                }}
              >
                Install Family Planner
              </div>
              <div style={{ fontSize: 12, color: "#8A7F70" }}>
                Use it like a native app on your phone
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={iconBtnStyle}
            aria-label="Close install instructions"
          >
            <X size={16} />
          </button>
        </div>

        {isInstalled ? (
          <div
            style={{
              background: "#E4F1EC",
              border: "1px solid #C6E3D7",
              borderRadius: 14,
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: "#155C4A",
              fontSize: 13.5,
              fontWeight: 600,
              marginBottom: 14,
            }}
          >
            <CheckCircle2 size={20} />
            <span>
              {isStandalone
                ? "Family Planner is installed and running in app mode on this device."
                : "Family Planner has been installed! You can now open it from your Home Screen."}
            </span>
          </div>
        ) : (
          <>
            {canInstallNative && (
              <button
                type="button"
                onClick={() => void onNativeInstall()}
                style={{
                  ...btnStyle,
                  width: "100%",
                  background: "#E8622C",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  marginBottom: 14,
                  boxShadow: "0 4px 14px rgba(232,98,44,0.28)",
                }}
              >
                <Download size={16} /> Install App Now
              </button>
            )}

            <div
              style={{
                background: "#fff",
                border: "1px solid #F1E8D9",
                borderRadius: 14,
                padding: 14,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#8A7F70",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 10,
                }}
              >
                {isIos
                  ? "iPhone & iPad (Safari / Chrome)"
                  : "Android (Chrome / Edge)"}
              </div>

              {isIos ? (
                <>
                  <ol
                    style={{
                      margin: 0,
                      paddingLeft: 18,
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      fontSize: 13.5,
                      lineHeight: 1.45,
                      color: "#2B2622",
                    }}
                  >
                    <li>
                      Tap the{" "}
                      <span style={inlineBadgeStyle}>
                        <Share size={12} /> Share
                      </span>{" "}
                      button (at the bottom in Safari, or top-right in Chrome).
                    </li>
                    <li>
                      Scroll down and tap{" "}
                      <span style={inlineBadgeStyle}>
                        <PlusSquare size={12} /> Add to Home Screen
                      </span>
                      .
                    </li>
                    <li>
                      Tap <strong>Add</strong> in the top-right corner to place
                      Family Planner on your Home Screen.
                    </li>
                  </ol>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "#8A7F70",
                      marginTop: 10,
                      lineHeight: 1.4,
                    }}
                  >
                    Opened this from Messages or WhatsApp? Tap{" "}
                    <strong>Open in Safari</strong> first if you don&apos;t see
                    Add to Home Screen.
                  </div>
                </>
              ) : (
                <ol
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    fontSize: 13.5,
                    lineHeight: 1.45,
                    color: "#2B2622",
                  }}
                >
                  <li>
                    Tap the browser menu{" "}
                    <span style={inlineBadgeStyle}>
                      <MoreVertical size={12} /> Menu
                    </span>{" "}
                    in the top-right corner.
                  </li>
                  <li>
                    Tap{" "}
                    <span style={inlineBadgeStyle}>
                      <Smartphone size={12} /> Install app
                    </span>{" "}
                    or <strong>Add to Home screen</strong>.
                  </li>
                  <li>
                    Confirm <strong>Install</strong> to launch Family Planner
                    full-screen from your Home Screen.
                  </li>
                </ol>
              )}
            </div>
          </>
        )}

        <button
          type="button"
          onClick={onClose}
          style={{
            ...btnStyle,
            width: "100%",
            background: "#F5EFE3",
            color: "#2B2622",
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}

const inlineBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  background: "#FCE9DF",
  color: "#B24A1D",
  borderRadius: 6,
  padding: "1px 7px",
  fontSize: 12.5,
  fontWeight: 700,
  verticalAlign: "middle",
};
