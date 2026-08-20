"use client";

export function ForeignerBadge({
  ok,
  className = "",
}: {
  ok?: boolean;
  className?: string;
}) {
  if (ok !== true) return null;
  return (
    <span
      className={`rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-medium text-emerald-200 ${className}`}
    >
      Foreigners welcome
    </span>
  );
}
