import { useEffect, useRef, useState } from "react";

import { registerDialogHost } from "./confirm.js";

// Renders the sheet for confirmAction() / notify() from confirm.js.
export function DialogHost() {
  const [
    request,
    setRequest,
  ] = useState(null);

  const cancelRef =
    useRef(null);

  const confirmRef =
    useRef(null);

  useEffect(() => {
    // A new dialog replaces any open one, which counts as cancelled.
    registerDialogHost(
      (next) =>
        setRequest(
          (previous) => {
            previous?.resolve(
              false
            );

            return next;
          }
        )
    );

    return () =>
      registerDialogHost(
        null
      );
  }, []);

  // Focus the safe choice first: Cancel for confirmations, OK for
  // notices. Escape cancels.
  useEffect(() => {
    if (!request) {
      return undefined;
    }

    (request.kind === "confirm"
      ? cancelRef
      : confirmRef
    ).current?.focus();

    function onKeyDown(event) {
      if (event.key === "Escape") {
        request.resolve(
          request.kind !== "confirm"
        );

        setRequest(null);
      }
    }

    document.addEventListener(
      "keydown",
      onKeyDown
    );

    return () =>
      document.removeEventListener(
        "keydown",
        onKeyDown
      );
  }, [request]);

  function close(result) {
    request?.resolve(result);

    setRequest(null);
  }

  if (!request) {
    return null;
  }

  const messageLines =
    String(
      request.message || ""
    )
      .split("\n")
      .filter(
        (line) =>
          line.trim() !== ""
      );

  return (
    <div
      className="form-overlay dialog-overlay"
      onClick={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          close(
            request.kind !==
              "confirm"
          );
        }
      }}
    >
      <div
        className="form-sheet dialog-sheet"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={
          messageLines.length
            ? "dialog-message"
            : undefined
        }
      >
        <h2 id="dialog-title">
          {request.title}
        </h2>

        {messageLines.length > 0 && (
          <div
            id="dialog-message"
            className="dialog-message"
          >
            {messageLines.map(
              (line, index) => (
                <p key={index}>
                  {line}
                </p>
              )
            )}
          </div>
        )}

        <div
          className={`form-actions ${
            request.kind ===
            "confirm"
              ? ""
              : "single"
          }`}
        >
          {request.kind ===
            "confirm" && (
            <button
              ref={cancelRef}
              className="secondary-form-button"
              onClick={() =>
                close(false)
              }
            >
              {
                request.cancelLabel
              }
            </button>
          )}

          <button
            ref={confirmRef}
            className={`primary-form-button ${
              request.tone ===
              "danger"
                ? "danger"
                : ""
            }`}
            onClick={() =>
              close(true)
            }
          >
            {
              request.confirmLabel
            }
          </button>
        </div>
      </div>
    </div>
  );
}
