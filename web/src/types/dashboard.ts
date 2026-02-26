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
    | { type: "delete-faq"; faqId: number };
};
