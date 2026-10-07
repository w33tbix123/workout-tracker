// In-app replacements for window.confirm / window.alert.
//
// Native dialogs are blocked in some embedded browsers (they silently
// return false, so a destructive action just did nothing) and look
// foreign in the installed iPhone app. <DialogHost /> is mounted once
// (DialogHost.jsx) next to <App /> in main.jsx; anywhere in the app can then:
//
//   if (await confirmAction({ title, message, confirmLabel })) { ... }
//   await notify({ title, message });
//
// If the host isn't mounted the native dialogs are used as a fallback.

let showDialog = null;

// Called by <DialogHost /> on mount (with its setter) and unmount (null).
export function registerDialogHost(show) {
  showDialog = show;
}

export function confirmAction({
  title,
  message = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
}) {
  if (!showDialog) {
    return Promise.resolve(
      window.confirm(
        [title, message]
          .filter(Boolean)
          .join("\n\n")
      )
    );
  }

  return new Promise((resolve) => {
    showDialog({
      kind: "confirm",
      title,
      message,
      confirmLabel,
      cancelLabel,
      tone,
      resolve,
    });
  });
}

export function notify({
  title,
  message = "",
  confirmLabel = "OK",
}) {
  if (!showDialog) {
    window.alert(
      [title, message]
        .filter(Boolean)
        .join("\n\n")
    );

    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    showDialog({
      kind: "notice",
      title,
      message,
      confirmLabel,
      tone: "primary",
      resolve,
    });
  });
}
