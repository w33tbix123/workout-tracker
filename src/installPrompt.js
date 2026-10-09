import { useSyncExternalStore } from "react";

// Android Chrome (and other Chromium browsers) fire beforeinstallprompt
// when the site can be installed. The event is kept so our own Install
// button can open the browser's install dialog; iOS Safari never fires
// it, so nothing shows there. Imported from main.jsx so the listener is
// in place before React renders (the event can fire very early).

let deferredPrompt = null;

const listeners = new Set();

function notify() {
  listeners.forEach(
    (listener) => listener()
  );
}

if (typeof window !== "undefined") {
  window.addEventListener(
    "beforeinstallprompt",
    (event) => {
      // Stop Chrome's own mini-infobar; our card offers the install.
      event.preventDefault();

      deferredPrompt = event;

      notify();
    }
  );

  window.addEventListener(
    "appinstalled",
    () => {
      deferredPrompt = null;

      notify();
    }
  );
}

function subscribe(listener) {
  listeners.add(listener);

  return () =>
    listeners.delete(listener);
}

function getSnapshot() {
  return deferredPrompt;
}

// Opens the browser's install dialog. The saved event can only be used
// once, so it is cleared whatever the answer.
async function promptInstall() {
  const prompt = deferredPrompt;

  if (!prompt) {
    return false;
  }

  deferredPrompt = null;

  notify();

  await prompt.prompt();

  const choice =
    await prompt.userChoice;

  return choice?.outcome === "accepted";
}

export function useInstallPrompt() {
  const prompt = useSyncExternalStore(
    subscribe,
    getSnapshot
  );

  return {
    canInstall: !!prompt,
    promptInstall,
  };
}
