import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/apiFetch";
import { resolveWebSocketUrl } from "../lib/ws";
import type { Lead, MessageTemplate } from "../types/dashboard";

type ChatMessage = {
  id: number;
  direction: string;
  body: string;
  createdAt: string;
};

function normalizeWaId(input: string): string {
  return input.replace(/[^\d]/g, "");
}

interface ChatSectionProps {
  initialSelectedWaId?: string | null;
}

export default function ChatSection({ initialSelectedWaId }: ChatSectionProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [togglingBot, setTogglingBot] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedLeadRef = useRef<Lead | null>(null);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  // Keep ref in sync with state
  useEffect(() => {
    selectedLeadRef.current = selectedLead;
  }, [selectedLead]);

  const loadLeads = useCallback(async () => {
    setLeadsLoading(true);
    try {
      const result = await apiFetch<{ leads: Lead[] }>("/crm/leads?limit=200");
      setLeads(result.leads);
    } catch (err) {
      console.error("Failed to load leads:", err);
    } finally {
      setLeadsLoading(false);
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const result = await apiFetch<{ templates: MessageTemplate[] }>("/templates");
      setTemplates(result.templates);
    } catch { /* ignore */ }
  }, []);

  const loadMessages = useCallback(async (waId: string) => {
    setLoading(true);
    try {
      const result = await apiFetch<{ success: boolean; messages: ChatMessage[] }>(
        `/chat/history/${waId}?limit=50`
      );
      setMessages(result.messages || []);
    } catch (err) {
      console.error("Failed to load messages:", err);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // WebSocket connection
  useEffect(() => {
    function connect() {
      const ws = new WebSocket(resolveWebSocketUrl());

      ws.onopen = () => {
        setWsConnected(true);
        console.log("[WS] Connected");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "new_message" && data.waId && data.message) {
            const currentLead = selectedLeadRef.current;
            const incomingContactId = Number(data.contactId);
            const matchesById =
              currentLead &&
              Number.isInteger(incomingContactId) &&
              incomingContactId > 0 &&
              currentLead.id === incomingContactId;
            const matchesByWaId =
              currentLead &&
              typeof data.waId === "string" &&
              normalizeWaId(currentLead.waId) === normalizeWaId(data.waId);

            if (currentLead && (matchesById || matchesByWaId)) {
              setMessages((prev) => {
                // Avoid duplicates
                if (prev.some((m) => m.id === data.message.id)) return prev;
                return [...prev, data.message];
              });
            }
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        console.log("[WS] Disconnected, reconnecting in 3s...");
        wsReconnectRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    }

    connect();

    return () => {
      if (wsReconnectRef.current) clearTimeout(wsReconnectRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on cleanup
        wsRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    loadLeads();
    loadTemplates();
  }, [loadLeads, loadTemplates]);

  useEffect(() => {
    if (selectedLead) {
      loadMessages(selectedLead.waId);
    } else {
      setMessages([]);
    }
  }, [selectedLead, loadMessages]);

  useEffect(() => {
    if (initialSelectedWaId && leads.length > 0) {
      const match = leads.find((l) => l.waId === initialSelectedWaId);
      if (match) {
        setSelectedLead(match);
      }
    }
  }, [initialSelectedWaId, leads]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || !selectedLead || sending) return;

    setSending(true);
    try {
      await apiFetch("/chat/send", {
        method: "POST",
        body: JSON.stringify({
          wa_id: selectedLead.waId,
          message: inputMessage.trim()
        })
      });

      setInputMessage("");
      await loadMessages(selectedLead.waId);
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setSending(false);
    }
  };

  const toggleBot = async () => {
    if (!selectedLead || togglingBot) return;
    setTogglingBot(true);
    try {
      const newEnabled = !selectedLead.botEnabled;
      await apiFetch(`/crm/leads/${selectedLead.id}/bot`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: newEnabled })
      });
      setSelectedLead({ ...selectedLead, botEnabled: newEnabled });
      // Also update in leads list
      setLeads((prev) =>
        prev.map((l) => (l.id === selectedLead.id ? { ...l, botEnabled: newEnabled } : l))
      );
    } catch (err) {
      console.error("Failed to toggle bot:", err);
    } finally {
      setTogglingBot(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString();
  };

  const groupMessagesByDate = (msgs: ChatMessage[]) => {
    const groups: { date: string; messages: ChatMessage[] }[] = [];
    let currentDate = "";

    for (const msg of msgs) {
      const msgDate = formatDate(msg.createdAt);
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ date: msgDate, messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    }

    return groups;
  };

  const filteredLeads = leads.filter((lead) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      (lead.name || "").toLowerCase().includes(term) ||
      lead.waId.toLowerCase().includes(term)
    );
  });

  return (
    <div className="flex h-[calc(100vh-140px)] rounded-2xl border border-slate-800 bg-[#0f172a]/80 shadow-2xl backdrop-blur-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Contact List */}
      <div className="w-80 bg-slate-900/50 border-r border-slate-800 flex flex-col">
        <div className="p-5 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-500">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-widest text-slate-100">Contatos</h2>
              <p className="text-[10px] text-slate-500 mt-0.5">{leads.length} contatos</p>
            </div>
          </div>
          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar contato..."
              className="w-full rounded-xl border border-slate-700 bg-slate-800 pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-500/50 transition-all"
            />
          </div>
        </div>
        <div className="supabase-scroll flex-1 overflow-y-auto">
          {leadsLoading ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-slate-500">
              <svg className="animate-spin h-8 w-8 text-cyan-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              <span className="text-xs uppercase tracking-widest font-bold">Carregando...</span>
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs font-bold uppercase tracking-widest">
              {searchTerm ? "Nenhum resultado" : "Nenhum contato encontrado"}
            </div>
          ) : (
            filteredLeads.map((lead) => (
              <div
                key={lead.id}
                onClick={() => setSelectedLead(lead)}
                className={`p-4 cursor-pointer border-b border-slate-800/50 hover:bg-slate-800/50 transition-colors ${selectedLead?.id === lead.id ? "bg-cyan-500/10 border-l-4 border-l-cyan-500 shadow-inner" : ""
                  }`}
              >
                <div className="flex items-start justify-between">
                  <div className={`font-bold text-sm ${selectedLead?.id === lead.id ? "text-cyan-400" : "text-slate-200"}`}>
                    {lead.name || "Sem Nome"}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {!lead.botEnabled && (
                      <div className="rounded-full bg-amber-500/10 p-1 text-amber-400" title="Modo Manual">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                    )}
                    {lead.botEnabled && (
                      <div className="rounded-full bg-cyan-500/10 p-1 text-cyan-500" title="Bot Ativo">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-xs text-slate-500 mt-1 font-mono">{lead.waId}</div>
                {lead.latestMessage && (
                  <div className="text-[11px] text-slate-400 mt-2 truncate max-w-full italic">
                    &ldquo;{lead.latestMessage.body.substring(0, 40)}{lead.latestMessage.body.length > 40 ? "..." : ""}&rdquo;
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-slate-900/20">
        {selectedLead ? (
          <>
            {/* Header */}
            <div className="p-5 border-b border-slate-800 bg-slate-900/60 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 shadow-lg shadow-cyan-500/20">
                  <span className="text-lg font-black">{selectedLead.name?.[0]?.toUpperCase() || "L"}</span>
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 text-lg">
                    {selectedLead.name || "Sem Nome"}
                  </h3>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-cyan-400 font-mono">{selectedLead.waId}</p>
                    {/* Live Indicator */}
                    <div className="flex items-center gap-1">
                      <div className={`w-2 h-2 rounded-full ${wsConnected ? "bg-emerald-400 animate-pulse" : "bg-rose-400"}`}></div>
                      <span className={`text-[9px] font-bold uppercase tracking-widest ${wsConnected ? "text-emerald-400" : "text-rose-400"}`}>{wsConnected ? "Live" : "Offline"}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bot Toggle */}
              <div className="flex items-center gap-3">
                <button
                  onClick={toggleBot}
                  disabled={togglingBot}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border ${selectedLead.botEnabled
                    ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                    } disabled:opacity-50`}
                >
                  {selectedLead.botEnabled ? (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Bot Ativo
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Modo Manual
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="supabase-scroll flex-1 space-y-6 overflow-y-auto p-6">
              {loading ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-slate-500">
                  <svg className="animate-spin h-8 w-8 text-cyan-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  <span className="text-xs uppercase tracking-widest font-bold">Carregando mensagens...</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-slate-600">
                  <svg className="w-16 h-16 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <div className="text-xs uppercase tracking-widest font-bold">Nenhuma mensagem. Envie um oi!</div>
                </div>
              ) : (
                groupMessagesByDate(messages).map((group) => (
                  <div key={group.date}>
                    <div className="flex justify-center mb-6">
                      <span className="px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {group.date}
                      </span>
                    </div>
                    <div className="space-y-4">
                      {group.messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.direction === "out" ? "justify-end" : "justify-start"
                            }`}
                        >
                          <div
                            className={`flex flex-col max-w-[80%] lg:max-w-xl ${msg.direction === "out" ? "items-end" : "items-start"
                              }`}
                          >
                            <div
                              className={`px-5 py-3.5 text-sm shadow-md rounded-2xl ${msg.direction === "out"
                                ? "bg-cyan-600 text-white rounded-tr-none shadow-cyan-500/20"
                                : "bg-slate-800 text-slate-100 border border-slate-700/50 rounded-tl-none"
                                }`}
                            >
                              <p className="whitespace-pre-wrap leading-relaxed">{msg.body}</p>
                            </div>
                            <span
                              className={`text-[9px] mt-1.5 font-bold uppercase tracking-widest text-slate-500 ${msg.direction === "out" ? "pr-1" : "pl-1"
                                }`}
                            >
                              {formatTime(msg.createdAt)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-5 border-t border-slate-800 bg-slate-900/60 shadow-inner">
              {!selectedLead.botEnabled && (
                <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-[10px] text-amber-400 font-bold uppercase tracking-widest">
                    Modo manual ativo — Você está respondendo diretamente
                  </span>
                </div>
              )}
              <div className="flex gap-3">
                {/* Templates Button */}
                <button
                  onClick={() => setShowTemplates(!showTemplates)}
                  className={`shrink-0 p-3.5 rounded-xl border transition-all ${showTemplates
                    ? "border-violet-500/50 bg-violet-500/10 text-violet-400"
                    : "border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
                    }`}
                  title="Templates de mensagem"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                  </svg>
                </button>
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Digite uma mensagem..."
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-5 py-3.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
                  disabled={sending}
                />
                <button
                  onClick={() => void sendMessage()}
                  disabled={!inputMessage.trim() || sending}
                  className="flex items-center gap-2 rounded-xl bg-cyan-500 px-6 py-3.5 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/20 hover:bg-cyan-400 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:pointer-events-none uppercase tracking-widest"
                >
                  {sending ? (
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  ) : (
                    <>
                      <span>Enviar</span>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
              {/* Templates Panel */}
              {showTemplates && (
                <div className="supabase-scroll mt-3 max-h-48 overflow-y-auto rounded-xl border border-violet-500/20 bg-slate-800/80 p-3">
                  <div className="text-[10px] font-bold text-violet-400 uppercase tracking-widest mb-2">Templates Rápidos</div>
                  {templates.length === 0 ? (
                    <p className="text-xs text-slate-500">Nenhum template. Crie templates na aba de configurações.</p>
                  ) : (
                    <div className="grid gap-1.5">
                      {templates.map((tmpl) => (
                        <button
                          key={tmpl.id}
                          onClick={() => { setInputMessage(tmpl.body); setShowTemplates(false); }}
                          className="text-left p-2.5 rounded-lg border border-slate-700/50 bg-slate-900/50 hover:bg-violet-500/10 hover:border-violet-500/30 transition-all group"
                        >
                          <div className="text-xs font-bold text-slate-200 group-hover:text-violet-300 transition-colors">{tmpl.title}</div>
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">{tmpl.body}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-600 bg-slate-900/20">
            <div className="mb-6 rounded-full bg-slate-900 p-8 border border-slate-800 shadow-inner">
              <svg
                className="w-16 h-16 opacity-30"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.102C3.512 15.046 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            <p className="text-sm font-bold uppercase tracking-widest text-slate-500 animate-pulse">Selecione um contato para iniciar uma conversa</p>
          </div>
        )}
      </div>
    </div>
  );
}
