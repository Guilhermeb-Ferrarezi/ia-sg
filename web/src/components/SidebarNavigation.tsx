import * as Collapsible from "@radix-ui/react-collapsible";
import { CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, MessageSquare, ShieldAlert, Sparkles, BarChart3 } from "lucide-react";
import SidebarItem from "./SidebarItem";
import { TooltipProvider } from "./ui/tooltip";
import { cn } from "../lib/utils";

export type AppPanel = "crm" | "faqs" | "chat" | "analytics" | "calendar" | "operation";

type SidebarNavigationProps = {
  activePanel: AppPanel;
  onSelectPanel: (panel: AppPanel) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  failedEventsCount: number;
};

export default function SidebarNavigation({
  activePanel,
  onSelectPanel,
  collapsed,
  onCollapsedChange,
  failedEventsCount
}: SidebarNavigationProps) {
  return (
    <TooltipProvider>
      <Collapsible.Root
        open={!collapsed}
        onOpenChange={(open) => onCollapsedChange(!open)}
        className={cn(
          "hidden overflow-hidden md:fixed md:inset-y-0 md:left-0 md:z-40 md:flex md:flex-col",
          "border-r border-slate-800 bg-slate-950/95 transition-[width] duration-300 ease-out",
          collapsed ? "md:w-20" : "md:w-64"
        )}
      >
        <div className="flex h-full min-h-0 flex-col px-3 pb-3 pt-4">
          <div className="mb-4 border-b border-slate-800 pb-4">
            <div className={cn("flex min-w-0 items-center gap-3 px-1", collapsed ? "justify-center" : "")}>
              <div className="rounded-lg bg-cyan-500/20 p-2 text-cyan-400">
                <Sparkles className="h-4 w-4" />
              </div>
              <div
                className={cn(
                  "min-w-0 overflow-hidden transition-[max-width,opacity] duration-200",
                  collapsed ? "max-w-0 opacity-0" : "max-w-[180px] opacity-100"
                )}
              >
                <p className="truncate text-sm font-semibold text-slate-100">CRM WhatsApp</p>
                <p className="truncate text-xs text-slate-500">Navegacao</p>
              </div>
            </div>
          </div>

          <nav
            className={cn(
              "min-h-0 flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden",
              collapsed ? "pr-0" : "supabase-scroll pr-1"
            )}
            aria-label="Menu lateral principal"
          >
            <SidebarItem label="CRM" icon={LayoutGrid} isActive={activePanel === "crm"} isCollapsed={collapsed} onClick={() => onSelectPanel("crm")} />
            <SidebarItem label="FAQs" icon={Sparkles} isActive={activePanel === "faqs"} isCollapsed={collapsed} onClick={() => onSelectPanel("faqs")} />
            <SidebarItem label="Chat" icon={MessageSquare} isActive={activePanel === "chat"} isCollapsed={collapsed} onClick={() => onSelectPanel("chat")} />
            <SidebarItem label="Analytics" icon={BarChart3} isActive={activePanel === "analytics"} isCollapsed={collapsed} onClick={() => onSelectPanel("analytics")} />
            <SidebarItem label="Calendario" icon={CalendarDays} isActive={activePanel === "calendar"} isCollapsed={collapsed} onClick={() => onSelectPanel("calendar")} />
            <SidebarItem
              label="Operacao"
              icon={ShieldAlert}
              isActive={activePanel === "operation"}
              isCollapsed={collapsed}
              onClick={() => onSelectPanel("operation")}
              badge={failedEventsCount > 0 ? String(failedEventsCount) : undefined}
              danger={failedEventsCount > 0}
            />
          </nav>

          <Collapsible.Trigger asChild>
            <button
              type="button"
              className={cn(
                "mt-3 flex h-10 w-full items-center rounded-xl border border-slate-800 bg-slate-900 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-cyan-400",
                collapsed ? "justify-center px-0" : "justify-center gap-2 px-3"
              )}
              aria-label={collapsed ? "Abrir menu" : "Fechar menu"}
            >
              {collapsed ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronLeft className="h-4 w-4 shrink-0" />}
              <span
                className={cn(
                  "overflow-hidden text-ellipsis whitespace-nowrap transition-[max-width,opacity] duration-200",
                  collapsed ? "max-w-0 opacity-0" : "max-w-[140px] opacity-100"
                )}
              >
                Fechar menu
              </span>
            </button>
          </Collapsible.Trigger>
        </div>
      </Collapsible.Root>
    </TooltipProvider>
  );
}
