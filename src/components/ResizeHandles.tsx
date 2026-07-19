import { useEffect } from "react";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function restoreLayoutSizes() {
  const left = Number(localStorage.getItem("gitmin:left-w") ?? localStorage.getItem("redismin:left-w"));
  const right = Number(localStorage.getItem("gitmin:right-w") ?? localStorage.getItem("redismin:right-w"));
  if (left) document.body.style.setProperty("--left-w", `${left}px`);
  if (right) document.body.style.setProperty("--right-w", `${right}px`);
  if (left) localStorage.setItem("gitmin:left-w", String(left));
  if (right) localStorage.setItem("gitmin:right-w", String(right));
}

export function startResize(
  event: React.PointerEvent,
  axis: "left" | "right",
) {
  event.preventDefault();
  const main = document.querySelector(".main");
  document.body.classList.add("resizing");
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  const move = (e: PointerEvent) => {
    if (axis === "left" && main) {
      const rect = main.getBoundingClientRect();
      const max = Math.min(430, rect.width - 760);
      const next = clamp(e.clientX - rect.left, 190, max);
      document.body.style.setProperty("--left-w", `${Math.round(next)}px`);
      localStorage.setItem("gitmin:left-w", String(Math.round(next)));
    }
    if (axis === "right" && main) {
      const rect = main.getBoundingClientRect();
      const max = Math.min(700, rect.width - 760);
      const next = clamp(rect.right - e.clientX, 260, max);
      document.body.style.setProperty("--right-w", `${Math.round(next)}px`);
      localStorage.setItem("gitmin:right-w", String(Math.round(next)));
    }
  };
  const stop = () => {
    document.body.classList.remove("resizing");
    window.removeEventListener("pointermove", move);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop, { once: true });
}

export function PanelResizeHandles() {
  useEffect(() => {
    restoreLayoutSizes();
  }, []);
  return (
    <>
      <div
        className="resize-handle vertical left"
        title="Resize left sidebar"
        aria-label="Resize left sidebar"
        onPointerDown={(e) => startResize(e, "left")}
      />
      <div
        className="resize-handle vertical right"
        title="Resize right inspector"
        aria-label="Resize right inspector"
        onPointerDown={(e) => startResize(e, "right")}
      />
    </>
  );
}
