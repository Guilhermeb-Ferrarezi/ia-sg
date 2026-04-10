import * as Collapsible from "@radix-ui/react-collapsible";
import { BarChart3, CalendarDays, ChevronLeft, ChevronRight, GraduationCap, LayoutGrid, LogOut, MessageSquare, ScrollText, Settings, ShieldAlert, Sparkles } from "lucide-react";
import logoVermelha from "../assets/logoVermelha.png";
import { cn } from "../lib/utils";
import SidebarItem from "./SidebarItem";
import { TooltipProvider } from "./ui/tooltip";

export type AppPanel = "crm" | "faqs" | "chat" | "analytics" | "calendar" | "operation" | "logs" | "offers" | "settings";

type SidebarNavigationProps = {
  activePanel: AppPanel;
  onSelectPanel: (panel: AppPanel) => void;
  onLogout: () => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  logoutSubmitting?: boolean;
  failedEventsCount: number;
  overlay?: boolean;
};

export default function SidebarNavigation({
  activePanel,
  onSelectPanel,
  onLogout,
  collapsed,
  onCollapsedChange,
  logoutSubmitting = false,
  failedEventsCount,
  overlay = false
}: SidebarNavigationProps) {
  return (
    <TooltipProvider>
      <Collapsible.Root
        open={!collapsed}
        onOpenChange={(open) => onCollapsedChange(!open)}
        className={cn(
          overlay
            ? "fixed inset-y-0 left-0 z-[70] flex flex-col shadow-[0_30px_120px_rgba(2,6,23,0.45)]"
            : "hidden overflow-hidden md:fixed md:inset-y-0 md:left-0 md:z-40 md:flex md:flex-col",
          "border-r border-slate-800 bg-slate-950/95 transition-[width] duration-300 ease-out",
          overlay ? (collapsed ? "w-20" : "w-64") : (collapsed ? "md:w-20" : "md:w-64")
        )}
      >
        <div className="flex h-full min-h-0 flex-col px-3 pb-3 pt-4">
          <div className="mb-4 border-b border-slate-800 pb-4">
            <div className={cn("flex min-w-0 items-center gap-3 px-1", collapsed ? "justify-center" : "")}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-rose-500/20 bg-white/95 shadow-[0_10px_30px_rgba(239,68,68,0.18)]">
                <img src={logoVermelha} alt="Santos Tech" className="h-8 w-8 object-contain" />
              </div>
              <div
                className={cn(
                  "min-w-0 overflow-hidden transition-[max-width,opacity] duration-200",
                  collapsed ? "max-w-0 opacity-0" : "max-w-[180px] opacity-100"
                )}
              >
                <p className="truncate text-sm font-semibold uppercase tracking-[0.18em] text-slate-100">SANTOS TECH</p>
                <p className="truncate text-xs text-slate-500">CRM WhatsApp</p>
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
            <SidebarItem label="Logs" icon={ScrollText} isActive={activePanel === "logs"} isCollapsed={collapsed} onClick={() => onSelectPanel("logs")} />
            <SidebarItem label="Landings" icon={GraduationCap} isActive={activePanel === "offers"} isCollapsed={collapsed} onClick={() => onSelectPanel("offers")} />
            <SidebarItem
              label="Operacao"
              icon={ShieldAlert}
              isActive={activePanel === "operation"}
              isCollapsed={collapsed}
              onClick={() => onSelectPanel("operation")}
              badge={failedEventsCount > 0 ? String(failedEventsCount) : undefined}
              danger={failedEventsCount > 0}
            />

            <div className="my-2 border-t border-slate-800/60" />

            <SidebarItem label="Configuracoes" icon={Settings} isActive={activePanel === "settings"} isCollapsed={collapsed} onClick={() => onSelectPanel("settings")} />
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
                Colapsar menu
              </span>
            </button>
          </Collapsible.Trigger>

          <button
            type="button"
            onClick={onLogout}
            disabled={logoutSubmitting}
            className={cn(
              "mt-2 flex h-10 w-full items-center rounded-xl border border-rose-500/25 bg-rose-500/5 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/10 disabled:opacity-50",
              collapsed ? "justify-center px-0" : "justify-center gap-2 px-3"
            )}
            aria-label="Encerrar sessao"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span
              className={cn(
                "overflow-hidden text-ellipsis whitespace-nowrap transition-[max-width,opacity] duration-200",
                collapsed ? "max-w-0 opacity-0" : "max-w-[140px] opacity-100"
              )}
            >
              Sair
            </span>
          </button>
        </div>
      </Collapsible.Root>
    </TooltipProvider>
  );
}
