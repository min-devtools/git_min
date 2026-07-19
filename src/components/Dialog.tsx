import { useEffect, useMemo, useRef, useState } from "react";
import { ToolButton } from "../ui/ToolButton";
import { useApp } from "../store";
import { canSubmitPrompt } from "../lib/gitUi";

/** In-app replacement for window.prompt/confirm — those don't render in the Tauri webview. */
export function Dialog() {
  const dialog = useApp((s) => s.dialog);
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState(0);
  // filter only after the user types — a prefilled default must not hide the list
  const [typed, setTyped] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (dialog?.kind === "prompt") {
      setValue(dialog.defaultValue ?? "");
      setCursor(0);
      setTyped(false);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [dialog]);

  // pick-list rows: filtered options, plus the typed text as a synthetic
  // "create"-style row when the host allows free text and nothing matches exactly
  const rows = useMemo(() => {
    if (dialog?.kind !== "prompt" || !dialog.options) return [];
    const q = value.trim().toLowerCase();
    const filtered = typed && q
      ? dialog.options.filter((o) => `${o.value} ${o.hint ?? ""}`.toLowerCase().includes(q))
      : dialog.options;
    const text = value.trim();
    if (dialog.freeText && text && !dialog.options.some((o) => o.value === text)) {
      return [...filtered, { value: text, hint: dialog.freeText }];
    }
    return filtered;
  }, [dialog, value, typed]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  // filtering can shrink the list under the cursor — clamp it back onto a row
  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  // Enter confirms, Esc cancels — capture phase so an open dialog swallows the key
  // before app-level global shortcuts (⌘⌫ delete, Esc closes palette/search) see it.
  useEffect(() => {
    if (!dialog) return;
    const hasList = dialog.kind === "prompt" && !!dialog.options;
    const onKey = (e: KeyboardEvent) => {
      // ↑↓ always drive the list; j/k only once the list itself has focus
      // (Tab from the input), so typing branch names stays possible — lazygit feel
      const listFocused = document.activeElement === listRef.current;
      const down = e.key === "ArrowDown" || (listFocused && e.key === "j");
      const up = e.key === "ArrowUp" || (listFocused && e.key === "k");
      if (hasList && (down || up)) {
        e.preventDefault();
        e.stopPropagation();
        setCursor((c) => down ? Math.min(rows.length - 1, c + 1) : Math.max(0, c - 1));
        return;
      }
      if (e.key === "Tab") {
        const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), [role=\"listbox\"]") ?? [])];
        if (!focusable.length) return;
        const current = focusable.indexOf(document.activeElement as HTMLElement);
        const next = e.shiftKey
          ? (current <= 0 ? focusable.length - 1 : current - 1)
          : (current + 1) % focusable.length;
        e.preventDefault();
        e.stopPropagation();
        focusable[next].focus();
        // landing on the list always starts at the first suggestion, never at
        // whatever row (e.g. the trailing "create new") was highlighted before
        if (focusable[next] === listRef.current) setCursor(0);
        return;
      }
      if (e.key !== "Enter" && e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") dialog.resolve(null);
      else if (dialog.kind !== "prompt") dialog.resolve("1");
      else if (hasList && rows[cursor]) dialog.resolve(rows[cursor].value);
      else if (canSubmitPrompt(value, dialog.allowEmpty === true)) dialog.resolve(value);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [dialog, value, rows, cursor]);

  if (!dialog) return null;

  const hasList = dialog.kind === "prompt" && !!dialog.options;
  const cancel = () => dialog.resolve(null);
  const submit = () => {
    if (hasList && rows[cursor]) return dialog.resolve(rows[cursor].value);
    if (dialog.kind === "prompt" && !canSubmitPrompt(value, dialog.allowEmpty === true)) return;
    dialog.resolve(dialog.kind === "prompt" ? value : "1");
  };

  return (
    <div className="modal" onMouseDown={(e) => { if (e.target === e.currentTarget) cancel(); }}>
      <div ref={dialogRef} className="prompt-dialog" role="dialog" aria-modal="true" aria-label={dialog.title}>
        <strong>{dialog.title}</strong>
        {dialog.message && <p className="prompt-dialog-msg">{dialog.message}</p>}
        {dialog.kind === "prompt" && (
          <input
            ref={inputRef}
            className="side-search"
            style={{ width: "100%" }}
            value={value}
            spellCheck={false}
            onChange={(e) => {
              setValue(e.target.value);
              setTyped(true);
              setCursor(0);
            }}
          />
        )}
        {hasList && (
          <div
            className="dialog-options"
            ref={listRef}
            role="listbox"
            tabIndex={0}
            // fixed height from the unfiltered option count — filtering must not
            // resize the modal (28px row + 10px padding, capped like the palette)
            style={{ height: Math.min(300, ((dialog.options?.length ?? 0) + (dialog.freeText ? 1 : 0)) * 28 + 10) }}
          >
            {rows.map((o, i) => (
              <div
                key={`${o.value}:${o.hint ?? ""}`}
                data-idx={i}
                role="option"
                aria-selected={i === cursor}
                className={`combobox-item ${i === cursor ? "active" : ""}`}
                // mousedown fires before input blur — keeps the click working
                onMouseDown={(e) => {
                  e.preventDefault();
                  dialog.resolve(o.value);
                }}
                onMouseEnter={() => setCursor(i)}
              >
                <span className="combobox-value">{o.value}</span>
                {o.hint && <span className="combobox-hint">{o.hint}</span>}
              </div>
            ))}
            {rows.length === 0 && <div className="empty-note compact">No matches.</div>}
          </div>
        )}
        <div className="prompt-dialog-foot">
          <ToolButton onClick={cancel}>Cancel</ToolButton>
          <ToolButton
            autoFocus={dialog.kind === "confirm"}
            variant={dialog.danger ? "danger" : "primary"}
            disabled={dialog.kind === "prompt" && !hasList && !canSubmitPrompt(value, dialog.allowEmpty === true)}
            onClick={submit}
          >
            {dialog.confirmLabel ?? (dialog.kind === "prompt" ? "Save" : "Confirm")}
          </ToolButton>
        </div>
      </div>
    </div>
  );
}
