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
  email?: string | null;
  stageId: number | null;
  stage: PipelineStage | null;
  leadStatus: LeadStatus | string;
  source: string | null;
  notes: string | null;
  botEnabled: boolean;
  interestedCourse: string | null;
  courseMode: string | null;
  availability: string | null;
  interestConfidence?: number | null;
  qualificationScore: number | null;
  handoffNeeded: boolean;
  customBotPersona: string | null;
  aiSummary: string | null;
  age: string | null;
  level: string | null;
  objective: string | null;
  lastLandingSentAt?: string | null;
  lastLandingOfferId?: number | null;
  lastLandingPageId?: number | null;
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

export type Offer = {
  id: number;
  title: string;
  slug: string;
  aliases: string[];
  durationLabel: string | null;
  modality: string | null;
  shortDescription: string | null;
  approvedFacts: string[];
  ctaLabel: string;
  ctaUrl: string;
  visualTheme: string | null;
  isActive: boolean;
  latestLanding?: LandingPageSummary | null;
  createdAt: string;
  updatedAt: string;
};

export type LandingPromptConfig = {
  systemPrompt: string;
  toneGuidelines: string;
  requiredRules: string[];
  ctaRules: string[];
  autoGenerateEnabled: boolean;
  autoSendEnabled: boolean;
  confidenceThreshold: number;
  scope?: string;
  offerId?: number | null;
};

export type LandingSections = {
  hero?: {
    eyebrow?: string;
    headline?: string;
    subheadline?: string;
    highlights?: string[];
  };
  benefits?: Array<{ title: string; description: string }>;
  proof?: {
    title?: string;
    items?: string[];
  };
  faq?: Array<{ question: string; answer: string }>;
  cta?: {
    label?: string;
    helper?: string;
  };
};

export type LandingBuilderNode =
  | {
    id: string;
    type: "hero";
    props: {
      eyebrow?: string;
      headline?: string;
      subheadline?: string;
      highlights?: string[];
      ctaLabel?: string;
    };
  }
  | {
    id: string;
    type: "info-panel";
    props: {
      title?: string;
      items?: Array<{ label: string; value: string }>;
      helper?: string;
    };
  }
  | {
    id: string;
    type: "feature-grid";
    props: {
      title?: string;
      items?: Array<{ title: string; description: string }>;
    };
  }
  | {
    id: string;
    type: "proof-list";
    props: {
      title?: string;
      items?: string[];
    };
  }
  | {
    id: string;
    type: "faq-list";
    props: {
      title?: string;
      items?: Array<{ question: string; answer: string }>;
    };
  }
  | {
    id: string;
    type: "cta-band";
    props: {
      eyebrow?: string;
      label?: string;
      helper?: string;
    };
  };

export type LandingBuilderDocument = {
  version: number;
  kind: "landing-builder-v1";
  metadata: {
    title: string;
    slug: string;
    description?: string;
  };
  theme: {
    accent: string;
    surface: string;
    canvas: string;
  };
  nodes: LandingBuilderNode[];
};

export type LandingCodeFile = {
  path: string;
  code: string;
  summary?: string;
};

export type LandingCodeBundle = {
  version: number;
  kind: "landing-code-bundle-v1";
  framework: "vite-react";
  source: "ai" | "fallback";
  entryFile: string;
  files: LandingCodeFile[];
  metadata: {
    title: string;
    slug: string;
    description?: string;
    summary: string;
    generatedAt: string;
    visualTheme?: string;
  };
  themeTokens: {
    accent: string;
    surface: string;
    canvas: string;
    text: string;
    muted: string;
  };
  usedComponents: string[];
  usedImports: string[];
};

export type LandingPageSummary = {
  id: number;
  offerId: number;
  version: number;
  status: string;
  sectionsJson: LandingSections;
  builderDocumentJson?: LandingBuilderDocument | null;
  landingCodeBundleJson?: LandingCodeBundle | null;
  artifactKey?: string | null;
  artifactUrl?: string | null;
  promptSnapshot?: unknown;
  sourceFactsSnapshot?: unknown;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LandingMetrics = {
  deliveries: number;
  views: number;
  clicks: number;
  clickRate: number;
};

export type LandingPreviewLeadContext = {
  interestedCourse: string;
  courseMode: string;
  objective: string;
  level: string;
  summary: string;
};

export type LandingPreviewResponse = {
  offer: Offer;
  landing: LandingPageSummary;
};

export type LandingCreationMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type LandingCreationDraft = {
  title: string;
  slug: string;
  aliases: string[];
  durationLabel: string;
  modality: string;
  shortDescription: string;
  approvedFacts: string[];
  ctaLabel: string;
  ctaUrl: string;
  visualTheme: string;
  colorPalette: string;
  typographyStyle: string;
  layoutStyle: string;
  isActive: boolean;
};

export type LandingCreationReadiness = {
  canPreview: boolean;
  canPublish: boolean;
  missingPreviewFields: string[];
  missingPublishFields: string[];
};

export type LandingCreationSession = {
  id: number;
  title: string;
  status: string;
  offerDraft: LandingCreationDraft;
  promptDraft: LandingPromptConfig;
  chatHistory: LandingCreationMessage[];
  readiness: LandingCreationReadiness;
  builderDraft?: LandingBuilderDocument | null;
  codeBundleDraft?: LandingCodeBundle | null;
  preview: LandingPreviewResponse | null;
  publishedOfferId: number | null;
  createdAt: string;
  updatedAt: string;
};
