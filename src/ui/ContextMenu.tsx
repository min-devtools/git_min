import { useEffect, useRef } from "react";
import { Icon, type IconName } from "./Icon";
import { useApp } from "../store";

export interface ContextMenuItem {
  icon: IconName;
  label: string;
  strong?: boolean;
  danger?: boolean;
  /** shortcut hint rendered right-aligned (e.g. "⌘D") */
  kbd?: string;
  onClick: () => void;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const setContextMenuOpen = useApp((state) => state.setContextMenuOpen);

  useEffect(() => {
    setContextMenuOpen(true);
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      e.stopPropagation();
      const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];
      if (!buttons.length) return;
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const direction = e.key === "ArrowDown" ? 1 : -1;
      buttons[(current + direction + buttons.length) % buttons.length].focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    requestAnimationFrame(() => ref.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus());
    return () => {
      setContextMenuOpen(false);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose, setContextMenuOpen]);

  // clamp to viewport
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth) el.style.left = `${window.innerWidth - rect.width - 12}px`;
    if (rect.bottom > window.innerHeight) el.style.top = `${window.innerHeight - rect.height - 12}px`;
  }, [x, y]);

  return (
    <div ref={ref} className="index-context-menu" role="menu" style={{ left: x, top: y }}>
      {items.map((item) => (
        <button
          type="button"
          role="menuitem"
          key={item.label}
          className={`context-item ${item.danger ? "danger" : ""}`}
          onClick={() => {
            item.onClick();
            onClose();
          }}
        >
          <Icon name={item.icon} size={15} />
          {item.strong ? <strong>{item.label}</strong> : <span>{item.label}</span>}
          {item.kbd ? <span className="kbd">{item.kbd}</span> : <span />}
        </button>
      ))}
    </div>
  );
}
