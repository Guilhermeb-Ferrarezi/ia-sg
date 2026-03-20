export type AuthUser = {
  username: string;
  role: string;
  exp: number;
};

export type DashboardSummary = {
  metrics: {
    contacts: number;
    messages: number;
    inbound: number;
    outbound: number;
    activeFaqs: number;
  };
  latest: {
    body: string;
    direction: string;
    contact: string;
    createdAt: string;
  } | null;
};

export type FaqItem = {
  id: number;
  question: string;
  answer: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ContactMessage = {
  id: number;
  direction: "in" | "out" | string;
  body: string;
  createdAt: string;
};

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type ContactConversation = {
  id: number;
  waId: string;
  name: string | null;
  createdAt: string;
  messages: ContactMessage[];
};

export type LeadStatus = "open" | "won" | "lost";
export type TaskStatus = "open" | "done" | "canceled";
export type TaskPriority = "low" | "medium" | "high";

export type PipelineStage = {
  id: number;
  name: string;
  position: number;
  color: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LeadTask = {
  id: number;
  contactId: number;
  title: string;
  description: string | null;
  dueAt: string;
  status: TaskStatus;
  priority: TaskPriority | string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type Lead = {
  id: number;
  waId: string;
  name: string | null;
  stageId: number | null;
  stage: PipelineStage | null;
  leadStatus: LeadStatus | string;
  source: string | null;
  notes: string | null;
  botEnabled: boolean;
  interestedCourse: string | null;
  courseMode: string | null;
  availability: string | null;
  qualificationScore: number | null;
  handoffNeeded: boolean;
  customBotPersona: string | null;
  aiSummary: string | null;
  age: string | null;
  level: string | null;
  objective: string | null;
  lastInteractionAt: string | null;
  createdAt: string;
  openTasks?: LeadTask[];
  latestMessage?: ContactMessage | null;
  messages?: ContactMessage[];
  tasks?: LeadTask[];
};

export type ConversionMetrics = {
  overall: {
    won: number;
    lost: number;
    open: number;
    totalClosed: number;
    conversionRate: number;
  };
  byStage: Array<{
    stageId: number;
    stageName: string;
    stageColor: string;
    total: number;
    won: number;
    lost: number;
    open: number;
    conversionRate: number;
  }>;
};

export type ConfirmDialogState = {
  title: string;
  description: string;
  confirmText: string;
  tone: "danger" | "warning";
  action:
  | { type: "delete-contact"; contact: ContactConversation }
  | { type: "clear-contact-messages"; contact: ContactConversation }
  | { type: "delete-message"; messageId: number }
  | { type: "delete-faq"; faqId: number }
  | { type: "delete-lead"; leadId: number; leadName: string | null; waId: string };
};

export type Toast = {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "loading";
};

export type MessageTemplate = {
  id: number;
  title: string;
  body: string;
  category: string;
  createdAt: string;
  updatedAt: string;
};

export type Tag = {
  id: number;
  name: string;
  color: string;
  contactCount?: number;
  createdAt: string;
};

export type CalendarTask = {
  id: number;
  title: string;
  description: string | null;
  dueAt: string;
  status: string;
  priority: string;
  contactName: string;
  contactId: number;
  completedAt: string | null;
};

export type AnalyticsOverview = {
  totalContacts: number;
  totalMessages: number;
  todayMessages: number;
  weekMessages: number;
  avgResponseSeconds: number;
};

export type MessagesPerDay = {
  date: string;
  inbound: number;
  outbound: number;
  total: number;
};

export type TopContact = {
  id: number;
  name: string;
  waId: string;
  messageCount: number;
  stage: string | null;
  stageColor: string | null;
  lastInteraction: string | null;
};

export type SystemReadiness = {
  ok: boolean;
  db: "up" | "down" | string;
  error?: string;
};

export type SystemHealthDetails = {
  ok: boolean;
  uptimeSec: number;
  db: "up" | "down" | string;
  wsClients: number;
  worker?: {
    intervalMs: number;
    maxRetries: number;
  };
  error?: string;
};

export type WebhookEvent = {
  id: number;
  requestId: string;
  waId: string | null;
  waMessageId: string | null;
  dedupeKey: string;
  payload: unknown;
  status: "pending" | "processing" | "done" | "failed" | "dead" | string;
  attemptCount: number;
  nextAttemptAt: string | null;
  lockedAt: string | null;
  processedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WebhookEventsResponse = {
  page: number;
  limit: number;
  total: number;
  events: WebhookEvent[];
};

export type AppLog = {
  id: number;
  ts: string;
  level: "info" | "warn" | "error" | string;
  event: string;
  method: string | null;
  path: string | null;
  statusCode: number | null;
  durationMs: number | null;
  ip: string | null;
  userAgent: string | null;
  clientOs: string | null;
  requestId: string | null;
  waId: string | null;
  contactId: number | null;
  webhookEventId: number | null;
  message: string | null;
  data?: unknown;
};

export type LogsResponse = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  availablePageSizes?: number[];
  filterLabels?: Record<string, string>;
  logs: AppLog[];
};

export type AISettings = {
  model: string;
  baseUrl: string;
  transcriptionModel: string;
  persona: string;
  historyLimit: number;
  aiReplyDebounceMs: number;
  humanDelayMinMs: number;
  humanDelayMaxMs: number;
  hasApiKey: boolean;
  language: string;
  provider: string;
};

export type WhatsAppProfile = {
  phoneNumberId: string;
  verifiedName: string | null;
  displayPhoneNumber: string | null;
  qualityRating: string | null;
  nameStatus: string | null;
  about: string | null;
  address: string | null;
  description: string | null;
  email: string | null;
  profilePictureUrl: string | null;
  websites: string[];
  vertical: string | null;
};
