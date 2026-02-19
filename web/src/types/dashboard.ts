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
