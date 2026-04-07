
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FormEvent } from "react";
import ConfirmModal from "./components/ConfirmModal";
import FaqManagerSection from "./components/FaqManagerSection";
import ChatSection from "./components/ChatSection";
import MessageNotifications from "./components/MessageNotifications";
import AnalyticsSection from "./components/AnalyticsSection";
import CalendarSection from "./components/CalendarSection";
import SidebarNavigation, { type AppPanel } from "./components/SidebarNavigation";
import SystemHealthSection from "./components/SystemHealthSection";
import WebhookEventsSection from "./components/WebhookEventsSection";
import LogsSection from "./components/LogsSection";
import SettingsSection from "./components/SettingsSection";
import OffersSection from "./components/OffersSection";
import PaginationControls from "./components/PaginationControls";
import StatCard from "./components/StatCard";
import LeadQualificationPanel from "./components/LeadQualificationPanel";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "./components/ui/sheet";
import { apiFetch } from "./lib/apiFetch";
import { buildLeadProfileDraft, getQualificationCompletion, getQualificationSignals, parseQualificationScore, type LeadProfileDraft } from "./lib/leadQualification";
import { resolveWebSocketUrl } from "./lib/ws";
import { BarChart3, CalendarDays, GraduationCap, LayoutGrid, Menu, MessageSquare, ScrollText, Settings, ShieldAlert, Sparkles, type LucideIcon } from "lucide-react";
import type { AppLog, AuthUser, ConfirmDialogState, ContactMessage, ConversionMetrics, FaqItem, Lead, LogsResponse, PaginationMeta, PipelineStage, SystemHealthDetails, SystemReadiness, TaskPriority, TaskStatus, Toast, WebhookEvent, WebhookEventsResponse } from "./types/dashboard";
import ToastContainer from "./components/ToastContainer";

const TASK_PRIORITIES: TaskPriority[] = ["low", "medium", "high"];
const TASK_STATUSES: TaskStatus[] = ["open", "done", "canceled"];
const DEFAULT_LEAD_MESSAGES_PAGE_SIZE = 20;

function normalizeWaIdClient(input: string): string {
  return input.replace(/[^\d]/g, "");
}

function normalizeNullableText(value: unknown): string | null {
  if (typeof value !== "string") return value == null ? null : String(value);
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export default function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [activePanel, setActivePanel] = useState<AppPanel>("crm");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [offersWorkspaceOpen, setOffersWorkspaceOpen] = useState(false);
  const [activeChatWaId, setActiveChatWaId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: "success" | "error" | "info" | "loading" = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    return id;
  }, []);

  const updateToast = useCallback((id: string, message: string, type: "success" | "error" | "info" | "loading") => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, message, type } : t)));
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [faqSubmitting, setFaqSubmitting] = useState(false);
  const [faqUpdatingId, setFaqUpdatingId] = useState<number | null>(null);
  const [faqDeletingId, setFaqDeletingId] = useState<number | null>(null);
  const [deletingLeadId, setDeletingLeadId] = useState<number | null>(null);
  const [faqQuestion, setFaqQuestion] = useState("");
  const [faqAnswer, setFaqAnswer] = useState("");
  const [editingFaqId, setEditingFaqId] = useState<number | null>(null);
  const [editingFaqQuestion, setEditingFaqQuestion] = useState("");
  const [editingFaqAnswer, setEditingFaqAnswer] = useState("");
  const [editingFaqIsActive, setEditingFaqIsActive] = useState(true);

  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [metrics, setMetrics] = useState<ConversionMetrics | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leadDraft, setLeadDraft] = useState<LeadProfileDraft | null>(null);
  const [leadDetailsModalOpen, setLeadDetailsModalOpen] = useState(false);
  const [savingLeadDraft, setSavingLeadDraft] = useState(false);
  const [leadDetailsLoading, setLeadDetailsLoading] = useState(false);
  const [leadMessages, setLeadMessages] = useState<ContactMessage[]>([]);
  const [leadMessagesLoading, setLeadMessagesLoading] = useState(false);
  const [leadMessagesPage, setLeadMessagesPage] = useState(1);
  const [leadMessagesPageSize, setLeadMessagesPageSize] = useState(DEFAULT_LEAD_MESSAGES_PAGE_SIZE);
  const [leadMessagesPagination, setLeadMessagesPagination] = useState<PaginationMeta | null>(null);
  const leadDetailsRequestRef = useRef(0);
  const leadMessagesRequestRef = useRef(0);
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const [stageSubmitting, setStageSubmitting] = useState(false);
  const [draggedLeadId, setDraggedLeadId] = useState<number | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<number | null>(null);
  const [movingLeadId, setMovingLeadId] = useState<number | null>(null);
  const [draggedStageId, setDraggedStageId] = useState<number | null>(null);
  const [dragOverStageOrder, setDragOverStageOrder] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [courseFilter, setCourseFilter] = useState("");
  const [modalityFilter, setModalityFilter] = useState("");
  const [scoreMinFilter, setScoreMinFilter] = useState("");
  const [scoreMaxFilter, setScoreMaxFilter] = useState("");
  const [handoffFilter, setHandoffFilter] = useState<"all" | "true" | "false">("all");
  const [kanbanPageSize, setKanbanPageSize] = useState(5);
  const [kanbanStagePage, setKanbanStagePage] = useState<Record<number, number>>({});

  const [leadName, setLeadName] = useState("");
  const [leadWaId, setLeadWaId] = useState("");
  const [leadSource, setLeadSource] = useState("");
  const [leadNotes, setLeadNotes] = useState("");

  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState("#06b6d4");

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDueAt, setTaskDueAt] = useState("");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("medium");

  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userRef = useRef<AuthUser | null>(user);
  const selectedLeadIdRef = useRef<number | null>(selectedLeadId);
  const leadsRef = useRef<Lead[]>(leads);
  const movingLeadIdRef = useRef<number | null>(movingLeadId);
  const activePanelRef = useRef<AppPanel>(activePanel);

  const [systemReadiness, setSystemReadiness] = useState<SystemReadiness | null>(null);
  const [systemHealthDetails, setSystemHealthDetails] = useState<SystemHealthDetails | null>(null);
  const [systemLoading, setSystemLoading] = useState(false);
  const [systemError, setSystemError] = useState("");
  const [systemLastUpdated, setSystemLastUpdated] = useState<Date | null>(null);

  const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>([]);
  const [webhookEventsLoading, setWebhookEventsLoading] = useState(false);
  const [webhookEventsError, setWebhookEventsError] = useState("");
  const [webhookEventsStatusFilter, setWebhookEventsStatusFilter] = useState("all");
  const [webhookEventsPage, setWebhookEventsPage] = useState(1);
  const [webhookEventsLimit] = useState(10);
  const [webhookEventsTotal, setWebhookEventsTotal] = useState(0);
  const [webhookReplayId, setWebhookReplayId] = useState<number | null>(null);

  const [logs, setLogs] = useState<AppLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState("");
  const [logsLevelFilter, setLogsLevelFilter] = useState("all");
  const [logsStatusFilter, setLogsStatusFilter] = useState("all");
  const [logsSearchFilter, setLogsSearchFilter] = useState("");
  const [logsPathFilter, setLogsPathFilter] = useState("");
  const [logsRequestIdFilter, setLogsRequestIdFilter] = useState("");
  const [logsWaIdFilter, setLogsWaIdFilter] = useState("");
  const [logsIpFilter, setLogsIpFilter] = useState("");
  const [logsClientOsFilter, setLogsClientOsFilter] = useState("");
  const [logsPage, setLogsPage] = useState(1);
  const [logsLimit, setLogsLimit] = useState(10);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsFilterLabels, setLogsFilterLabels] = useState<Record<string, string>>({});
  const [logsDeletePassword, setLogsDeletePassword] = useState("");
  const [logsDeleteAuthExpiresAt, setLogsDeleteAuthExpiresAt] = useState<string | null>(null);
  const [logsDeleteAuthSubmitting, setLogsDeleteAuthSubmitting] = useState(false);
  const [logsDeleteSubmitting, setLogsDeleteSubmitting] = useState(false);

  useEffect(() => {
    userRef.current = user;
    selectedLeadIdRef.current = selectedLeadId;
    leadsRef.current = leads;
    movingLeadIdRef.current = movingLeadId;
    activePanelRef.current = activePanel;
  }, [user, selectedLeadId, leads, movingLeadId, activePanel]);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; lead: Lead; stageSubmenu?: boolean } | null>(null);

  const loadFaqs = useCallback(async () => {
    const result = await apiFetch<{ faqs: FaqItem[] }>("/dashboard/faqs");
    setFaqs(result.faqs);
  }, []);

  const loadCrm = useCallback(async () => {
    const params = new URLSearchParams({ limit: "200" });
    if (courseFilter.trim()) params.set("course", courseFilter.trim());
    if (modalityFilter.trim()) params.set("modality", modalityFilter.trim());
    if (scoreMinFilter.trim()) params.set("scoreMin", scoreMinFilter.trim());
    if (scoreMaxFilter.trim()) params.set("scoreMax", scoreMaxFilter.trim());
    if (handoffFilter !== "all") params.set("handoffNeeded", handoffFilter);

    const [stagesRes, leadsRes, metricsRes] = await Promise.all([
      apiFetch<{ stages: PipelineStage[] }>("/crm/stages"),
      apiFetch<{ leads: Lead[] }>(`/crm/leads?${params.toString()}`),
      apiFetch<ConversionMetrics>("/crm/metrics/conversion")
    ]);
    const sortedStages = stagesRes.stages.slice().sort((a, b) => a.position - b.position);
    setStages(sortedStages);
    setLeads((currentLeads) => {
      const movingId = movingLeadIdRef.current;
      if (!movingId) return leadsRes.leads;
      const optimisticLead = currentLeads.find((lead) => lead.id === movingId);
      if (!optimisticLead) return leadsRes.leads;
      return leadsRes.leads.map((lead) =>
        lead.id === movingId
          ? {
            ...lead,
            stageId: optimisticLead.stageId,
            stage: optimisticLead.stage || lead.stage
          }
          : lead
      );
    });
    setMetrics(metricsRes);
  }, [courseFilter, modalityFilter, scoreMinFilter, scoreMaxFilter, handoffFilter]);

  const loadSystemData = useCallback(async () => {
    setSystemLoading(true);
    try {
      const [readiness, details] = await Promise.all([
        apiFetch<SystemReadiness>("/system/readiness"),
        apiFetch<SystemHealthDetails>("/system/health-details")
      ]);
      setSystemReadiness(readiness);
      setSystemHealthDetails(details);
      setSystemError("");
      setSystemLastUpdated(new Date());
    } catch (err) {
      setSystemError(err instanceof Error ? err.message : "Falha ao consultar status do sistema.");
    } finally {
      setSystemLoading(false);
    }
  }, []);

  const loadWebhookEvents = useCallback(async (page = webhookEventsPage, status = webhookEventsStatusFilter) => {
    setWebhookEventsLoading(true);
    try {
      const statusQuery = status !== "all" ? `&status=${encodeURIComponent(status)}` : "";
      const response = await apiFetch<WebhookEventsResponse>(
        `/webhook/events?page=${page}&limit=${webhookEventsLimit}${statusQuery}`
      );
      setWebhookEvents(response.events);
      setWebhookEventsPage(response.page);
      setWebhookEventsTotal(response.total);
      setWebhookEventsError("");
    } catch (err) {
      setWebhookEventsError(err instanceof Error ? err.message : "Falha ao carregar eventos de webhook.");
    } finally {
      setWebhookEventsLoading(false);
    }
  }, [webhookEventsLimit, webhookEventsPage, webhookEventsStatusFilter]);

  const loadLogs = useCallback(async (
    page = logsPage,
    level = logsLevelFilter,
    status = logsStatusFilter,
    search = logsSearchFilter,
    path = logsPathFilter,
    requestId = logsRequestIdFilter,
    waId = logsWaIdFilter,
    ip = logsIpFilter,
    clientOs = logsClientOsFilter,
    limit = logsLimit
  ) => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (level !== "all") params.set("level", level);
      if (status !== "all") params.set("status", status);
      if (search.trim()) params.set("search", search.trim());
      if (path.trim()) params.set("path", path.trim());
      if (requestId.trim()) params.set("requestId", requestId.trim());
      if (waId.trim()) params.set("waId", waId.trim());
      if (ip.trim()) params.set("ip", ip.trim());
      if (clientOs.trim()) params.set("clientOs", clientOs.trim());
      const response = await apiFetch<LogsResponse>(`/logs?${params.toString()}`);
      setLogs(response.logs);
      setLogsPage(response.page);
      setLogsTotal(response.total);
      setLogsFilterLabels(response.filterLabels || {});
      setLogsError("");
    } catch (err) {
      setLogsError(err instanceof Error ? err.message : "Falha ao carregar logs.");
    } finally {
      setLogsLoading(false);
    }
  }, [logsLimit, logsPage, logsLevelFilter, logsStatusFilter, logsSearchFilter, logsPathFilter, logsRequestIdFilter, logsWaIdFilter, logsIpFilter, logsClientOsFilter]);

  const handleClearLogFilters = useCallback(() => {
    setLogsLevelFilter("all");
    setLogsStatusFilter("all");
    setLogsSearchFilter("");
    setLogsPathFilter("");
    setLogsRequestIdFilter("");
    setLogsWaIdFilter("");
    setLogsIpFilter("");
    setLogsClientOsFilter("");
    setLogsPage(1);
  }, []);

  const handleAuthorizeLogDelete = useCallback(async () => {
    if (!logsDeletePassword.trim()) {
      setLogsError("Informe a senha para autorizar exclusão de logs.");
      return;
    }

    setLogsDeleteAuthSubmitting(true);
    try {
      const result = await apiFetch<{ expiresAt: string }>("/logs/delete-auth", {
        method: "POST",
        body: JSON.stringify({ password: logsDeletePassword })
      });
      setLogsDeleteAuthExpiresAt(result.expiresAt);
      setLogsDeletePassword("");
      setLogsError("");
      addToast("Exclusão de logs autorizada por 2m30.", "success");
    } catch (err) {
      setLogsError(err instanceof Error ? err.message : "Falha ao autorizar exclusão de logs.");
    } finally {
      setLogsDeleteAuthSubmitting(false);
    }
  }, [addToast, logsDeletePassword]);

  const handleDeleteLogs = useCallback(async (deleteAll = false) => {
    setLogsDeleteSubmitting(true);
    try {
      const params = new URLSearchParams();
      if (deleteAll) {
        params.set("all", "true");
      } else {
        if (logsLevelFilter !== "all") params.set("level", logsLevelFilter);
        if (logsStatusFilter !== "all") params.set("status", logsStatusFilter);
        if (logsSearchFilter.trim()) params.set("search", logsSearchFilter.trim());
        if (logsPathFilter.trim()) params.set("path", logsPathFilter.trim());
        if (logsRequestIdFilter.trim()) params.set("requestId", logsRequestIdFilter.trim());
        if (logsWaIdFilter.trim()) params.set("waId", logsWaIdFilter.trim());
        if (logsIpFilter.trim()) params.set("ip", logsIpFilter.trim());
        if (logsClientOsFilter.trim()) params.set("clientOs", logsClientOsFilter.trim());
      }

      const query = params.toString();
      const result = await apiFetch<{ deletedCount: number }>(`/logs${query ? `?${query}` : ""}`, {
        method: "DELETE"
      });

      addToast(`${result.deletedCount} log(s) removido(s).`, "success");
      await loadLogs(1, logsLevelFilter, logsStatusFilter, logsSearchFilter, logsPathFilter, logsRequestIdFilter, logsWaIdFilter, logsIpFilter, logsClientOsFilter, logsLimit);
    } catch (err) {
      setLogsError(err instanceof Error ? err.message : "Falha ao excluir logs.");
    } finally {
      setLogsDeleteSubmitting(false);
    }
  }, [addToast, loadLogs, logsClientOsFilter, logsIpFilter, logsLevelFilter, logsLimit, logsPathFilter, logsRequestIdFilter, logsSearchFilter, logsStatusFilter, logsWaIdFilter]);

  const handleReplayWebhookEvent = useCallback(async (id: number) => {
    setWebhookReplayId(id);
    try {
      await apiFetch(`/webhook/events/${id}/replay`, { method: "POST" });
      addToast("Evento enviado para reprocessamento.", "success");
      await loadWebhookEvents(webhookEventsPage, webhookEventsStatusFilter);
    } catch (err) {
      setWebhookEventsError(err instanceof Error ? err.message : "Falha ao reprocessar evento.");
      addToast("Falha ao reprocessar evento.", "error");
    } finally {
      setWebhookReplayId(null);
    }
  }, [addToast, loadWebhookEvents, webhookEventsPage, webhookEventsStatusFilter]);

  const loadLeadDetails = useCallback(async (id: number) => {
    const requestId = ++leadDetailsRequestRef.current;
    setLeadDetailsLoading(true);
    try {
      const result = await apiFetch<{ lead: Lead }>(`/crm/leads/${id}`);
      if (requestId !== leadDetailsRequestRef.current) return;
      setSelectedLead(result.lead);
    } finally {
      if (requestId === leadDetailsRequestRef.current) {
        setLeadDetailsLoading(false);
      }
    }
  }, []);

  const loadLeadMessages = useCallback(async (leadId: number, page: number) => {
    const requestId = ++leadMessagesRequestRef.current;
    setLeadMessagesLoading(true);
    try {
      const result = await apiFetch<{ messages: ContactMessage[]; pagination: PaginationMeta }>(
        `/crm/leads/${leadId}/messages?page=${page}&limit=${leadMessagesPageSize}`
      );
      if (requestId !== leadMessagesRequestRef.current) return;
      setLeadMessages(result.messages);
      setLeadMessagesPagination(result.pagination);
      setLeadMessagesPage(result.pagination.page);
    } finally {
      if (requestId === leadMessagesRequestRef.current) {
        setLeadMessagesLoading(false);
      }
    }
  }, [leadMessagesPageSize]);

  const checkSession = useCallback(async () => {
    setLoading(true);
    try {
      const [session] = await Promise.all([
        apiFetch<{ user: AuthUser }>("/auth/me"),
        loadFaqs(),
        loadCrm()
      ]);
      setUser(session.user);
      setError("");
    } catch {
      setUser(null);
      setFaqs([]);
      setStages([]);
      setLeads([]);
      setSelectedLeadId(null);
      setSelectedLead(null);
    } finally {
      setLoading(false);
    }
  }, [loadFaqs, loadCrm]);

  useEffect(() => {
    checkSession().catch(() => setLoading(false));
  }, [checkSession]);

  useEffect(() => {
    if (!user) return;
    void loadSystemData();
    const timer = window.setInterval(() => {
      void loadSystemData();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [user, loadSystemData]);

  useEffect(() => {
    if (!user || activePanel !== "operation") return;
    void loadWebhookEvents(webhookEventsPage, webhookEventsStatusFilter);
  }, [user, activePanel, webhookEventsPage, webhookEventsStatusFilter, loadWebhookEvents]);

  useEffect(() => {
    if (!user || activePanel !== "operation") return;
    const timer = window.setInterval(() => {
      void loadWebhookEvents(webhookEventsPage, webhookEventsStatusFilter);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [user, activePanel, loadWebhookEvents, webhookEventsPage, webhookEventsStatusFilter]);

  useEffect(() => {
    if (!user || activePanel !== "logs") return;
    void loadLogs(logsPage, logsLevelFilter, logsStatusFilter, logsSearchFilter, logsPathFilter, logsRequestIdFilter, logsWaIdFilter, logsIpFilter, logsClientOsFilter, logsLimit);
  }, [user, activePanel, logsPage, logsLevelFilter, logsStatusFilter, logsSearchFilter, logsPathFilter, logsRequestIdFilter, logsWaIdFilter, logsIpFilter, logsClientOsFilter, logsLimit, loadLogs]);

  useEffect(() => {
    function connect() {
      if (!userRef.current) return;

      const ws = new WebSocket(resolveWebSocketUrl());

      ws.onopen = () => console.log("[WS Pipeline] Connected");

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "system_health_updated") {
            const readiness =
              typeof data.readiness === "object" && data.readiness !== null
                ? (data.readiness as SystemReadiness)
                : null;
            const details =
              typeof data.details === "object" && data.details !== null
                ? (data.details as SystemHealthDetails)
                : null;

            if (readiness) setSystemReadiness(readiness);
            if (details) setSystemHealthDetails(details);
            setSystemLastUpdated(new Date());
            setSystemError("");
          }

          if (data.type === "faqs_updated") {
            void loadFaqs();
          }

          if (data.type === "webhook_event_updated") {
            if (activePanelRef.current === "operation") {
              void loadWebhookEvents();
            }
          }

          if (data.type === "analytics_updated") {
            window.dispatchEvent(new CustomEvent("ws-analytics-updated"));
          }

          if (data.type === "calendar_tasks_updated") {
            window.dispatchEvent(new CustomEvent("ws-calendar-tasks-updated"));
          }

          if (data.type === "templates_updated") {
            window.dispatchEvent(new CustomEvent("ws-templates-updated"));
          }

          if (data.type === "dashboard_updated") {
            window.dispatchEvent(new CustomEvent("ws-dashboard-updated"));
          }

          if (data.type === "lead_profile_updated") {
            const leadId = Number(data.leadId);
            if (Number.isInteger(leadId) && leadId > 0 && selectedLeadIdRef.current === leadId) {
              void loadLeadDetails(leadId);
            }
            void loadCrm();
          }

          if (["lead_created", "lead_deleted", "stage_updated", "new_message"].includes(data.type)) {
            void loadCrm();
            void loadFaqs(); // also refresh faqs just in case

            // If the currently viewed lead was deleted, clear selection
            if (data.type === "lead_deleted" && data.id === selectedLeadIdRef.current) {
              setSelectedLeadId(null);
            }
          }

          if (data.type === "lead_updated") {
            const updatedLead = data.lead as Lead;
            const isMovingCurrentLead = movingLeadIdRef.current === updatedLead.id;
            setLeads(prev => prev.map(l => l.id === updatedLead.id ? updatedLead : l));
            if (selectedLeadIdRef.current === updatedLead.id) {
              setSelectedLead(updatedLead);
            }
            if (!isMovingCurrentLead) {
              void loadCrm(); // refresh metrics and full list order
            }
          }

          if (data.type === "webhook_event_failed") {
            const eventId = typeof data.webhookEventId === "number" ? data.webhookEventId : null;
            addToast(
              eventId ? `Falha em evento webhook #${eventId}.` : "Falha em evento webhook detectada.",
              "error"
            );

            if (activePanelRef.current === "operation") {
              void loadWebhookEvents(1, webhookEventsStatusFilter);
            }
          }

          if (data.type === "new_message") {
            const incomingMessage =
              typeof data.message === "object" && data.message !== null
                ? (data.message as Record<string, unknown>)
                : null;
            const incomingBody =
              incomingMessage && typeof incomingMessage.body === "string" ? incomingMessage.body : "";
            const incomingDirection =
              incomingMessage && typeof incomingMessage.direction === "string" ? incomingMessage.direction : "";

            let contactName = typeof data.waId === "string" ? data.waId : "Contato";
            const contactIdRaw = Number(data.contactId);
            if (Number.isInteger(contactIdRaw) && contactIdRaw > 0) {
              const knownLead = leadsRef.current.find((lead) => lead.id === contactIdRaw);
              if (knownLead) contactName = knownLead.name || knownLead.waId;
            }

            // Dispatch custom event for notifications
            window.dispatchEvent(
              new CustomEvent("ws-new-message", {
                detail: {
                  ...data,
                  body: incomingBody,
                  direction: incomingDirection,
                  contactName
                }
              })
            );

            // If viewing this lead, refresh history
            let incomingLeadId: number | null = null;
            if (Number.isInteger(contactIdRaw) && contactIdRaw > 0) {
              incomingLeadId = contactIdRaw;
            } else if (typeof data.waId === "string" && data.waId.trim()) {
              const incomingWaId = normalizeWaIdClient(data.waId);
              const leadWithNewMsg = leadsRef.current.find(
                (lead) => normalizeWaIdClient(lead.waId) === incomingWaId
              );
              incomingLeadId = leadWithNewMsg?.id || null;
            }

            if (incomingLeadId && selectedLeadIdRef.current === incomingLeadId && incomingMessage) {
              const incomingId = Number(incomingMessage.id);
              const incomingCreatedAt =
                typeof incomingMessage.createdAt === "string"
                  ? incomingMessage.createdAt
                  : new Date().toISOString();
              setLeadMessages((prev) => {
                if (!Number.isInteger(incomingId) || incomingId <= 0) return prev;
                if (prev.some((message) => message.id === incomingId)) return prev;
                return [
                  ...prev,
                  {
                    id: incomingId,
                    body: incomingBody,
                    direction: incomingDirection || "in",
                    createdAt: incomingCreatedAt
                  }
                ];
              });
              void loadLeadMessages(incomingLeadId, 1).catch((err) => {
                console.error("[WS] Failed to refresh lead history:", err);
              });
            }
          }
        } catch (err) {
          console.error("[WS] Message error:", err);
        }
      };

      ws.onclose = () => {
        console.log("[WS Pipeline] Disconnected, retrying...");
        wsReconnectRef.current = setTimeout(connect, 5000);
      };

      ws.onerror = () => ws.close();
      wsRef.current = ws;
    }

    if (user) {
      connect();
    }

    return () => {
      if (wsReconnectRef.current) clearTimeout(wsReconnectRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [user, loadCrm, loadFaqs, loadLeadMessages, addToast, loadWebhookEvents, webhookEventsStatusFilter]); // Removed 'leads' dependency

  useEffect(() => {
    if (!selectedLeadId) {
      setSelectedLead(null);
      setLeadDraft(null);
      setLeadDetailsLoading(false);
      setLeadMessages([]);
      setLeadMessagesPagination(null);
      setLeadMessagesPage(1);
      setLeadMessagesLoading(false);
      return;
    }
    loadLeadDetails(selectedLeadId).catch(() => setError("Falha ao carregar lead."));
    loadLeadMessages(selectedLeadId, 1).catch(() => setError("Falha ao carregar mensagens do lead."));
  }, [selectedLeadId, loadLeadDetails, loadLeadMessages]);

  useEffect(() => {
    if (!selectedLead) {
      setLeadDraft(null);
      return;
    }
    setLeadDraft(buildLeadProfileDraft(selectedLead));
  }, [selectedLead]);

  useEffect(() => {
    if (!selectedLeadId) {
      setLeadDetailsModalOpen(false);
    }
  }, [selectedLeadId]);

  useEffect(() => {
    if (!error) return;
    addToast(error, "error");
    const timer = window.setTimeout(() => setError(""), 4000);
    return () => window.clearTimeout(timer);
  }, [error, addToast]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
      setPassword("");
      await checkSession();
      addToast(`Bem-vindo, ${username}!`, "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao entrar.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setSubmitting(true);
    try {
      await apiFetch("/auth/logout", { method: "POST" });
      setUser(null);
      setLeads([]);
      setStages([]);
      setFaqs([]);
      setSelectedLeadId(null);
      setSelectedLead(null);
      setError("");
      addToast("Sessão encerrada.", "info");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao sair.");
    } finally {
      setSubmitting(false);
    }
  };

  const refreshAll = async () => {
    setRefreshing(true);
    addToast("Buscando atualizações...", "info");
    try {
      await Promise.all([loadCrm(), loadFaqs()]);
      if (selectedLeadId) {
        await Promise.all([
          loadLeadDetails(selectedLeadId),
          loadLeadMessages(selectedLeadId, leadMessagesPage)
        ]);
      }
      addToast("Dados atualizados!", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar dados.");
    } finally {
      setRefreshing(false);
    }
  };

  const failedWebhookEventsCount = useMemo(
    () => webhookEvents.filter((event) => event.status === "failed" || event.status === "dead").length,
    [webhookEvents]
  );
  const isDbDown = (systemReadiness?.db === "down") || (systemHealthDetails?.db === "down");

  const handleSelectPanel = useCallback((panel: AppPanel) => {
    setActivePanel(panel);
    setMobileNavOpen(false);
  }, []);

  const mobileNavItems: Array<{ panel: AppPanel; label: string; icon: LucideIcon }> = [
    { panel: "crm", label: "CRM", icon: LayoutGrid },
    { panel: "faqs", label: "FAQs", icon: Sparkles },
    { panel: "chat", label: "Chat", icon: MessageSquare },
    { panel: "analytics", label: "Analytics", icon: BarChart3 },
    { panel: "calendar", label: "Calendário", icon: CalendarDays },
    { panel: "logs", label: "Logs", icon: ScrollText },
    { panel: "offers", label: "Landings", icon: GraduationCap },
    { panel: "operation", label: "Operação", icon: ShieldAlert },
    { panel: "settings", label: "Configurações", icon: Settings }
  ];
  const handleCreateLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!leadName.trim() || !leadWaId.trim()) {
      setError("Nome e WhatsApp sao obrigatorios.");
      return;
    }

    setLeadSubmitting(true);
    try {
      const result = await apiFetch<{ lead: Lead }>("/crm/leads", {
        method: "POST",
        body: JSON.stringify({ name: leadName.trim(), waId: leadWaId.trim(), source: leadSource || null, notes: leadNotes || null })
      });
      setLeadName("");
      setLeadWaId("");
      setLeadSource("");
      setLeadNotes("");
      await loadCrm();
      setSelectedLeadId(result.lead.id);
      addToast("Lead criado com sucesso!", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar lead.");
    } finally {
      setLeadSubmitting(false);
    }
  };

  const isLeadUpdateNoop = (
    lead: Lead | null | undefined,
    path: string,
    body: unknown,
    method: "PATCH" | "PUT"
  ): boolean => {
    if (!lead || typeof body !== "object" || body === null) return false;
    const payload = body as Record<string, unknown>;

    if (path.endsWith("/stage") && typeof payload.stageId === "number") {
      return lead.stageId === payload.stageId;
    }

    if (path.endsWith("/bot") && typeof payload.enabled === "boolean") {
      return lead.botEnabled === payload.enabled;
    }

    if (path.endsWith("/handoff") && typeof payload.handoffNeeded === "boolean") {
      return lead.handoffNeeded === payload.handoffNeeded;
    }

    if (path.endsWith("/persona") && method === "PATCH" && "persona" in payload) {
      return normalizeNullableText(lead.customBotPersona) === normalizeNullableText(payload.persona);
    }

    if (method === "PUT" && path === `/crm/leads/${lead.id}`) {
      let compared = 0;
      let unchanged = 0;

      const compareText = (key: keyof Lead, payloadKey: string) => {
        if (!(payloadKey in payload)) return;
        compared += 1;
        if (normalizeNullableText(lead[key]) === normalizeNullableText(payload[payloadKey])) unchanged += 1;
      };

      compareText("name", "name");
      compareText("waId", "waId");
      compareText("source", "source");
      compareText("notes", "notes");
      compareText("interestedCourse", "interestedCourse");
      compareText("courseMode", "courseMode");
      compareText("availability", "availability");

      if ("leadStatus" in payload) {
        compared += 1;
        if (String(lead.leadStatus) === String(payload.leadStatus)) unchanged += 1;
      }

      if ("qualificationScore" in payload) {
        compared += 1;
        const current = lead.qualificationScore ?? null;
        const next = payload.qualificationScore === null ? null : Number(payload.qualificationScore);
        if (current === next) unchanged += 1;
      }

      if ("botEnabled" in payload && typeof payload.botEnabled === "boolean") {
        compared += 1;
        if (lead.botEnabled === payload.botEnabled) unchanged += 1;
      }

      if ("handoffNeeded" in payload && typeof payload.handoffNeeded === "boolean") {
        compared += 1;
        if (lead.handoffNeeded === payload.handoffNeeded) unchanged += 1;
      }

      if ("stageId" in payload && typeof payload.stageId === "number") {
        compared += 1;
        if (lead.stageId === payload.stageId) unchanged += 1;
      }

      return compared > 0 && compared === unchanged;
    }

    return false;
  };

  const updateLead = async (leadId: number, path: string, body: unknown, method: "PATCH" | "PUT" = "PATCH") => {
    const currentLead = selectedLead?.id === leadId
      ? selectedLead
      : leadsRef.current.find((lead) => lead.id === leadId);

    if (isLeadUpdateNoop(currentLead, path, body, method)) {
      return;
    }

    try {
      await apiFetch(path, { method, body: JSON.stringify(body) });
      await loadCrm();
      if (selectedLeadId === leadId) await loadLeadDetails(leadId);
      addToast("Lead atualizado!", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar lead.");
    }
  };

  const handleSaveLeadProfileDraft = async () => {
    if (!selectedLead || !leadDraft) return;

    const parsedScore = leadDraft.qualificationScore.trim() === ""
      ? null
      : Number(leadDraft.qualificationScore);

    const payload = {
      stageId: leadDraft.stageId,
      botEnabled: leadDraft.botEnabled,
      handoffNeeded: leadDraft.handoffNeeded,
      interestedCourse: leadDraft.interestedCourse,
      courseMode: leadDraft.courseMode,
      availability: leadDraft.availability,
      qualificationScore: Number.isFinite(parsedScore as number) ? Math.max(0, Math.min(100, Math.round(parsedScore as number))) : null,
      notes: leadDraft.notes,
      customBotPersona: leadDraft.customBotPersona
    };

    if (isLeadUpdateNoop(selectedLead, `/crm/leads/${selectedLead.id}`, payload, "PUT")) {
      addToast("Nenhuma alteração para salvar.", "info");
      return;
    }

    setSavingLeadDraft(true);
    try {
      await apiFetch(`/crm/leads/${selectedLead.id}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      await loadCrm();
      await loadLeadDetails(selectedLead.id);
      addToast("Lead atualizado uma única vez.", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar perfil do lead.");
    } finally {
      setSavingLeadDraft(false);
    }
  };

  const handleToggleBotEnabled = async (enabled: boolean) => {
    if (!selectedLead || !leadDraft) return;

    setLeadDraft((prev) => prev ? { ...prev, botEnabled: enabled } : prev);

    try {
      await apiFetch(`/crm/leads/${selectedLead.id}`, {
        method: "PUT",
        body: JSON.stringify({ botEnabled: enabled })
      });
      await loadCrm();
      await loadLeadDetails(selectedLead.id);
      addToast(enabled ? "Automação IA ativada!" : "Automação IA desativada.", "success");
    } catch (err) {
      setLeadDraft((prev) => prev ? { ...prev, botEnabled: !enabled } : prev);
      setError(err instanceof Error ? err.message : "Falha ao atualizar automação IA.");
    }
  };

  const handleToggleHandoffNeeded = async (needed: boolean) => {
    if (!selectedLead || !leadDraft) return;

    setLeadDraft((prev) => prev ? { ...prev, handoffNeeded: needed } : prev);

    try {
      await apiFetch(`/crm/leads/${selectedLead.id}`, {
        method: "PUT",
        body: JSON.stringify({ handoffNeeded: needed })
      });
      await loadCrm();
      await loadLeadDetails(selectedLead.id);
      addToast(needed ? "Handoff humano ativado!" : "Handoff humano desativado.", "success");
    } catch (err) {
      setLeadDraft((prev) => prev ? { ...prev, handoffNeeded: !needed } : prev);
      setError(err instanceof Error ? err.message : "Falha ao atualizar handoff humano.");
    }
  };

  const handleCreateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedLeadId) {
      setError("Selecione um lead para criar uma tarefa.");
      return;
    }
    if (!taskTitle.trim()) {
      setError("Digite um título para a tarefa.");
      return;
    }
    if (!taskDueAt) {
      setError("Selecione uma data para a tarefa.");
      return;
    }
    setTaskSubmitting(true);
    const toastId = addToast("Agendando tarefa...", "loading");
    try {
      await apiFetch(`/crm/leads/${selectedLeadId}/tasks`, {
        method: "POST",
        body: JSON.stringify({ title: taskTitle.trim(), description: taskDescription || null, dueAt: new Date(taskDueAt).toISOString(), priority: taskPriority })
      });
      setTaskTitle("");
      setTaskDescription("");
      setTaskDueAt("");
      setTaskPriority("medium");
      await loadCrm();
      await loadLeadDetails(selectedLeadId);
      updateToast(toastId, "Tarefa agendada com sucesso!", "success");
    } catch (err) {
      updateToast(toastId, err instanceof Error ? err.message : "Falha ao criar tarefa.", "error");
    } finally {
      setTaskSubmitting(false);
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    if (!selectedLeadId) return;
    try {
      await apiFetch(`/crm/tasks/${taskId}`, { method: "DELETE" });
      await loadCrm();
      await loadLeadDetails(selectedLeadId);
      addToast("Tarefa removida.", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao remover tarefa.");
    }
  };

  const handleDeleteLead = async (leadId: number) => {
    setDeletingLeadId(leadId);
    try {
      await apiFetch(`/crm/leads/${leadId}`, { method: "DELETE" });
      if (selectedLeadId === leadId) {
        setSelectedLeadId(null);
        setSelectedLead(null);
        setLeadMessages([]);
        setLeadMessagesPagination(null);
        setLeadMessagesPage(1);
      }
      await loadCrm();
      addToast("Lead removido com sucesso.", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir lead.");
    } finally {
      setDeletingLeadId(null);
    }
  };

  const handleChangeLeadMessagesPage = async (page: number) => {
    if (!selectedLeadId) return;
    try {
      await loadLeadMessages(selectedLeadId, page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao paginar mensagens.");
    }
  };

  const handleChangeLeadMessagesPageSize = async (pageSize: number) => {
    if (!selectedLeadId) return;
    setLeadMessagesPageSize(pageSize);
    setLeadMessagesPage(1);
    try {
      const result = await apiFetch<{ messages: ContactMessage[]; pagination: PaginationMeta }>(
        `/crm/leads/${selectedLeadId}/messages?page=1&limit=${pageSize}`
      );
      setLeadMessages(result.messages);
      setLeadMessagesPagination(result.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao alterar paginação.");
    }
  };

  const handleDropLeadOnStage = async (stageId: number) => {
    const leadId = draggedLeadId;
    setDragOverStageId(null);
    setDraggedLeadId(null);
    if (!leadId) return;

    const lead = leads.find((item) => item.id === leadId);
    if (!lead || lead.stageId === stageId) return;
    const previousStageId = lead.stageId ?? null;
    const nextStage = stages.find((stage) => stage.id === stageId) || null;
    const previousStage = previousStageId ? stages.find((stage) => stage.id === previousStageId) || null : null;

    setMovingLeadId(leadId);
    setLeads((currentLeads) =>
      currentLeads.map((item) =>
        item.id === leadId
          ? {
            ...item,
            stageId,
            stage: nextStage
          }
          : item
      )
    );
    setSelectedLead((currentLead) =>
      currentLead && currentLead.id === leadId
        ? {
          ...currentLead,
          stageId,
          stage: nextStage
        }
        : currentLead
    );
    try {
      await apiFetch(`/crm/leads/${leadId}/stage`, {
        method: "PATCH",
        body: JSON.stringify({ stageId })
      });
      if (selectedLeadId === leadId) {
        void loadLeadDetails(leadId);
      }
      addToast("Etapa do lead alterada.", "success");
    } catch (err) {
      setLeads((currentLeads) =>
        currentLeads.map((item) =>
          item.id === leadId
            ? {
              ...item,
              stageId: previousStageId,
              stage: previousStage
            }
            : item
        )
      );
      setSelectedLead((currentLead) =>
        currentLead && currentLead.id === leadId
          ? {
            ...currentLead,
            stageId: previousStageId,
            stage: previousStage
          }
          : currentLead
      );
      setError(err instanceof Error ? err.message : "Falha ao mover lead de etapa.");
    } finally {
      setMovingLeadId(null);
    }
  };

  const handleCreateStage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newStageName.trim()) return;
    setStageSubmitting(true);
    try {
      await apiFetch("/crm/stages", { method: "POST", body: JSON.stringify({ name: newStageName.trim(), color: newStageColor }) });
      setNewStageName("");
      setNewStageColor("#06b6d4");
      await loadCrm();
      addToast("Etapa criada com sucesso!", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar etapa.");
    } finally {
      setStageSubmitting(false);
    }
  };

  const handleSaveStageNameBlur = async (stageId: number, newName: string, originalName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === originalName) return;
    try {
      await apiFetch(`/crm/stages/${stageId}`, {
        method: "PUT",
        body: JSON.stringify({ name: trimmed })
      });
      await loadCrm();
      addToast("Etapa renomeada!", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao renomear etapa.");
    }
  };

  const moveStage = async (stageId: number, direction: "up" | "down") => {
    const idx = stages.findIndex((stage) => stage.id === stageId);
    if (idx < 0) return;
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= stages.length) return;

    const originalStages = [...stages];
    const reordered = [...stages];
    const [item] = reordered.splice(idx, 1);
    reordered.splice(target, 0, item);

    // Optimistic update
    setStages(reordered);

    try {
      await apiFetch("/crm/stages/reorder", {
        method: "PUT",
        body: JSON.stringify({ stageIds: reordered.map((s) => s.id) })
      });
      await loadCrm();
      addToast("Ordem do pipeline salva.", "success");
    } catch (err) {
      setStages(originalStages);
      setError(err instanceof Error ? err.message : "Falha ao reordenar etapas.");
    }
  };

  const handleDropStage = async (targetStageId: number) => {
    const sourceId = draggedStageId;
    setDraggedStageId(null);
    setDragOverStageOrder(null);
    if (!sourceId || sourceId === targetStageId) return;

    const sourceIdx = stages.findIndex(s => s.id === sourceId);
    const targetIdx = stages.findIndex(s => s.id === targetStageId);
    if (sourceIdx < 0 || targetIdx < 0) return;

    const originalStages = [...stages];
    const reordered = [...stages];
    const [item] = reordered.splice(sourceIdx, 1);
    reordered.splice(targetIdx, 0, item);

    // Optimistic update
    setStages(reordered);

    try {
      await apiFetch("/crm/stages/reorder", {
        method: "PUT",
        body: JSON.stringify({ stageIds: reordered.map(s => s.id) })
      });
      await loadCrm();
      addToast("Pipeline reordenado!", "success");
    } catch (err) {
      setStages(originalStages);
      setError(err instanceof Error ? err.message : "Falha ao reordenar.");
    }
  };

  const handleCreateFaq = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!faqQuestion.trim() || !faqAnswer.trim()) return;
    setFaqSubmitting(true);
    try {
      await apiFetch("/dashboard/faqs", { method: "POST", body: JSON.stringify({ question: faqQuestion.trim(), answer: faqAnswer.trim() }) });
      setFaqQuestion("");
      setFaqAnswer("");
      await loadFaqs();
      addToast("FAQ adicionado!", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao adicionar FAQ.");
    } finally {
      setFaqSubmitting(false);
    }
  };

  const startEditFaq = (faq: FaqItem) => {
    setEditingFaqId(faq.id);
    setEditingFaqQuestion(faq.question);
    setEditingFaqAnswer(faq.answer);
    setEditingFaqIsActive(faq.isActive);
  };

  const cancelEditFaq = () => {
    setEditingFaqId(null);
    setEditingFaqQuestion("");
    setEditingFaqAnswer("");
    setEditingFaqIsActive(true);
  };

  const handleSaveFaq = async () => {
    if (!editingFaqId) return;
    setFaqUpdatingId(editingFaqId);
    try {
      await apiFetch(`/dashboard/faqs/${editingFaqId}`, {
        method: "PUT",
        body: JSON.stringify({ question: editingFaqQuestion.trim(), answer: editingFaqAnswer.trim(), isActive: editingFaqIsActive })
      });
      cancelEditFaq();
      await loadFaqs();
      addToast("FAQ salvo!", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar FAQ.");
    } finally {
      setFaqUpdatingId(null);
    }
  };

  const handleDeleteFaq = async (faqId: number) => {
    setFaqDeletingId(faqId);
    try {
      await apiFetch(`/dashboard/faqs/${faqId}`, { method: "DELETE" });
      if (editingFaqId === faqId) cancelEditFaq();
      await loadFaqs();
      addToast("FAQ removido.", "info");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao remover FAQ.");
    } finally {
      setFaqDeletingId(null);
    }
  };

  const filteredLeads = useMemo(() => {
    const term = search.trim().toLowerCase();
    return leads.filter((lead) => {
      const matchesSearch = !term || lead.waId.toLowerCase().includes(term) || (lead.name || "").toLowerCase().includes(term) || (lead.notes || "").toLowerCase().includes(term);
      const matchesStatus = statusFilter === "all" || lead.leadStatus === statusFilter;
      const matchesStage = stageFilter === "all" || String(lead.stageId || "") === stageFilter;
      return matchesSearch && matchesStatus && matchesStage;
    });
  }, [leads, search, statusFilter, stageFilter]);

  const leadsByStage = useMemo(() => {
    const map = new Map<number, Lead[]>();
    stages.forEach((stage) => map.set(stage.id, []));
    filteredLeads.forEach((lead) => {
      if (lead.stageId && map.has(lead.stageId)) map.get(lead.stageId)?.push(lead);
    });
    return map;
  }, [filteredLeads, stages]);

  useEffect(() => {
    setKanbanStagePage((current) => {
      const next: Record<number, number> = {};
      let changed = false;

      stages.forEach((stage) => {
        const total = (leadsByStage.get(stage.id) || []).length;
        const totalPages = Math.max(1, Math.ceil(total / kanbanPageSize));
        const currentPage = current[stage.id] ?? 1;
        const clamped = Math.min(totalPages, Math.max(1, currentPage));
        next[stage.id] = clamped;
        if (current[stage.id] !== clamped) changed = true;
      });

      if (Object.keys(current).length !== Object.keys(next).length) changed = true;
      return changed ? next : current;
    });
  }, [stages, leadsByStage, kanbanPageSize]);

  const handleKanbanStagePageChange = (stageId: number, page: number) => {
    setKanbanStagePage((current) => ({ ...current, [stageId]: Math.max(1, page) }));
  };

  const selectedLeadSignals = selectedLead ? getQualificationSignals(selectedLead, leadDraft) : [];
  const selectedLeadCompletion = selectedLead ? getQualificationCompletion(selectedLeadSignals) : 0;
  const selectedLeadScore = selectedLead
    ? parseQualificationScore(leadDraft?.qualificationScore ?? selectedLead.qualificationScore)
    : null;
  const selectedLeadStage =
    selectedLead
      ? stages.find((stage) => stage.id === (leadDraft?.stageId ?? selectedLead.stageId)) || selectedLead.stage || null
      : null;
  const immersiveOffersMode = activePanel === "offers" && offersWorkspaceOpen;

  const handleConfirmAction = async () => {
    if (!confirmDialog) return;
    if (confirmDialog.action.type === "delete-faq") {
      await handleDeleteFaq(confirmDialog.action.faqId);
      setConfirmDialog(null);
      return;
    }
    if (confirmDialog.action.type === "delete-lead") {
      await handleDeleteLead(confirmDialog.action.leadId);
      setConfirmDialog(null);
    }
  };
  if (loading) return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-slate-100">
      <div className="flex flex-col items-center gap-6 scale-enter">
        <div className="relative">
          <div className="h-16 w-16 rounded-2xl bg-cyan-500/10 flex items-center justify-center float-animation">
            <svg className="w-8 h-8 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <div className="absolute inset-0 rounded-2xl pulse-glow"></div>
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="text-lg font-bold tracking-tight bg-linear-to-r from-white to-slate-400 bg-clip-text text-transparent">CRM WhatsApp</span>
          <div className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4 text-cyan-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            <span className="text-xs text-slate-500 font-medium uppercase tracking-widest">Carregando sessão...</span>
          </div>
        </div>
      </div>
    </main>
  );

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <form className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 scale-enter" onSubmit={handleLogin}>
          <h1 className="text-2xl font-semibold text-slate-100">CRM WhatsApp</h1>
          <p className="mt-2 text-sm text-slate-400">Faça login para acessar o dashboard.</p>
          <div className="mt-6 space-y-3">
            <input className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Usuário" required />
            <div className="relative">
              <input className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 pr-10 text-slate-100" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha" required />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                )}
              </button>
            </div>
            {error ? <p className="rounded border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
            <button className="w-full rounded-lg bg-cyan-500 px-4 py-2 font-medium text-slate-950 disabled:opacity-60" type="submit" disabled={submitting}>{submitting ? "Entrando..." : "Entrar"}</button>
          </div>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#020617] text-slate-100 selection:bg-cyan-500/30">
      {!immersiveOffersMode ? (
        <SidebarNavigation
          activePanel={activePanel}
          onSelectPanel={handleSelectPanel}
          onLogout={handleLogout}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          logoutSubmitting={submitting}
          failedEventsCount={failedWebhookEventsCount}
        />
      ) : null}

      <section
        className={`min-h-screen overflow-x-clip transition-[padding-left] duration-300 ${
          immersiveOffersMode ? "pl-0" : sidebarCollapsed ? "md:pl-20" : "md:pl-64"
        }`}
      >
        <div className={`min-w-0 ${immersiveOffersMode ? "px-0 py-0" : "space-y-6 px-3 py-4 md:px-4 md:py-4"}`}>
          {!immersiveOffersMode ? (
            <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/95 px-4 py-3 backdrop-blur md:static md:bg-slate-900/50 md:backdrop-blur-0">
            <div className="flex items-center gap-3">
              <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-slate-200 md:hidden"
                    aria-label="Abrir menu de navegação"
                  >
                    <Menu className="h-5 w-5" />
                  </button>
                </SheetTrigger>
                <SheetContent className="flex h-full flex-col">
                  <SheetHeader className="border-b border-slate-800">
                    <SheetTitle>Menu</SheetTitle>
                  </SheetHeader>
                  <nav className="flex-1 space-y-1 overflow-y-auto p-3">
                    {mobileNavItems.map(({ panel, label, icon: Icon }) => (
                      <button
                        key={panel}
                        type="button"
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm ${activePanel === panel ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300" : "border-transparent text-slate-300 hover:border-slate-700 hover:bg-slate-900"}`}
                        onClick={() => handleSelectPanel(panel)}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{label}</span>
                        </span>
                        {panel === "operation" && failedWebhookEventsCount > 0 ? (
                          <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                            {failedWebhookEventsCount}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </nav>
                  <div className="border-t border-slate-800 p-3">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-xl border border-slate-700 px-3 py-2.5 text-left text-sm text-rose-300 hover:border-rose-500/40 hover:bg-rose-500/10"
                      onClick={handleLogout}
                      disabled={submitting}
                    >
                      <span>Sair</span>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                    </button>
                  </div>
                </SheetContent>
              </Sheet>

              <div>
                <h1 className="text-xl font-bold tracking-tight bg-linear-to-r from-white to-slate-400 bg-clip-text text-transparent md:text-2xl">CRM WhatsApp</h1>
                {activePanel === "crm" ? (
                  <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500 uppercase tracking-widest">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Sessão: <span className="text-slate-300">{user.username}</span>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
              <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${isDbDown ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>
                DB {isDbDown ? "down" : "up"}
              </span>
              <button className="flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-2 text-xs font-bold uppercase tracking-wider text-cyan-400 hover:bg-cyan-500/10 transition-all disabled:opacity-50" onClick={() => void refreshAll()} type="button" disabled={refreshing}>
                <svg className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {refreshing ? "Atualizando..." : "Atualizar"}
              </button>
            </div>
            </header>
          ) : null}

        {activePanel === "crm" ? (
          <section key="crm" className="space-y-8 panel-enter">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="fade-in-up stagger-1"><StatCard label="Leads abertos" value={metrics?.overall.open ?? 0} /></div>
              <div className="fade-in-up stagger-2"><StatCard label="Ganhos" value={metrics?.overall.won ?? 0} /></div>
              <div className="fade-in-up stagger-3"><StatCard label="Perdidos" value={metrics?.overall.lost ?? 0} /></div>
              <div className="fade-in-up stagger-4"><StatCard label="Fechados" value={metrics?.overall.totalClosed ?? 0} /></div>
              <div className="fade-in-up stagger-5"><StatCard label="Taxa de conversão" value={`${metrics?.overall.conversionRate ?? 0}%`} highlight /></div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              {/* Coluna Novo Lead */}
              <form className="group flex flex-col rounded-2xl border border-slate-800 bg-slate-900/50 p-6 transition-all hover:border-slate-700/80 shadow-sm" onSubmit={handleCreateLead}>
                <div className="flex items-center gap-2 border-b border-slate-800 pb-4 mb-5">
                  <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-500">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <h2 className="text-sm font-bold uppercase tracking-widest text-slate-300">Novo Lead</h2>
                </div>
                <div className="space-y-3">
                  <input className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all" value={leadName} onChange={(e) => setLeadName(e.target.value)} placeholder="Nome completo" required />
                  <input className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all" value={leadWaId} onChange={(e) => setLeadWaId(e.target.value)} placeholder="WhatsApp (DDI + DDD + Número)" required />
                  <input className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all" value={leadSource} onChange={(e) => setLeadSource(e.target.value)} placeholder="Origem (ex: Facebook, Orgânico)" />
                  <textarea className="w-full min-h-[100px] rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all resize-none" value={leadNotes} onChange={(e) => setLeadNotes(e.target.value)} placeholder="Observações adicionais..." />
                  <button type="submit" disabled={leadSubmitting} className="w-full mt-2 flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3.5 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/20 hover:bg-cyan-400 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-60 disabled:pointer-events-none uppercase tracking-widest leading-none">
                    {leadSubmitting ? (
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    ) : "Criar lead"}
                  </button>
                </div>
              </form>

              {/* Coluna Filtros */}
              <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/50 p-6 transition-all hover:border-slate-700/80 shadow-sm">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-4 mb-5">
                  <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-500">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                  </div>
                  <h2 className="text-sm font-bold uppercase tracking-widest text-slate-300">Filtros</h2>
                </div>
                <div className="space-y-4">
                  <div className="group relative">
                    <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-cyan-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-11 pr-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar leads..." />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Status</label>
                    <select className="w-full appearance-none rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                      <option value="all">Todos status</option>
                      <option value="open">Abertos</option>
                      <option value="won">Ganhos</option>
                      <option value="lost">Perdidos</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Etapa do Funil</label>
                    <select className="w-full appearance-none rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
                      <option value="all">Todas etapas</option>
                      {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Curso</label>
                      <input
                        className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50 transition-all"
                        value={courseFilter}
                        onChange={(e) => setCourseFilter(e.target.value)}
                        placeholder="Ex: Python"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Modalidade</label>
                      <input
                        className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50 transition-all"
                        value={modalityFilter}
                        onChange={(e) => setModalityFilter(e.target.value)}
                        placeholder="Ex: Online"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Score mín</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50 transition-all"
                        value={scoreMinFilter}
                        onChange={(e) => setScoreMinFilter(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Score máx</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50 transition-all"
                        value={scoreMaxFilter}
                        onChange={(e) => setScoreMaxFilter(e.target.value)}
                        placeholder="100"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Handoff</label>
                      <select
                        className="w-full appearance-none rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs text-slate-100 outline-none focus:border-cyan-500/50 transition-all"
                        value={handoffFilter}
                        onChange={(e) => setHandoffFilter(e.target.value as "all" | "true" | "false")}
                      >
                        <option value="all">Todos</option>
                        <option value="true">Somente com handoff</option>
                        <option value="false">Somente sem handoff</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-cyan-300 transition hover:bg-cyan-500/20"
                      onClick={() => void loadCrm()}
                    >
                      Aplicar Avançados
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-300 transition hover:bg-slate-800"
                      onClick={() => {
                        setCourseFilter("");
                        setModalityFilter("");
                        setScoreMinFilter("");
                        setScoreMaxFilter("");
                        setHandoffFilter("all");
                        void (async () => {
                          const [stagesRes, leadsRes, metricsRes] = await Promise.all([
                            apiFetch<{ stages: PipelineStage[] }>("/crm/stages"),
                            apiFetch<{ leads: Lead[] }>("/crm/leads?limit=200"),
                            apiFetch<ConversionMetrics>("/crm/metrics/conversion")
                          ]);
                          const sortedStages = stagesRes.stages.slice().sort((a, b) => a.position - b.position);
                          setStages(sortedStages);
                          setLeads(leadsRes.leads);
                          setMetrics(metricsRes);
                        })().catch((err) => setError(err instanceof Error ? err.message : "Falha ao limpar filtros avançados."));
                      }}
                    >
                      Limpar Avançados
                    </button>
                  </div>
                </div>
              </div>

              {/* Coluna Pipeline */}
              <form className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/50 p-6 transition-all hover:border-slate-700/80 shadow-sm" onSubmit={handleCreateStage}>
                <div className="flex items-center gap-2 border-b border-slate-800 pb-4 mb-5">
                  <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-500">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </div>
                  <h2 className="text-sm font-bold uppercase tracking-widest text-slate-300">Pipeline</h2>
                </div>
                <div className="space-y-3">
                  <input className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all" value={newStageName} onChange={(e) => setNewStageName(e.target.value)} placeholder="Nova etapa do funil" required />
                  <div className="flex items-center gap-3">
                    <div className="flex-1 space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Cor</label>
                      <div className="relative h-[46px]">
                        <input className="absolute inset-0 h-full w-full rounded-xl border border-slate-800 bg-slate-950 cursor-pointer overflow-hidden opacity-0" type="color" value={newStageColor} onChange={(e) => setNewStageColor(e.target.value)} />
                        <div className="pointer-events-none flex h-full w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-4">
                          <span className="text-xs font-mono text-slate-300">{newStageColor.toUpperCase()}</span>
                          <div className="h-5 w-5 rounded-full ring-2 ring-slate-800" style={{ backgroundColor: newStageColor }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <button type="submit" disabled={stageSubmitting} className="w-full mt-2 rounded-xl bg-cyan-500 px-4 py-3.5 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/20 hover:bg-cyan-400 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-60 uppercase tracking-widest leading-none">
                    {stageSubmitting ? "Criando..." : "Criar etapa"}
                  </button>
                </div>

                {/* Lista de Etapas (Drag and Drop) */}
                <div className="supabase-scroll mt-8 max-h-[250px] space-y-2 overflow-y-auto pr-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block sticky top-0 bg-[#161d2b] py-1 rounded-2xl p-4">Organizar Etapas</label>
                  {stages.map((s) => (
                    <div
                      key={s.id}
                      draggable
                      onDragStart={() => setDraggedStageId(s.id)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragOverStageOrder !== s.id) setDragOverStageOrder(s.id);
                      }}
                      onDragLeave={() => {
                        if (dragOverStageOrder === s.id) setDragOverStageOrder(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        void handleDropStage(s.id);
                      }}
                      className={`flex items-center gap-3 rounded-xl border p-3 transition-all group cursor-move ${dragOverStageOrder === s.id
                        ? "border-cyan-500 bg-cyan-500/10 scale-[1.02] z-10"
                        : "border-slate-800/50 bg-slate-950/50 hover:border-slate-700"
                        } ${draggedStageId === s.id ? "opacity-30" : "opacity-100"}`}
                    >
                      <div className="text-slate-600 group-hover:text-cyan-500 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                      </div>
                      <div className="p-1.5 rounded-lg bg-cyan-500/5">
                        <svg className="w-4 h-4 text-cyan-500/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      </div>
                      <input
                        key={`stage-name-${s.id}-${s.name}`}
                        className="flex-1 min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-semibold text-slate-100 outline-none focus:border-cyan-500/30 focus:bg-slate-950 transition-colors"
                        defaultValue={s.name}
                        onBlur={(e) => void handleSaveStageNameBlur(s.id, e.target.value, s.name)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                      />
                      <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button type="button" onClick={(e) => { e.stopPropagation(); void moveStage(s.id, "up"); }} className="text-slate-600 hover:text-cyan-400 p-0.5 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                        </button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); void moveStage(s.id, "down"); }} className="text-slate-600 hover:text-cyan-400 p-0.5 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </form>
            </div>

            <div className="supabase-scroll overflow-x-auto rounded-3xl border border-slate-800 bg-[#0f172a]/80 p-6 shadow-2xl backdrop-blur-sm">
              <div className="mb-6 flex flex-col gap-4 border-b border-slate-800 pb-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-cyan-500 shadow-lg shadow-cyan-500/30 text-slate-950">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white tracking-tight">Pipeline de Vendas</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Gestão visual e arraste de leads em tempo real</p>
                  </div>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 sm:gap-3 lg:w-auto lg:justify-end">
                  {/* Search */}
                  <div className="relative w-full sm:w-auto">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar lead..."
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-10 pr-4 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-500/50 transition-all sm:w-52"
                    />
                  </div>
                  {/* Status Filter */}
                  <div className="flex flex-wrap items-center gap-1">
                    {[
                      { value: "all", label: "Todos", color: "text-slate-400 bg-slate-800/60 border-slate-700" },
                      { value: "open", label: "Abertos", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" },
                      { value: "won", label: "Ganhos", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
                      { value: "lost", label: "Perdidos", color: "text-rose-400 bg-rose-500/10 border-rose-500/30" }
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setStatusFilter(opt.value)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-all ${statusFilter === opt.value
                          ? opt.color + " ring-1 ring-current"
                          : "text-slate-500 bg-transparent border-transparent hover:bg-slate-800/50"
                          }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <span className="hidden text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none sm:inline">Visibilidade</span>
                  <select
                    className="w-full cursor-pointer appearance-none rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-xs font-bold text-slate-400 outline-none transition-all hover:bg-slate-900 focus:border-cyan-500/50 sm:w-auto"
                    value={kanbanPageSize}
                    onChange={(e) => setKanbanPageSize(Number(e.target.value))}
                  >
                    {[3, 5, 10, 20].map(v => <option key={v} value={v}>{v} leads por fase</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-3 flex min-w-max gap-3">
                {stages.map((stage) => (
                  <article
                    key={stage.id}
                    className={`w-72 rounded-lg border p-3 ${dragOverStageId === stage.id ? "border-cyan-500 bg-cyan-900/10" : "border-slate-800 bg-slate-900"} flex flex-col`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragOverStageId !== stage.id) setDragOverStageId(stage.id);
                    }}
                    onDragLeave={() => {
                      if (dragOverStageId === stage.id) setDragOverStageId(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedStageId) {
                        void handleDropStage(stage.id);
                      } else {
                        void handleDropLeadOnStage(stage.id);
                      }
                    }}
                  >
                    <div className="group/stage-header mb-3 flex items-center justify-between gap-2 p-1">
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        {/* Drag Handle (Hamburger) */}
                        <div
                          draggable
                          onDragStart={() => setDraggedStageId(stage.id)}
                          onDragEnd={() => setDraggedStageId(null)}
                          className="cursor-grab active:cursor-grabbing p-1 text-slate-600 hover:text-cyan-400 transition-colors"
                          title="Arraste para mover etapa"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                          </svg>
                        </div>
                        <input
                          key={`kanban-stage-${stage.id}-${stage.name}`}
                          className="flex-1 min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-black outline-none focus:border-cyan-500/50 focus:bg-slate-950 transition-all uppercase tracking-tight"
                          style={{ color: stage.color }}
                          defaultValue={stage.name}
                          onBlur={(e) => void handleSaveStageNameBlur(stage.id, e.target.value, stage.name)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover/stage-header:opacity-100 transition-opacity">
                        <button onClick={() => void moveStage(stage.id, "up")} disabled={stages.indexOf(stage) === 0} className="p-1 text-slate-600 hover:text-cyan-500 disabled:opacity-20 transition-colors" title="Subir etapa">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                        </button>
                        <button onClick={() => void moveStage(stage.id, "down")} disabled={stages.indexOf(stage) === stages.length - 1} className="p-1 text-slate-600 hover:text-cyan-500 disabled:opacity-20 transition-colors" title="Descer etapa">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>
                        <span className="ml-1 text-[10px] font-bold text-slate-500 bg-slate-800/50 px-1.5 py-0.5 rounded-full">{(leadsByStage.get(stage.id) || []).length}</span>
                      </div>
                    </div>
                    <div
                      className="flex-1 space-y-2"
                      style={{
                        minHeight: (() => {
                          const totalInStage = (leadsByStage.get(stage.id) || []).length;
                          const visibleCards = Math.min(kanbanPageSize, totalInStage);
                          if (visibleCards <= 0) return "0rem";
                          const cardHeightRem = 5.5;
                          const cardGapRem = 0.5;
                          return `${visibleCards * cardHeightRem + Math.max(0, visibleCards - 1) * cardGapRem}rem`;
                        })()
                      }}
                    >
                      {(leadsByStage.get(stage.id) || [])
                        .slice(
                          ((kanbanStagePage[stage.id] ?? 1) - 1) * kanbanPageSize,
                          (kanbanStagePage[stage.id] ?? 1) * kanbanPageSize
                        )
                        .map((lead) => {
                          const qualificationSignals = getQualificationSignals(lead);
                          const qualificationCompletion = getQualificationCompletion(qualificationSignals);
                          const qualificationScore = parseQualificationScore(lead.qualificationScore);
                          const primarySignal =
                            lead.interestedCourse
                            || lead.objective
                            || lead.level
                            || "Triagem pendente";

                          return (
                            <button
                              key={lead.id}
                              type="button"
                              draggable
                              onDragStart={() => setDraggedLeadId(lead.id)}
                              onDragEnd={() => {
                                setDraggedLeadId(null);
                                setDragOverStageId(null);
                              }}
                              onClick={() => setSelectedLeadId(lead.id)}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setContextMenu({ x: e.pageX, y: e.pageY, lead });
                              }}
                              className={`lead-sheen group relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-300 hover:-translate-y-1 active:scale-[0.99] ${selectedLeadId === lead.id
                                ? "border-cyan-400/30 bg-[linear-gradient(180deg,rgba(8,47,73,0.78),rgba(15,23,42,0.95))] shadow-xl shadow-cyan-500/10"
                                : "border-slate-800 bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(2,6,23,0.92))] hover:border-slate-700"
                                } ${movingLeadId === lead.id ? "cursor-wait opacity-60" : "cursor-grab"}`}
                            >
                              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                              <div className="relative flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="line-clamp-1 font-bold text-slate-100">
                                    {lead.name || "Sem nome"}
                                  </p>
                                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                                    <svg className="h-3 w-3 text-emerald-500" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 .018 5.393 0 12.028c0 2.119.554 4.187 1.61 6.006L0 24l6.117-1.605a11.803 11.803 0 005.925 1.586h.005c6.632 0 12.028-5.396 12.033-12.03a11.751 11.751 0 00-3.489-8.452z" />
                                    </svg>
                                    <span className="truncate">{lead.waId}</span>
                                  </div>
                                </div>

                                <div className="flex shrink-0 items-center gap-2">
                                  <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${qualificationScore == null
                                    ? "border-slate-700 bg-slate-900 text-slate-400"
                                    : qualificationScore >= 75
                                      ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
                                      : qualificationScore >= 45
                                        ? "border-amber-400/20 bg-amber-500/10 text-amber-200"
                                        : "border-rose-400/20 bg-rose-500/10 text-rose-200"
                                    }`}>
                                    {qualificationScore == null ? "sem score" : `${qualificationScore}`}
                                  </span>
                                  <div className={`rounded-full p-1.5 ${lead.botEnabled ? "bg-cyan-500/20 text-cyan-400" : "bg-slate-800 text-slate-500"}`}>
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                  </div>
                                </div>
                              </div>

                              <div className="relative mt-3 space-y-3">
                                <div className="rounded-xl border border-slate-800/80 bg-slate-950/55 p-3">
                                  <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                    <span>Cobertura</span>
                                    <span>{qualificationCompletion}%</span>
                                  </div>
                                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                                    <div
                                      className={`h-full rounded-full transition-all duration-500 ${lead.handoffNeeded
                                        ? "bg-amber-400"
                                        : qualificationCompletion >= 80
                                          ? "bg-emerald-400"
                                          : qualificationCompletion >= 50
                                            ? "bg-cyan-400"
                                            : "bg-slate-600"
                                        }`}
                                      style={{ width: `${Math.max(8, qualificationCompletion)}%` }}
                                    />
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    <span className="rounded-full bg-slate-900 px-2 py-1 text-[10px] font-medium text-slate-300">
                                      {primarySignal}
                                    </span>
                                    {lead.courseMode ? (
                                      <span className="rounded-full bg-slate-900 px-2 py-1 text-[10px] font-medium text-slate-300">
                                        {lead.courseMode}
                                      </span>
                                    ) : null}
                                    {lead.handoffNeeded ? (
                                      <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-200">
                                        handoff
                                      </span>
                                    ) : null}
                                  </div>
                                </div>

                                {lead.latestMessage ? (
                                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-3 text-[11px] italic leading-5 text-slate-400">
                                    "{lead.latestMessage.body}"
                                  </div>
                                ) : null}
                              </div>

                              {movingLeadId === lead.id ? (
                                <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-950/45 backdrop-blur-[2px]">
                                  <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 shadow-xl">
                                    <svg className="h-3 w-3 animate-spin text-cyan-500" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    <span className="text-[10px] font-bold uppercase text-cyan-500">Movendo...</span>
                                  </div>
                                </div>
                              ) : null}
                            </button>
                          );
                        })}
                    </div>
                    {(() => {
                      const totalInStage = (leadsByStage.get(stage.id) || []).length;
                      if (totalInStage <= kanbanPageSize) return null;
                      const currentPage = kanbanStagePage[stage.id] ?? 1;
                      const totalPages = Math.max(1, Math.ceil(totalInStage / kanbanPageSize));
                      return (
                        <div className="mt-2 flex items-center justify-between border-t border-slate-800 pt-2 text-[11px] text-slate-400">
                          <span>
                            Página {currentPage}/{totalPages}
                          </span>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className="rounded border border-slate-700 px-2 py-1 disabled:opacity-50"
                              disabled={currentPage <= 1}
                              onClick={() => handleKanbanStagePageChange(stage.id, currentPage - 1)}
                            >
                              Anterior
                            </button>
                            <button
                              type="button"
                              className="rounded border border-slate-700 px-2 py-1 disabled:opacity-50"
                              disabled={currentPage >= totalPages}
                              onClick={() => handleKanbanStagePageChange(stage.id, currentPage + 1)}
                            >
                              Próxima
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </article>
                ))}
              </div>
            </div>

            <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-[#0f172a]/80 shadow-2xl backdrop-blur-sm">
              <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/50 p-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-500">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-sm font-bold uppercase tracking-widest text-slate-100">Painel do Lead</h2>
                    <p className="text-[10px] text-slate-500 mt-0.5">Gestão completa de histórico e tarefas</p>
                  </div>
                </div>
                {selectedLead && (
                  <button
                    onClick={() => setSelectedLeadId(null)}
                    className="p-2 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {selectedLead ? (
                <div className="relative flex h-[calc(100vh-180px)] min-h-0 flex-col panel-enter">
                  {leadDetailsLoading && selectedLeadId ? (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/70 backdrop-blur-[1px] transition-opacity duration-200">
                      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/80 px-5 py-4 text-slate-300 shadow-lg">
                        <div className="relative">
                          <div className="h-10 w-10 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin" />
                          <div className="absolute inset-1 rounded-full bg-cyan-500/10 animate-pulse" />
                        </div>
                        <p className="text-xs font-semibold animate-pulse">Atualizando detalhes do lead...</p>
                      </div>
                    </div>
                  ) : null}

                  <Dialog open={leadDetailsModalOpen} onOpenChange={setLeadDetailsModalOpen}>
                    <DialogContent className="flex h-[min(94vh,1080px)] max-h-[94vh] w-[min(96vw,1320px)] max-w-[1320px] flex-col overflow-hidden border-slate-800/90 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))] p-0">
                      <DialogHeader className="shrink-0 border-b border-slate-800/90 bg-slate-950/70 px-5 py-5 sm:px-6">
                        <DialogTitle className="text-xl font-black tracking-tight text-white">
                          Informacoes do lead
                        </DialogTitle>
                        <DialogDescription>
                          Triagem, sinais, notas internas e configuracoes do bot para {selectedLead.name || selectedLead.waId}.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="supabase-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
                        <LeadQualificationPanel
                          lead={selectedLead}
                          draft={leadDraft}
                          stages={stages}
                          saving={savingLeadDraft}
                          deleting={deletingLeadId === selectedLead.id}
                          onStageChange={(stageId) => {
                            setLeadDraft((prev) => (prev ? { ...prev, stageId } : prev));
                          }}
                          onInterestedCourseChange={(value) => {
                            setLeadDraft((prev) => (prev ? { ...prev, interestedCourse: value } : prev));
                          }}
                          onCourseModeChange={(value) => {
                            setLeadDraft((prev) => (prev ? { ...prev, courseMode: value } : prev));
                          }}
                          onAvailabilityChange={(value) => {
                            setLeadDraft((prev) => (prev ? { ...prev, availability: value } : prev));
                          }}
                          onQualificationScoreChange={(value) => {
                            setLeadDraft((prev) => (prev ? { ...prev, qualificationScore: value } : prev));
                          }}
                          onNotesChange={(value) => {
                            setLeadDraft((prev) => (prev ? { ...prev, notes: value } : prev));
                          }}
                          onCustomBotPersonaChange={(value) => {
                            setLeadDraft((prev) => (prev ? { ...prev, customBotPersona: value } : prev));
                          }}
                          onToggleBotEnabled={(enabled) => {
                            void handleToggleBotEnabled(enabled);
                          }}
                          onToggleHandoffNeeded={(enabled) => {
                            void handleToggleHandoffNeeded(enabled);
                          }}
                          onSave={() => {
                            void handleSaveLeadProfileDraft();
                          }}
                          onDelete={() =>
                            setConfirmDialog({
                              title: "Excluir permanentemente?",
                              description: "Isso removera todo o historico de mensagens e tarefas vinculadas a este lead.",
                              confirmText: "Sim, excluir lead",
                              tone: "danger",
                              action: { type: "delete-lead", leadId: selectedLead.id, leadName: selectedLead.name, waId: selectedLead.waId }
                            })
                          }
                        />
                      </div>
                    </DialogContent>
                  </Dialog>

                  <div className="border-b border-slate-800 px-4 pb-4 pt-4 sm:px-5 sm:pt-5 lg:px-6 lg:pt-6">
                    <div className="lead-sheen relative overflow-hidden rounded-[28px] border border-slate-800/90 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.14),_transparent_28%),linear-gradient(180deg,_rgba(15,23,42,0.95),_rgba(2,6,23,0.96))] p-4 shadow-2xl shadow-black/20 animate-in fade-in slide-in-from-top-2 duration-500 sm:p-5">
                      <div className="lead-aurora absolute -left-12 top-6 h-24 w-24 rounded-full bg-cyan-400/10 blur-3xl" />
                      <div className="lead-aurora absolute -right-12 bottom-0 h-28 w-28 rounded-full bg-emerald-400/10 blur-3xl [animation-delay:-1.4s]" />

                      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-3">
                            <div className="flex size-12 shrink-0 items-center justify-center rounded-[18px] border border-cyan-400/20 bg-[linear-gradient(135deg,rgba(34,211,238,0.24),rgba(14,165,233,0.1),rgba(16,185,129,0.18))] shadow-lg shadow-cyan-500/10">
                              <span className="text-lg font-black text-white">
                                {selectedLead.name?.[0]?.toUpperCase() || "L"}
                              </span>
                            </div>

                            <div className="min-w-0">
                              <p className="text-[10px] font-bold uppercase tracking-[0.34em] text-cyan-300/75">
                                Painel recolhido
                              </p>
                              <h3 className="mt-1 text-lg font-black tracking-tight text-white">
                                Informacoes do lead em modal
                              </h3>
                            </div>
                          </div>

                          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                            Abra o cockpit completo so quando precisar editar a triagem, sem comprimir o historico e a fila de tarefas.
                          </p>

                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-950/80 px-3 py-1">
                              <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
                              {selectedLeadCompletion}% cobertura
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-950/80 px-3 py-1">
                              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                              {selectedLeadScore == null ? "Sem score" : `Score ${selectedLeadScore}`}
                            </span>
                            <span className="inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-950/80 px-3 py-1">
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: selectedLeadStage?.color || "#22d3ee" }}
                              />
                              {selectedLeadStage?.name || "Sem etapa"}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setLeadDetailsModalOpen(true)}
                          className="group inline-flex w-full items-center justify-center gap-3 rounded-[22px] border border-cyan-400/20 bg-[linear-gradient(135deg,rgba(6,182,212,0.22),rgba(14,165,233,0.08),rgba(15,23,42,0.95))] px-5 py-3 text-left text-sm font-semibold text-cyan-50 shadow-lg shadow-cyan-500/10 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-300/35 hover:shadow-cyan-500/25 sm:w-auto"
                        >
                          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/10">
                            <Sparkles className="h-4 w-4 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12" />
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col leading-tight">
                            <span className="truncate">Abrir informacoes do lead</span>
                            <span className="mt-1 text-[11px] font-medium text-cyan-100/70">
                              Modal de triagem, notas e ajustes do bot
                            </span>
                          </span>
                          <svg
                            className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17L17 7M17 7H9m8 0v8" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-4 pt-4 sm:gap-4 sm:px-5 md:gap-6 lg:px-6 xl:gap-8">
                    <button className="border-b-2 border-cyan-500 pb-4 text-sm font-bold uppercase tracking-widest text-cyan-500">Historico</button>
                    <button
                      onClick={() => { setActiveChatWaId(selectedLead.waId); setActivePanel("chat"); }}
                      className="flex items-center gap-2 border-b-2 border-transparent pb-4 text-sm font-bold uppercase tracking-widest text-emerald-400 transition-colors hover:border-emerald-400 hover:text-emerald-300"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.102C3.512 15.046 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      Conversar
                    </button>
                    <button className="pb-4 text-sm font-bold uppercase tracking-widest text-slate-500 transition-colors hover:text-slate-300">Tarefas</button>
                  </div>

                  <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(260px,300px)] lg:grid-cols-[minmax(0,1fr)_minmax(280px,320px)] xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] 2xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
                    {/* Chat History */}
                    <div className="flex h-full min-h-0 min-w-0 flex-col border-r border-slate-800">
                        <div className="supabase-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
                          {leadMessages.length > 0 ? (
                            leadMessages.map((m) => (
                              <div
                                key={m.id}
                                className={`flex ${m.direction === "in" ? "justify-start" : "justify-end"}`}
                              >
                                <div
                                  className={`flex flex-col max-w-[92%] sm:max-w-[85%] md:max-w-[80%] ${m.direction === "in" ? "items-start" : "items-end"}`}
                                >
                                  <div className={`rounded-2xl px-5 py-3.5 text-sm shadow-md ${m.direction === "in"
                                    ? "bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700/50"
                                    : "bg-cyan-600 text-white rounded-tr-none shadow-cyan-500/20"
                                    }`}>
                                    <p className="leading-relaxed whitespace-pre-wrap">{m.body}</p>
                                  </div>
                                  <span className={`text-[9px] mt-1.5 font-bold uppercase tracking-widest text-slate-500 ${m.direction === "in" ? "pl-1" : "pr-1"}`}>
                                    {m.direction === "in" ? "Lead" : "AI Assistant"} • {new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="flex h-full flex-col items-center justify-center text-slate-600">
                              <svg className="w-12 h-12 mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                              <p className="text-xs uppercase tracking-widest font-bold">Nenhuma mensagem registrada</p>
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 bg-slate-900/40 border-t border-slate-800 p-3 sm:p-4">
                          <PaginationControls
                            page={leadMessagesPagination?.page || 1}
                            totalPages={leadMessagesPagination?.totalPages || 1}
                            totalItems={leadMessagesPagination?.total || 0}
                            pageSize={leadMessagesPageSize}
                            loading={leadMessagesLoading}
                            onPageChange={(page) => void handleChangeLeadMessagesPage(page)}
                            onPageSizeChange={(pageSize) => void handleChangeLeadMessagesPageSize(pageSize)}
                          />
                        </div>
                      </div>

                      {/* Task Section */}
                      <div className="flex h-full min-h-0 min-w-0 flex-col bg-slate-900/40">
                        <div className="border-b border-slate-800 p-3 sm:p-4 lg:p-5">
                          <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400">Próximos Passos</h4>
                        </div>
                        <div className="supabase-scroll flex-1 overflow-y-auto p-3 sm:p-4 lg:p-5">
                          <form className="mb-6 space-y-4" onSubmit={handleCreateTask}>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Título da Tarefa</label>
                              <input className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50 transition-all" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Ex: Retornar a ligação de vendas, Enviar proposta..." required />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Notas / Descrição (Opcional)</label>
                              <textarea className="w-full min-h-[60px] rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50 transition-all resize-none" value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} placeholder="Detalhes de como executar essa tarefa e o que não esquecer..." />
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Data e Hora Máxima</label>
                                <input className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-[10px] text-slate-100 outline-none focus:border-cyan-500/50 transition-all" type="datetime-local" value={taskDueAt} onChange={(e) => setTaskDueAt(e.target.value)} required />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Relevância</label>
                                <select className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-[10px] text-slate-100 outline-none focus:border-cyan-500/50 transition-all font-bold uppercase tracking-widest" value={taskPriority} onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}>
                                  {TASK_PRIORITIES.map(p => <option key={p} value={p}>{p === "high" ? "Alta" : p === "medium" ? "Média" : "Baixa"}</option>)}
                                </select>
                              </div>
                            </div>
                            <button type="submit" disabled={taskSubmitting} className="w-full rounded-xl bg-slate-100 px-4 py-2.5 text-[10px] font-black text-slate-950 hover:bg-white transition-all disabled:opacity-50 uppercase tracking-widest">
                              {taskSubmitting ? "Salvando..." : "Adicionar Tarefa"}
                            </button>
                          </form>

                          <div className="space-y-3">
                            {(selectedLead.tasks || []).length > 0 ? (
                              (selectedLead.tasks || []).map((task) => (
                                <div key={task.id} className="group relative rounded-xl border border-slate-800 bg-slate-950 p-3 transition-all hover:border-slate-700">
                                  <div className="flex items-start justify-between">
                                    <div>
                                      <p className={`text-xs font-bold ${task.status === 'done' ? 'text-slate-500 line-through' : 'text-slate-200'}`}>{task.title}</p>
                                      <div className="mt-1 flex items-center gap-2">
                                        <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${task.priority === 'high' ? 'bg-rose-500/10 text-rose-500' :
                                          task.priority === 'medium' ? 'bg-amber-500/10 text-amber-500' : 'bg-slate-800 text-slate-500'
                                          }`}>{task.priority}</span>
                                        <span className="text-[9px] text-slate-500 font-medium">{new Date(task.dueAt).toLocaleDateString("pt-BR")}</span>
                                      </div>
                                    </div>
                                    <button onClick={() => void handleDeleteTask(task.id)} className="opacity-0 group-hover:opacity-100 p-1 text-slate-600 hover:text-rose-500 transition-all">
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                  </div>
                                  <div className="mt-3">
                                    <select
                                      className="w-full rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5 text-[10px] font-bold text-slate-400 outline-none"
                                      value={task.status}
                                      onChange={(e) => void apiFetch(`/crm/tasks/${task.id}/status`, { method: "PATCH", body: JSON.stringify({ status: e.target.value }) }).then(async () => {
                                        if (selectedLeadId) await loadLeadDetails(selectedLeadId);
                                        await loadCrm();
                                      })}
                                    >
                                      {TASK_STATUSES.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                                    </select>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <p className="text-[10px] text-center font-bold text-slate-600 uppercase tracking-widest mt-10">Fila de tarefas vazia</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                </div>
              ) : leadDetailsLoading && selectedLeadId ? (
                <div className="flex h-[400px] flex-col items-center justify-center gap-4 text-slate-500">
                  <div className="relative">
                    <div className="h-11 w-11 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin" />
                    <div className="absolute inset-1 rounded-full bg-cyan-500/10 animate-pulse" />
                  </div>
                  <p className="text-sm font-medium uppercase tracking-widest animate-pulse">Carregando detalhes do lead...</p>
                </div>
              ) : (
                <div className="flex h-[400px] flex-col items-center justify-center text-slate-600">
                  <div className="mb-4 rounded-full bg-slate-900 p-6 border border-slate-800">
                    <svg className="w-12 h-12 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                    </svg>
                  </div>
                  <p className="text-sm font-bold uppercase tracking-widest animate-pulse">Selecione um lead no pipeline para abrir o painel</p>
                </div>
              )}
            </section>
          </section>
        ) : null}

        <FaqManagerSection active={activePanel === "faqs"} faqs={faqs} faqQuestion={faqQuestion} faqAnswer={faqAnswer} faqSubmitting={faqSubmitting} editingFaqId={editingFaqId} editingFaqQuestion={editingFaqQuestion} editingFaqAnswer={editingFaqAnswer} editingFaqIsActive={editingFaqIsActive} faqUpdatingId={faqUpdatingId} faqDeletingId={faqDeletingId} onFaqQuestionChange={setFaqQuestion} onFaqAnswerChange={setFaqAnswer} onCreateFaqSubmit={handleCreateFaq} onStartEditFaq={startEditFaq} onCancelEditFaq={cancelEditFaq} onEditingFaqQuestionChange={setEditingFaqQuestion} onEditingFaqAnswerChange={setEditingFaqAnswer} onEditingFaqIsActiveChange={setEditingFaqIsActive} onSaveFaq={() => void handleSaveFaq()} onOpenConfirm={setConfirmDialog} />

        {activePanel === "chat" && <ChatSection initialSelectedWaId={activeChatWaId} />}

        <AnalyticsSection active={activePanel === "analytics"} />
        <CalendarSection active={activePanel === "calendar"} />

        {activePanel === "logs" ? (
          <section className="space-y-4 panel-enter">
            <LogsSection
              logs={logs}
              loading={logsLoading}
              error={logsError}
              page={logsPage}
              limit={logsLimit}
              total={logsTotal}
              levelFilter={logsLevelFilter}
              statusFilter={logsStatusFilter}
              searchFilter={logsSearchFilter}
              pathFilter={logsPathFilter}
              requestIdFilter={logsRequestIdFilter}
              waIdFilter={logsWaIdFilter}
              ipFilter={logsIpFilter}
              clientOsFilter={logsClientOsFilter}
              filterLabels={logsFilterLabels}
              deletePassword={logsDeletePassword}
              deleteAuthExpiresAt={logsDeleteAuthExpiresAt}
              deleteAuthSubmitting={logsDeleteAuthSubmitting}
              deleteSubmitting={logsDeleteSubmitting}
              onLevelFilterChange={(value) => {
                setLogsLevelFilter(value);
                setLogsPage(1);
              }}
              onStatusFilterChange={(value) => {
                setLogsStatusFilter(value);
                setLogsPage(1);
              }}
              onSearchFilterChange={(value) => {
                setLogsSearchFilter(value);
                setLogsPage(1);
              }}
              onPathFilterChange={(value) => {
                setLogsPathFilter(value);
                setLogsPage(1);
              }}
              onRequestIdFilterChange={(value) => {
                setLogsRequestIdFilter(value);
                setLogsPage(1);
              }}
              onWaIdFilterChange={(value) => {
                setLogsWaIdFilter(value);
                setLogsPage(1);
              }}
              onIpFilterChange={(value) => {
                setLogsIpFilter(value);
                setLogsPage(1);
              }}
              onClientOsFilterChange={(value) => {
                setLogsClientOsFilter(value);
                setLogsPage(1);
              }}
              onLimitChange={(value) => {
                setLogsLimit(value);
                setLogsPage(1);
              }}
              onDeletePasswordChange={setLogsDeletePassword}
              onAuthorizeDelete={() => void handleAuthorizeLogDelete()}
              onDeleteFiltered={() => void handleDeleteLogs(false)}
              onDeleteAll={() => {
                if (!window.confirm("Tem certeza que deseja excluir TODOS os logs?")) return;
                void handleDeleteLogs(true);
              }}
              onClearFilters={handleClearLogFilters}
              onPageChange={(page) => setLogsPage(page)}
              onRefresh={() => void loadLogs(logsPage, logsLevelFilter, logsStatusFilter, logsSearchFilter, logsPathFilter, logsRequestIdFilter, logsWaIdFilter, logsIpFilter, logsClientOsFilter, logsLimit)}
            />
          </section>
        ) : null}

        {activePanel === "operation" ? (
          <section className="space-y-4 panel-enter">
            <SystemHealthSection
              readiness={systemReadiness}
              details={systemHealthDetails}
              loading={systemLoading}
              error={systemError}
              lastUpdated={systemLastUpdated}
              onRefresh={() => void loadSystemData()}
            />
            <WebhookEventsSection
              events={webhookEvents}
              loading={webhookEventsLoading}
              error={webhookEventsError}
              statusFilter={webhookEventsStatusFilter}
              page={webhookEventsPage}
              limit={webhookEventsLimit}
              total={webhookEventsTotal}
              replayingId={webhookReplayId}
              onStatusFilterChange={(value) => {
                setWebhookEventsStatusFilter(value);
                setWebhookEventsPage(1);
              }}
              onPageChange={(page) => setWebhookEventsPage(page)}
              onRefresh={() => void loadWebhookEvents(webhookEventsPage, webhookEventsStatusFilter)}
              onReplay={(id) => void handleReplayWebhookEvent(id)}
            />
          </section>


        ) : null}

        <OffersSection
          active={activePanel === "offers"}
          onWorkspaceModeChange={setOffersWorkspaceOpen}
          addToast={addToast}
          updateToast={updateToast}
        />

        <SettingsSection
          active={activePanel === "settings"}
          addToast={addToast}
          updateToast={updateToast}
        />

        <ConfirmModal open={Boolean(confirmDialog)} title={confirmDialog?.title || ""} description={confirmDialog?.description || ""} confirmText={confirmDialog?.confirmText || "Confirmar"} tone={confirmDialog?.tone || "danger"} loading={Boolean(faqDeletingId || faqUpdatingId || deletingLeadId)} onCancel={() => setConfirmDialog(null)} onConfirm={() => { handleConfirmAction().catch((err) => setError(err instanceof Error ? err.message : "Falha ao confirmar ação.")); }} />

        <ToastContainer toasts={toasts} removeToast={removeToast} />
        <MessageNotifications />

        </div>
      </section>
      {/* Context Menu - rendered as portal to avoid positioning issues from backdrop-blur */}
      {contextMenu && createPortal(
        <>
          <div className="fixed inset-0 z-[9990]" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
          <div
            ref={(el) => {
              if (el) {
                const rect = el.getBoundingClientRect();
                const docW = document.documentElement.scrollWidth;
                const docH = document.documentElement.scrollHeight;
                const maxX = Math.max(0, docW - rect.width - 8);
                const maxY = Math.max(0, docH - rect.height - 8);
                const clampedX = Math.min(contextMenu.x, maxX);
                const clampedY = Math.min(contextMenu.y, maxY);
                if (parseFloat(el.style.left) !== clampedX || parseFloat(el.style.top) !== clampedY) {
                  el.style.left = `${clampedX}px`;
                  el.style.top = `${clampedY}px`;
                }
              }
            }}
            className="absolute z-[9991] min-w-[220px] animate-in fade-in zoom-in-95 duration-150"
            style={{
              left: contextMenu.x,
              top: contextMenu.y
            }}
          >
            <div className="rounded-xl border border-slate-700 bg-slate-900 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 bg-slate-800/30">
                <p className="text-sm font-bold text-white truncate">{contextMenu.lead.name || "Sem nome"}</p>
                <p className="text-[10px] text-slate-500 font-mono">{contextMenu.lead.waId}</p>
              </div>
              <div className="p-1.5">
                <button onClick={() => { setActiveChatWaId(contextMenu.lead.waId); setActivePanel("chat"); setContextMenu(null); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm text-slate-200 hover:bg-cyan-500/10 hover:text-cyan-400 transition-all group">
                  <svg className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                  <span className="font-medium">Abrir Chat</span>
                </button>
                <button onClick={() => { setSelectedLeadId(contextMenu.lead.id); setContextMenu(null); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm text-slate-200 hover:bg-slate-700/50 transition-all group">
                  <svg className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  <span className="font-medium">Ver Detalhes</span>
                </button>
                <div className="h-px bg-slate-800 my-1 mx-2" />
                <button onClick={() => { void updateLead(contextMenu.lead.id, `/crm/leads/${contextMenu.lead.id}/bot`, { enabled: !contextMenu.lead.botEnabled }); setContextMenu(null); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm text-slate-200 hover:bg-slate-700/50 transition-all">
                  <svg className={`w-4 h-4 ${contextMenu.lead.botEnabled ? "text-cyan-400" : "text-slate-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  <span className="font-medium">{contextMenu.lead.botEnabled ? "Desativar Bot" : "Ativar Bot"}</span>
                  <div className={`ml-auto w-2 h-2 rounded-full ${contextMenu.lead.botEnabled ? "bg-cyan-400" : "bg-slate-600"}`} />
                </button>
                <div className="h-px bg-slate-800 my-1 mx-2" />
                <div className="px-3 py-1"><span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Status</span></div>
                {[
                  { value: "open", label: "Aberto", color: "text-cyan-400 hover:bg-cyan-500/10", dot: "bg-cyan-400" },
                  { value: "won", label: "Ganho", color: "text-emerald-400 hover:bg-emerald-500/10", dot: "bg-emerald-400" },
                  { value: "lost", label: "Perdido", color: "text-rose-400 hover:bg-rose-500/10", dot: "bg-rose-400" }
                ].map((s) => (
                  <button key={s.value} onClick={() => { void updateLead(contextMenu.lead.id, `/crm/leads/${contextMenu.lead.id}`, { leadStatus: s.value }, "PUT"); setContextMenu(null); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-all ${s.color}`}>
                    <div className={`w-2.5 h-2.5 rounded-full ${s.dot} ${contextMenu.lead.leadStatus === s.value ? "ring-2 ring-current ring-offset-1 ring-offset-slate-900" : "opacity-40"}`} />
                    <span className={`font-medium ${contextMenu.lead.leadStatus === s.value ? "" : "text-slate-400"}`}>{s.label}</span>
                    {contextMenu.lead.leadStatus === s.value && <svg className="w-3.5 h-3.5 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </button>
                ))}
                <div className="h-px bg-slate-800 my-1 mx-2" />
                <button onClick={() => setContextMenu((prev) => prev ? { ...prev, stageSubmenu: !prev.stageSubmenu } : null)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm text-slate-200 hover:bg-slate-700/50 transition-all group">
                  <svg className="w-4 h-4 text-slate-500 group-hover:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
                  <span className="font-medium">Mover para Etapa</span>
                  <svg className={`w-3.5 h-3.5 ml-auto text-slate-500 transition-transform ${contextMenu.stageSubmenu ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
                {contextMenu.stageSubmenu && (
                  <div className="mx-2 mb-1 rounded-lg border border-slate-800 bg-slate-950 overflow-hidden">
                    {stages.map((st) => (
                      <button key={st.id} onClick={() => { void updateLead(contextMenu.lead.id, `/crm/leads/${contextMenu.lead.id}/stage`, { stageId: st.id }); setContextMenu(null); }} className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs transition-all hover:bg-slate-800 ${contextMenu.lead.stageId === st.id ? "text-white font-bold" : "text-slate-400"}`}>
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: st.color }} />
                        <span className="truncate">{st.name}</span>
                        {contextMenu.lead.stageId === st.id && <svg className="w-3 h-3 ml-auto text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </button>
                    ))}
                  </div>
                )}
                <div className="h-px bg-slate-800 my-1 mx-2" />
                <button onClick={() => { setConfirmDialog({ title: "Excluir permanentemente?", description: `Isso removerá "${contextMenu.lead.name || contextMenu.lead.waId}" e todo o histórico.`, confirmText: "Sim, excluir", tone: "danger", action: { type: "delete-lead", leadId: contextMenu.lead.id, leadName: contextMenu.lead.name, waId: contextMenu.lead.waId } }); setContextMenu(null); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm text-rose-400 hover:bg-rose-500/10 transition-all group">
                  <svg className="w-4 h-4 text-rose-400/60 group-hover:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  <span className="font-medium">Excluir Lead</span>
                </button>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </main>
  );
}
