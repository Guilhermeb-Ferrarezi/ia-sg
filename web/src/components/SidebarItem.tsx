import type { LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { cn } from "../lib/utils";

type SidebarItemProps = {
  label: string;
  icon: LucideIcon;
  isActive: boolean;
  isCollapsed: boolean;
  onClick: () => void;
  badge?: string;
  danger?: boolean;
};

export default function SidebarItem({ label, icon: Icon, isActive, isCollapsed, onClick, badge, danger }: SidebarItemProps) {
  const baseClass = cn(
    "group flex w-full items-center rounded-xl border text-sm transition-all outline-none focus-visible:ring-2 focus-visible:ring-cyan-400",
    isActive
      ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
      : "border-transparent text-slate-400 hover:border-slate-700 hover:bg-slate-900 hover:text-slate-200",
    danger && !isActive ? "text-rose-300 hover:text-rose-200" : ""
  );

  const button = isCollapsed ? (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(baseClass, "h-10 justify-center px-0")}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="sr-only">{label}</span>
      {badge ? <span className="sr-only">{badge}</span> : null}
    </button>
  ) : (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(baseClass, "h-10 min-w-0 justify-between gap-2 px-3")}
    >
      <span className="flex min-w-0 items-center gap-3">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate whitespace-nowrap font-medium">{label}</span>
      </span>
      {badge ? (
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", danger ? "bg-rose-500/20 text-rose-300" : "bg-slate-800 text-slate-300")}>
          {badge}
        </span>
      ) : null}
    </button>
  );

  if (!isCollapsed) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
