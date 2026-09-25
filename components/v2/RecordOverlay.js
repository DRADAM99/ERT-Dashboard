"use client";

export default function RecordOverlay({ open, onClose, children, variant = "sheet" }) {
  if (!open) return null;
  const isSplit = variant === "split";
  return (
    <div
      className={`${isSplit ? "v2-split-overlay " : ""}fixed inset-0 z-40 bg-black/35`}
      onClick={onClose}
    >
      <div
        className="absolute inset-x-0 bottom-0 top-12 overflow-auto rounded-t-2xl bg-white pb-[calc(72px+env(safe-area-inset-bottom))] shadow-2xl md:inset-y-0 md:start-0 md:top-[56px] md:bottom-0 md:max-w-[540px] md:rounded-none md:border-e"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
