import { useState } from "react";

import {
  DownloadSimple,
  Export,
  PlusSquare,
} from "@phosphor-icons/react";

import { useInstallPrompt } from "./installPrompt.js";

// "Not now" / "Got it" hides the card on this phone for a week. It's only
// a convenience, so storage errors (private mode etc.) are ignored.
const DISMISS_KEY =
  "wbxInstallBannerDismissedAt";

const DISMISS_DAYS = 7;

function wasDismissedRecently() {
  try {
    const value =
      localStorage.getItem(
        DISMISS_KEY
      );

    return (
      !!value &&
      Date.now() -
        Number(value) <
        DISMISS_DAYS *
          86400000
    );
  } catch {
    return false;
  }
}

function rememberDismissed() {
  try {
    localStorage.setItem(
      DISMISS_KEY,
      String(Date.now())
    );
  } catch {
    // Not remembered; the card shows again next visit.
  }
}

// iPhone and iPad browsers have no install prompt; the app is added from
// the Share menu instead. navigator.standalone only exists on iOS, and is
// true inside the Home Screen app. iPadOS reports itself as a Mac, so
// a touch-screen "Mac" counts too.
function isIosBrowser() {
  const isIosDevice =
    /iPhone|iPad|iPod/.test(
      navigator.userAgent
    ) ||
    (navigator.platform ===
      "MacIntel" &&
      navigator.maxTouchPoints > 1);

  const isHomeScreenApp =
    navigator.standalone === true ||
    window.matchMedia(
      "(display-mode: standalone)"
    ).matches;

  return (
    isIosDevice &&
    !isHomeScreenApp
  );
}

// Shown in the browser, never in the installed app:
// - Android Chrome: when Chrome says the app can be installed, one tap
//   opens Chrome's install dialog.
// - iPhone/iPad: how to add it to the Home Screen. This matters there,
//   because the Home Screen app keeps its data apart from Safari.
export function InstallBanner() {
  const {
    canInstall,
    promptInstall,
  } = useInstallPrompt();

  const [
    dismissed,
    setDismissed,
  ] = useState(
    wasDismissedRecently
  );

  const [
    showIosHint,
  ] = useState(
    isIosBrowser
  );

  function dismiss() {
    rememberDismissed();

    setDismissed(true);
  }

  if (dismissed) {
    return null;
  }

  if (canInstall) {
    return (
      <div className="install-banner">
        <img
          className="install-banner-icon"
          src={`${import.meta.env.BASE_URL}pwa-192x192.png`}
          alt=""
        />

        <div className="install-banner-copy">
          <strong>
            Install WBX Planner
          </strong>

          <p>
            Opens from your home screen like a normal app and works
            offline at the gym.
          </p>

          <div className="install-banner-actions">
            <button
              className="install-banner-button"
              onClick={
                promptInstall
              }
            >
              <DownloadSimple
                size={16}
                weight="bold"
                aria-hidden
              />
              Install
            </button>

            <button
              className="text-button"
              onClick={dismiss}
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showIosHint) {
    return (
      <div className="install-banner">
        <img
          className="install-banner-icon"
          src={`${import.meta.env.BASE_URL}pwa-192x192.png`}
          alt=""
        />

        <div className="install-banner-copy">
          <strong>
            Add WBX Planner to your Home Screen
          </strong>

          <ol className="install-steps">
            <li>
              Tap Share
              <Export
                size={16}
                aria-label="(the square with an arrow)"
              />
              in the browser bar.
            </li>

            <li>
              Choose Add to Home Screen
              <PlusSquare
                size={16}
                aria-hidden
              />
            </li>

            <li>
              Always open it from the Home Screen icon. Your workouts are
              saved there, not in Safari.
            </li>
          </ol>

          <div className="install-banner-actions">
            <button
              className="text-button"
              onClick={dismiss}
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
