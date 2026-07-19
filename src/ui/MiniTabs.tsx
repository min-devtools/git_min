export interface MiniTab {
  id: string;
  label: string;
}

export function MiniTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: MiniTab[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="mini-tabs" role="tablist">
      {tabs.map((t, index) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === active}
          tabIndex={t.id === active ? 0 : -1}
          className={t.id === active ? "active" : ""}
          onClick={() => onChange(t.id)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            const direction = event.key === "ArrowRight" ? 1 : -1;
            const next = (index + direction + tabs.length) % tabs.length;
            onChange(tabs[next].id);
            requestAnimationFrame(() => {
              const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]");
              buttons?.[next]?.focus();
            });
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
