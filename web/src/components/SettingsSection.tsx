import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/apiFetch";
import type { AISettings, WhatsAppProfile } from "../types/dashboard";
import {
  Bot,
  Brain,
  Camera,
  Check,
  ChevronDown,
  Clock,
  Cloud,
  ExternalLink,
  Globe,
  Key,
  Languages,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  RefreshCw,
  Save,
  Settings,
  Shield,
  Sparkles,
  Timer,
  Upload,
  User,
  X,
  Zap,
} from "lucide-react";

type SettingsTab = "ai" | "whatsapp";
type ToastType = "success" | "error" | "info" | "loading";

const VERTICALS = [
  "UNDEFINED",
  "OTHER",
  "AUTO",
  "BEAUTY",
  "APPAREL",
  "EDU",
  "ENTERTAIN",
  "EVENT_PLAN",
  "FINANCE",
  "GROCERY",
  "GOVT",
  "HOTEL",
  "HEALTH",
  "NONPROFIT",
  "PROF_SERVICES",
  "RETAIL",
  "TRAVEL",
  "RESTAURANT",
  "NOT_A_BIZ",
];

const OPENAI_MODEL_GROUPS = [
  {
    label: "GPT Omni",
    options: [
      { value: "gpt-4o-mini", label: "GPT-4o mini" },
      { value: "gpt-4o", label: "GPT-4o" },
    ],
  },
  {
    label: "GPT-4.1",
    options: [
      { value: "gpt-4.1-nano", label: "GPT-4.1 nano" },
      { value: "gpt-4.1-mini", label: "GPT-4.1 mini" },
      { value: "gpt-4.1", label: "GPT-4.1" },
    ],
  },
  {
    label: "Reasoning",
    options: [
      { value: "o1", label: "o1" },
      { value: "o1-pro", label: "o1-pro" },
      { value: "o3-mini", label: "o3-mini" },
      { value: "o3", label: "o3" },
      { value: "o3-pro", label: "o3-pro" },
      { value: "o4-mini", label: "o4-mini" },
    ],
  },
  {
    label: "GPT-5",
    options: [
      { value: "gpt-5-nano", label: "GPT-5 nano" },
      { value: "gpt-5-mini", label: "GPT-5 mini" },
      { value: "gpt-5", label: "GPT-5" },
      { value: "gpt-5-pro", label: "GPT-5 pro" },
      { value: "gpt-5.1", label: "GPT-5.1" },
      { value: "gpt-5.2", label: "GPT-5.2" },
      { value: "gpt-5.2-pro", label: "GPT-5.2 pro" },
    ],
  },
  {
    label: "Codex",
    options: [
      { value: "gpt-5-codex", label: "GPT-5 Codex" },
      { value: "gpt-5.1-codex-mini", label: "GPT-5.1 Codex mini" },
      { value: "gpt-5.1-codex", label: "GPT-5.1 Codex" },
      { value: "gpt-5.1-codex-max", label: "GPT-5.1 Codex Max" },
      { value: "gpt-5.2-codex", label: "GPT-5.2 Codex" },
    ],
  },
] as const;

const CUSTOM_MODEL_VALUE = "__custom__";

export default function SettingsSection({
  active,
  addToast,
  updateToast,
}: {
  active: boolean;
  addToast: (message: string, type?: ToastType) => string;
  updateToast: (id: string, message: string, type: ToastType) => void;
}) {
  const [tab, setTab] = useState<SettingsTab>("ai");

  // AI Settings state
  const [ai, setAi] = useState<AISettings | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiDraft, setAiDraft] = useState<Partial<AISettings>>({});
  const [customModelMode, setCustomModelMode] = useState(false);

  // WhatsApp Profile state
  const [wp, setWp] = useState<WhatsAppProfile | null>(null);
  const [wpLoading, setWpLoading] = useState(false);
  const [wpSaving, setWpSaving] = useState(false);
  const [wpError, setWpError] = useState("");
  const [wpDraft, setWpDraft] = useState<Partial<WhatsAppProfile>>({});
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const aiRef = useRef<AISettings | null>(null);
  const wpRef = useRef<WhatsAppProfile | null>(null);

  useEffect(() => {
    aiRef.current = ai;
    wpRef.current = wp;
  }, [ai, wp]);

  const loadAI = useCallback(async () => {
    setAiLoading(true);
    setAiError("");
    try {
      const data = await apiFetch<AISettings>("/settings/ai");
      setAi(data);
      setAiDraft({});
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao carregar configuracoes da IA.";
      setAiError(message);
      if (aiRef.current) addToast(message, "error");
    } finally {
      setAiLoading(false);
    }
  }, [addToast]);

  const loadWP = useCallback(async () => {
    setWpLoading(true);
    setWpError("");
    try {
      const data = await apiFetch<WhatsAppProfile>("/settings/whatsapp-profile");
      setWp(data);
      setWpDraft({});
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao carregar perfil do WhatsApp.";
      setWpError(message);
      if (wpRef.current) addToast(message, "error");
    } finally {
      setWpLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (!active) return;
    void loadAI();
    void loadWP();
  }, [active, loadAI, loadWP]);

  const saveAI = async () => {
    setAiSaving(true);
    setAiError("");
    const toastId = addToast("Salvando configuracoes da IA...", "loading");
    try {
      const data = await apiFetch<AISettings>("/settings/ai", {
        method: "PUT",
        body: JSON.stringify(aiDraft),
      });
      setAi(data);
      setAiDraft({});
      updateToast(toastId, "Configuracoes da IA salvas com sucesso!", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao salvar.";
      setAiError(message);
      updateToast(toastId, message, "error");
    } finally {
      setAiSaving(false);
    }
  };

  const saveWP = async () => {
    setWpSaving(true);
    setWpError("");
    const toastId = addToast("Atualizando perfil do WhatsApp...", "loading");
    try {
      await apiFetch("/settings/whatsapp-profile", {
        method: "PUT",
        body: JSON.stringify(wpDraft),
      });
      updateToast(toastId, "Perfil atualizado com sucesso!", "success");
      void loadWP();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao salvar perfil.";
      setWpError(message);
      updateToast(toastId, message, "error");
    } finally {
      setWpSaving(false);
    }
  };

  const uploadPhoto = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      const message = "Imagem muito grande. Maximo 5MB.";
      setWpError(message);
      addToast(message, "error");
      return;
    }

    setPhotoUploading(true);
    setWpError("");
    const toastId = addToast("Enviando foto do perfil...", "loading");
    try {
      const reader = new FileReader();
      reader.onload = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);

      const buffer = await file.arrayBuffer();
      await apiFetch("/settings/whatsapp-profile/photo", {
        method: "POST",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: buffer,
      });
      updateToast(
        toastId,
        "Foto de perfil atualizada. A Meta pode levar alguns minutos para refletir a mudanca.",
        "success"
      );
      setTimeout(() => void loadWP(), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao enviar foto.";
      setWpError(message);
      updateToast(toastId, message, "error");
      setPhotoPreview(null);
    } finally {
      setPhotoUploading(false);
    }
  };

  const mergedAi: AISettings = {
    model: "",
    baseUrl: "",
    transcriptionModel: "",
    persona: "",
    historyLimit: 20,
    aiReplyDebounceMs: 0,
    humanDelayMinMs: 1200,
    humanDelayMaxMs: 6500,
    hasApiKey: false,
    language: "pt-BR",
    provider: "OpenAI",
    ...ai,
    ...aiDraft,
  };

  const mergedWp: WhatsAppProfile = {
    phoneNumberId: "",
    verifiedName: null,
    displayPhoneNumber: null,
    qualityRating: null,
    nameStatus: null,
    about: null,
    address: null,
    description: null,
    email: null,
    profilePictureUrl: null,
    websites: [],
    vertical: null,
    ...wp,
    ...wpDraft,
  };

  const aiHasChanges = Object.keys(aiDraft).length > 0;
  const wpHasChanges = Object.keys(wpDraft).length > 0;
  const settingsBootLoading = aiLoading && wpLoading && !ai && !wp;
  const knownOpenAiModelIds: string[] = OPENAI_MODEL_GROUPS.flatMap((group) =>
    group.options.map((option) => option.value)
  );
  const hasCustomModel = !!mergedAi.model && !knownOpenAiModelIds.includes(mergedAi.model);
  const showCustomModelInput = customModelMode || hasCustomModel;
  const modelGroups =
    hasCustomModel
      ? [
          {
            label: "Modelo Atual",
            options: [
              {
                value: mergedAi.model,
                label: `${mergedAi.model} (customizado)`,
              },
            ],
          },
          ...OPENAI_MODEL_GROUPS,
        ]
      : OPENAI_MODEL_GROUPS;
  const selectedModelValue = showCustomModelInput
    ? CUSTOM_MODEL_VALUE
    : mergedAi.model;

  if (!active) return null;

  if (settingsBootLoading) {
    return (
      <section className="space-y-6 panel-enter">
        <div className="flex items-center gap-4 fade-in-up">
          <div className="rounded-2xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 p-3 ring-1 ring-violet-500/20">
            <Settings className="h-6 w-6 animate-[spin_8s_linear_infinite] text-violet-400" />
          </div>
          <div>
            <h2 className="bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
              Configuracoes
            </h2>
            <p className="text-sm text-slate-500">
              Carregando IA, perfil do WhatsApp e parametros operacionais.
            </p>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[28px] border border-slate-800 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),_transparent_38%),linear-gradient(145deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] p-6 shadow-2xl shadow-cyan-950/30 fade-in-up stagger-1">
          <div className="absolute -right-16 top-0 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="absolute -left-12 bottom-0 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl" />

          <div className="relative space-y-6">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10">
                <Loader2 className="h-7 w-7 animate-spin text-cyan-300" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300/80">
                  Boot de Configuracoes
                </p>
                <h3 className="mt-1 text-xl font-semibold text-slate-100">
                  Sincronizando painel, perfil e preferencias da IA
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <LoadingStepCard
                icon={Brain}
                title="Config da IA"
                description="Modelo, persona, historico e temporizacao"
              />
              <LoadingStepCard
                icon={MessageSquare}
                title="Perfil WhatsApp"
                description="Foto, descricao comercial e dados publicos"
              />
            </div>

            <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
              <div className="mb-3 flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Sincronizacao inicial do painel</span>
                <span className="text-cyan-300">em andamento</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-cyan-500 via-violet-500 to-cyan-300" />
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const qualityColor =
    mergedWp.qualityRating === "GREEN"
      ? "text-emerald-400"
      : mergedWp.qualityRating === "YELLOW"
        ? "text-amber-400"
        : mergedWp.qualityRating === "RED"
          ? "text-rose-400"
          : "text-slate-400";

  const qualityBg =
    mergedWp.qualityRating === "GREEN"
      ? "bg-emerald-500/15 border-emerald-500/30"
      : mergedWp.qualityRating === "YELLOW"
        ? "bg-amber-500/15 border-amber-500/30"
        : mergedWp.qualityRating === "RED"
          ? "bg-rose-500/15 border-rose-500/30"
          : "bg-slate-500/15 border-slate-500/30";

  return (
    <section className="space-y-6 panel-enter">
      {/* Header */}
      <div className="flex items-center gap-4 fade-in-up">
        <div className="rounded-2xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 p-3 ring-1 ring-violet-500/20 transition-all duration-500 hover:ring-violet-500/40 hover:shadow-lg hover:shadow-violet-500/10">
          <Settings className="h-6 w-6 text-violet-400 animate-[spin_8s_linear_infinite]" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            Configuracoes
          </h2>
          <p className="text-sm text-slate-500">
            Gerencie a IA e o perfil do WhatsApp Business
          </p>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-1.5 backdrop-blur-sm fade-in-up stagger-1">
        <TabButton
          active={tab === "ai"}
          onClick={() => setTab("ai")}
          icon={Brain}
          label="Inteligencia Artificial"
        />
        <TabButton
          active={tab === "whatsapp"}
          onClick={() => setTab("whatsapp")}
          icon={MessageSquare}
          label="Perfil WhatsApp"
        />
      </div>

      {/* AI SETTINGS TAB */}
      {tab === "ai" && (
        <div className="space-y-6 panel-enter" key="ai-tab">
          {aiLoading && !ai ? (
            <PanelLoadingState
              title="Carregando configuracoes da IA"
              description="Buscando modelo, persona e politicas de resposta no backend."
              icon={Brain}
              accent="violet"
            />
          ) : !ai && aiError ? (
            <PanelErrorState
              title="Falha ao carregar configuracoes da IA"
              description={aiError}
              onRetry={() => void loadAI()}
            />
          ) : (
            <>
              {/* Status Cards Row */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 fade-in-up stagger-1">
                <StatusCard
                  icon={Cloud}
                  label="Provider"
                  value={mergedAi.provider}
                  color="cyan"
                />
                <StatusCard
                  icon={Key}
                  label="API Key"
                  value={mergedAi.hasApiKey ? "Configurada" : "Ausente"}
                  color={mergedAi.hasApiKey ? "emerald" : "rose"}
                  pulse={!mergedAi.hasApiKey}
                />
                <StatusCard
                  icon={Languages}
                  label="Idioma"
                  value={mergedAi.language}
                  color="violet"
                />
              </div>

              {/* Model & Provider */}
              <SettingsCard
                title="Modelo e Provedor"
                icon={Sparkles}
                color="cyan"
                stagger={2}
              >
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
                      <Bot className="h-3.5 w-3.5 text-slate-500" />
                      Modelo
                    </label>
                    <div className="relative">
                      <select
                        className="w-full appearance-none rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3 pr-10 text-sm text-slate-200 transition-all duration-300 focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 focus:outline-none hover:border-slate-600"
                        value={selectedModelValue}
                        onChange={(e) => {
                          const nextValue = e.target.value;

                          if (nextValue === CUSTOM_MODEL_VALUE) {
                            setCustomModelMode(true);
                            if (!hasCustomModel) {
                              setAiDraft((d) => ({
                                ...d,
                                model: "",
                              }));
                            }
                            return;
                          }

                          setCustomModelMode(false);
                          setAiDraft((d) => ({
                            ...d,
                            model: nextValue,
                          }));
                        }}
                      >
                        <option value="">Selecione um modelo...</option>
                        <option value={CUSTOM_MODEL_VALUE}>
                          Modelo customizado
                        </option>
                        {modelGroups.map((group) => (
                          <optgroup key={group.label} label={group.label}>
                            {group.options.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    </div>
                    <p className="text-xs text-slate-500">
                      Lista oficial da OpenAI para modelos de texto e raciocinio a partir do GPT-4o mini.
                    </p>
                    {showCustomModelInput && (
                      <InputField
                        label="Modelo customizado"
                        icon={Pencil}
                        value={mergedAi.model}
                        placeholder="gpt-4o-search-preview"
                        onChange={(v) =>
                          setAiDraft((d) => ({ ...d, model: v }))
                        }
                      />
                    )}
                  </div>
                  <InputField
                    label="Modelo de Transcricao"
                    icon={MessageSquare}
                    value={mergedAi.transcriptionModel}
                    placeholder="whisper-1"
                    onChange={(v) =>
                      setAiDraft((d) => ({
                        ...d,
                        transcriptionModel: v,
                      }))
                    }
                  />
                  <InputField
                    label="Limite de Historico"
                    icon={Clock}
                    value={String(mergedAi.historyLimit)}
                    placeholder="20"
                    type="number"
                    onChange={(v) =>
                      setAiDraft((d) => ({
                        ...d,
                        historyLimit: Math.max(1, Number(v) || 20),
                      }))
                    }
                  />
                </div>
              </SettingsCard>

              {/* Persona / System Prompt */}
              <SettingsCard
                title="Prompt do Sistema (Persona)"
                icon={User}
                color="violet"
                stagger={3}
              >
                <div className="space-y-2">
                  <textarea
                    className="min-h-[180px] w-full resize-y rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-200 placeholder-slate-600 transition-all duration-300 focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 focus:outline-none hover:border-slate-600 supabase-scroll"
                    value={mergedAi.persona}
                    onChange={(e) =>
                      setAiDraft((d) => ({
                        ...d,
                        persona: e.target.value,
                      }))
                    }
                    placeholder="Descreva a personalidade, tom de voz e instrucoes do bot..."
                  />
                  <p className="text-xs text-slate-500">
                    Este e o prompt global do sistema. Cada lead pode ter uma
                    persona customizada que sobrescreve esta.
                  </p>
                </div>
              </SettingsCard>

              {/* Timing Config */}
              <SettingsCard
                title="Temporização de Respostas"
                icon={Timer}
                color="amber"
                stagger={4}
              >
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                  <InputField
                    label="Debounce (ms)"
                    icon={Zap}
                    value={String(mergedAi.aiReplyDebounceMs)}
                    placeholder="0"
                    type="number"
                    onChange={(v) =>
                      setAiDraft((d) => ({
                        ...d,
                        aiReplyDebounceMs: Math.max(0, Number(v) || 0),
                      }))
                    }
                    hint="Tempo de espera antes de responder"
                  />
                  <InputField
                    label="Delay Minimo (ms)"
                    icon={Clock}
                    value={String(mergedAi.humanDelayMinMs)}
                    placeholder="1200"
                    type="number"
                    onChange={(v) =>
                      setAiDraft((d) => ({
                        ...d,
                        humanDelayMinMs: Math.max(0, Number(v) || 0),
                      }))
                    }
                    hint="Delay minimo de digitacao"
                  />
                  <InputField
                    label="Delay Maximo (ms)"
                    icon={Clock}
                    value={String(mergedAi.humanDelayMaxMs)}
                    placeholder="6500"
                    type="number"
                    onChange={(v) =>
                      setAiDraft((d) => ({
                        ...d,
                        humanDelayMaxMs: Math.max(0, Number(v) || 0),
                      }))
                    }
                    hint="Delay maximo de digitacao"
                  />
                </div>
              </SettingsCard>

              {/* Save Button */}
              <div className="flex items-center justify-end gap-3 fade-in-up stagger-5">
                {aiHasChanges && (
                  <button
                    type="button"
                    onClick={() => {
                      setAiDraft({});
                      setAiError("");
                    }}
                    className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-5 py-2.5 text-sm font-medium text-slate-300 transition-all duration-300 hover:bg-slate-800 hover:border-slate-600"
                  >
                    <X className="h-4 w-4" />
                    Descartar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void saveAI()}
                  disabled={aiSaving || !aiHasChanges}
                  className="group relative flex items-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-cyan-600 to-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition-all duration-500 hover:shadow-xl hover:shadow-cyan-500/30 hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-lg"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-violet-400 opacity-0 transition-opacity duration-500 group-hover:opacity-20" />
                  {aiSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
                  )}
                  {aiSaving ? "Salvando..." : "Salvar Configuracoes"}
                </button>
                <button
                  type="button"
                  onClick={() => void loadAI()}
                  disabled={aiLoading}
                  className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-300 transition-all duration-300 hover:bg-slate-800 hover:border-cyan-500/30"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${aiLoading ? "animate-spin" : ""}`}
                  />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* WHATSAPP PROFILE TAB */}
      {tab === "whatsapp" && (
        <div className="space-y-6 panel-enter" key="wp-tab">
          {wpLoading && !wp ? (
            <PanelLoadingState
              title="Carregando perfil do WhatsApp"
              description="Consultando foto, identidade da conta e campos do Business Profile."
              icon={MessageSquare}
              accent="emerald"
            />
          ) : !wp && wpError ? (
            <PanelErrorState
              title="Falha ao carregar perfil do WhatsApp"
              description={wpError}
              onRetry={() => void loadWP()}
            />
          ) : (
            <>
              {/* Profile Card */}
              <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-slate-950/95 fade-in-up stagger-1">
                {/* Gradient decoration */}
                <div className="absolute -right-20 -top-20 h-60 w-60 rounded-full bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 blur-3xl transition-all duration-700 hover:from-emerald-500/15 hover:to-cyan-500/15" />
                <div className="absolute -left-20 -bottom-20 h-40 w-40 rounded-full bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 blur-3xl" />

                <div className="relative p-6 md:p-8">
                  <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
                    {/* Profile Picture */}
                    <div className="group relative shrink-0">
                      <div className="relative h-28 w-28 overflow-hidden rounded-2xl border-2 border-slate-700 bg-slate-800 shadow-2xl shadow-black/40 ring-4 ring-slate-800/50 transition-all duration-500 group-hover:border-cyan-500/40 group-hover:ring-cyan-500/10 group-hover:shadow-cyan-500/10">
                        {photoPreview || mergedWp.profilePictureUrl ? (
                          <img
                            src={photoPreview || mergedWp.profilePictureUrl || ""}
                            alt="Foto de perfil"
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                            <User className="h-12 w-12 text-slate-600 transition-all duration-300 group-hover:text-slate-500 group-hover:scale-110" />
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 backdrop-blur-sm transition-all duration-300 group-hover:opacity-100">
                          <button
                            type="button"
                            disabled={photoUploading}
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-xs font-medium text-white transition-all duration-200 hover:bg-white/25"
                          >
                            {photoUploading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Camera className="h-4 w-4" />
                            )}
                            {photoUploading ? "Enviando..." : "Trocar"}
                          </button>
                        </div>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void uploadPhoto(file);
                          e.target.value = "";
                        }}
                      />
                      <div className="absolute -bottom-1 -right-1 rounded-full border-2 border-slate-900 bg-emerald-500 p-1 shadow-lg transition-transform duration-300 group-hover:scale-110">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    </div>

                    {/* Profile Info */}
                    <div className="flex flex-1 flex-col items-center gap-4 text-center sm:items-start sm:text-left">
                      <div>
                        <h3 className="text-xl font-bold text-slate-100 transition-colors duration-300">
                          {mergedWp.verifiedName || "Conta conectada"}
                        </h3>
                        <p className="mt-1 flex items-center justify-center gap-2 text-sm text-slate-400 sm:justify-start">
                          <Phone className="h-3.5 w-3.5" />
                          {mergedWp.displayPhoneNumber || "N/A"}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-semibold transition-all duration-300 hover:scale-105 ${qualityBg} ${qualityColor}`}
                        >
                          <Shield className="h-3 w-3" />
                          Qualidade: {mergedWp.qualityRating || "N/A"}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1 text-xs font-semibold text-slate-300 transition-all duration-300 hover:scale-105 hover:border-slate-600">
                          <User className="h-3 w-3" />
                          Nome: {mergedWp.nameStatus || "N/A"}
                        </span>
                        {mergedWp.vertical && (
                          <span className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-300 transition-all duration-300 hover:scale-105">
                            <Globe className="h-3 w-3" />
                            {mergedWp.vertical}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* About / Description */}
              <SettingsCard title="Informacoes do Perfil" icon={Pencil} color="emerald" stagger={2}>
                <div className="space-y-5">
                  <InputField
                    label="Sobre"
                    icon={MessageSquare}
                    value={mergedWp.about || ""}
                    placeholder="Texto curto de apresentacao (max 139 chars)"
                    maxLength={139}
                    onChange={(v) => setWpDraft((d) => ({ ...d, about: v }))}
                  />

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
                      <MessageSquare className="h-3.5 w-3.5 text-slate-500" />
                      Descricao
                    </label>
                    <textarea
                      className="min-h-[120px] w-full resize-y rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-200 placeholder-slate-600 transition-all duration-300 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none hover:border-slate-600 supabase-scroll"
                      value={mergedWp.description || ""}
                      onChange={(e) =>
                        setWpDraft((d) => ({
                          ...d,
                          description: e.target.value,
                        }))
                      }
                      placeholder="Descricao detalhada do negocio (max 512 chars)"
                      maxLength={512}
                    />
                    <p className="text-xs text-slate-500">
                      {(mergedWp.description || "").length}/512 caracteres
                    </p>
                  </div>
                </div>
              </SettingsCard>

              {/* Contact Info */}
              <SettingsCard title="Contato e Endereco" icon={Mail} color="cyan" stagger={3}>
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <InputField
                    label="Email"
                    icon={Mail}
                    value={mergedWp.email || ""}
                    placeholder="contato@empresa.com"
                    maxLength={128}
                    onChange={(v) => setWpDraft((d) => ({ ...d, email: v }))}
                  />
                  <InputField
                    label="Endereco"
                    icon={MapPin}
                    value={mergedWp.address || ""}
                    placeholder="Rua, Numero - Cidade, Estado"
                    maxLength={256}
                    onChange={(v) => setWpDraft((d) => ({ ...d, address: v }))}
                  />
                </div>
              </SettingsCard>

              {/* Websites */}
              <SettingsCard title="Sites" icon={Globe} color="violet" stagger={4}>
                <div className="space-y-3">
                  {(mergedWp.websites.length > 0
                    ? mergedWp.websites
                    : [""]
                  ).map((url, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <InputField
                        label={`Site ${i + 1}`}
                        icon={ExternalLink}
                        value={url}
                        placeholder="https://seusite.com"
                        maxLength={256}
                        onChange={(v) => {
                          const updated = [
                            ...(mergedWp.websites.length > 0
                              ? mergedWp.websites
                              : [""]),
                          ];
                          updated[i] = v;
                          setWpDraft((d) => ({
                            ...d,
                            websites: updated.filter(
                              (w, idx) => w.trim() || idx === 0
                            ),
                          }));
                        }}
                        className="flex-1"
                      />
                      {i === 0 &&
                        mergedWp.websites.length < 2 && (
                          <button
                            type="button"
                            onClick={() =>
                              setWpDraft((d) => ({
                                ...d,
                                websites: [
                                  ...(mergedWp.websites.length > 0
                                    ? mergedWp.websites
                                    : [""]),
                                  "",
                                ],
                              }))
                            }
                            className="mt-6 rounded-xl border border-dashed border-slate-700 p-2.5 text-slate-400 transition-all duration-300 hover:border-violet-500/40 hover:text-violet-400 hover:bg-violet-500/5"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </button>
                        )}
                    </div>
                  ))}
                  <p className="text-xs text-slate-500">
                    Maximo de 2 sites. Informe links completos.
                  </p>
                </div>
              </SettingsCard>

              {/* Category */}
              <SettingsCard title="Categoria do Negocio" icon={Globe} color="amber" stagger={5}>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
                    <Globe className="h-3.5 w-3.5 text-slate-500" />
                    Vertical
                  </label>
                  <div className="relative">
                    <select
                      className="w-full appearance-none rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3 pr-10 text-sm text-slate-200 transition-all duration-300 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 focus:outline-none hover:border-slate-600"
                      value={mergedWp.vertical || ""}
                      onChange={(e) =>
                        setWpDraft((d) => ({
                          ...d,
                          vertical: e.target.value || null,
                        }))
                      }
                    >
                      <option value="">Selecione...</option>
                      {VERTICALS.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  </div>
                </div>
              </SettingsCard>

              {/* Limits Section */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 fade-in-up stagger-5">
                <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
                  <Shield className="h-4 w-4 text-amber-400" />
                  Limites da Cloud API
                </h4>
                <div className="space-y-2 text-xs text-slate-500">
                  <p className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500/60" />
                    O nome de exibicao precisa ser alterado no WhatsApp Manager e pode exigir aprovacao da Meta.
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500/60" />
                    A WhatsApp Cloud API nao expoe banner/capa da conta conectada.
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500/60" />
                    A Meta valida formato, tamanho e proporcao da imagem no envio.
                  </p>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex items-center justify-end gap-3 fade-in-up stagger-5">
                {wpHasChanges && (
                  <button
                    type="button"
                    onClick={() => {
                      setWpDraft({});
                      setWpError("");
                      setPhotoPreview(null);
                    }}
                    className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-5 py-2.5 text-sm font-medium text-slate-300 transition-all duration-300 hover:bg-slate-800 hover:border-slate-600"
                  >
                    <X className="h-4 w-4" />
                    Descartar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void saveWP()}
                  disabled={wpSaving || !wpHasChanges}
                  className="group relative flex items-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition-all duration-500 hover:shadow-xl hover:shadow-emerald-500/30 hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-lg"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-cyan-400 opacity-0 transition-opacity duration-500 group-hover:opacity-20" />
                  {wpSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
                  )}
                  {wpSaving ? "Salvando..." : "Atualizar Perfil"}
                </button>
                <button
                  type="button"
                  onClick={() => void loadWP()}
                  disabled={wpLoading}
                  className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-300 transition-all duration-300 hover:bg-slate-800 hover:border-emerald-500/30"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${wpLoading ? "animate-spin" : ""}`}
                  />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

// ===== Sub-Components =====

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Brain;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-500 ${
        active
          ? "bg-gradient-to-r from-cyan-500/15 to-violet-500/15 text-cyan-300 shadow-lg shadow-cyan-500/5 border border-cyan-500/20"
          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
      }`}
    >
      <Icon
        className={`h-4 w-4 transition-all duration-500 ${
          active ? "text-cyan-400 scale-110" : ""
        }`}
      />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function StatusCard({
  icon: Icon,
  label,
  value,
  color,
  pulse,
}: {
  icon: typeof Cloud;
  label: string;
  value: string;
  color: string;
  pulse?: boolean;
}) {
  const colorMap: Record<string, string> = {
    cyan: "from-cyan-500/15 to-cyan-500/5 border-cyan-500/20 text-cyan-400",
    emerald:
      "from-emerald-500/15 to-emerald-500/5 border-emerald-500/20 text-emerald-400",
    rose: "from-rose-500/15 to-rose-500/5 border-rose-500/20 text-rose-400",
    violet:
      "from-violet-500/15 to-violet-500/5 border-violet-500/20 text-violet-400",
    amber:
      "from-amber-500/15 to-amber-500/5 border-amber-500/20 text-amber-400",
  };

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br p-4 transition-all duration-500 hover:scale-[1.02] hover:shadow-lg ${colorMap[color] || colorMap.cyan}`}
    >
      <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-white/5 blur-2xl transition-all duration-500 group-hover:bg-white/10" />
      <div className="relative flex items-center gap-3">
        <div className="rounded-lg bg-white/5 p-2 transition-transform duration-300 group-hover:scale-110">
          <Icon className={`h-4 w-4 ${pulse ? "animate-pulse" : ""}`} />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="text-sm font-bold">{value}</p>
        </div>
      </div>
    </div>
  );
}

function SettingsCard({
  title,
  icon: Icon,
  color,
  stagger,
  children,
}: {
  title: string;
  icon: typeof Sparkles;
  color: string;
  stagger?: number;
  children: React.ReactNode;
}) {
  const colorMap: Record<string, string> = {
    cyan: "text-cyan-400 bg-cyan-500/10",
    violet: "text-violet-400 bg-violet-500/10",
    emerald: "text-emerald-400 bg-emerald-500/10",
    amber: "text-amber-400 bg-amber-500/10",
    rose: "text-rose-400 bg-rose-500/10",
  };

  return (
    <div
      className={`group rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm transition-all duration-500 hover:border-slate-700 hover:bg-slate-900/80 fade-in-up ${stagger ? `stagger-${stagger}` : ""}`}
    >
      <h3 className="mb-4 flex items-center gap-3 text-base font-semibold text-slate-200">
        <div
          className={`rounded-lg p-2 transition-transform duration-300 group-hover:scale-110 ${colorMap[color] || colorMap.cyan}`}
        >
          <Icon className="h-4 w-4" />
        </div>
        {title}
      </h3>
      {children}
    </div>
  );
}

function InputField({
  label,
  icon: Icon,
  value,
  placeholder,
  onChange,
  type = "text",
  hint,
  maxLength,
  className,
}: {
  label: string;
  icon: typeof Bot;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  type?: string;
  hint?: string;
  maxLength?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className || ""}`}>
      <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
        <Icon className="h-3.5 w-3.5 text-slate-500" />
        {label}
      </label>
      <input
        type={type}
        className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 transition-all duration-300 focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 focus:outline-none hover:border-slate-600"
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
      {maxLength && (
        <p className="text-xs text-slate-500">
          {value.length}/{maxLength}
        </p>
      )}
    </div>
  );
}

function LoadingStepCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Brain;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/65 p-4">
      <div className="mb-3 flex items-center gap-3">
        <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-2.5">
          <Icon className="h-4 w-4 animate-pulse text-cyan-300" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-100">{title}</p>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full animate-pulse rounded-full bg-slate-800" />
        <div className="h-3 w-4/5 animate-pulse rounded-full bg-slate-800/80" />
        <div className="h-3 w-2/3 animate-pulse rounded-full bg-slate-800/60" />
      </div>
    </div>
  );
}

function PanelLoadingState({
  title,
  description,
  icon: Icon,
  accent,
}: {
  title: string;
  description: string;
  icon: typeof Brain;
  accent: "violet" | "emerald";
}) {
  const accentMap = {
    violet: {
      glow: "from-violet-500/15 via-fuchsia-500/10 to-transparent",
      icon: "border-violet-500/20 bg-violet-500/10 text-violet-300",
      badge: "text-violet-300",
      pulse: "from-violet-500 via-fuchsia-400 to-violet-300",
    },
    emerald: {
      glow: "from-emerald-500/15 via-cyan-500/10 to-transparent",
      icon: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
      badge: "text-emerald-300",
      pulse: "from-emerald-500 via-cyan-400 to-emerald-300",
    },
  }[accent];

  return (
    <div className={`relative overflow-hidden rounded-[26px] border border-slate-800 bg-gradient-to-br ${accentMap.glow} from-slate-900/95 to-slate-950/95 p-6 shadow-2xl shadow-black/20 fade-in-up`}>
      <div className="absolute -right-10 top-0 h-40 w-40 rounded-full bg-white/5 blur-3xl" />
      <div className="relative space-y-5">
        <div className="flex items-center gap-4">
          <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${accentMap.icon}`}>
            <div className="relative">
              <Loader2 className="h-6 w-6 animate-spin opacity-35" />
              <Icon className="absolute inset-0 h-6 w-6" />
            </div>
          </div>
          <div>
            <p className={`text-xs font-semibold uppercase tracking-[0.32em] ${accentMap.badge}`}>
              Carregando
            </p>
            <h3 className="mt-1 text-lg font-semibold text-slate-100">{title}</h3>
          </div>
        </div>
        <p className="max-w-2xl text-sm text-slate-400">{description}</p>
        <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <div className="h-3 w-full animate-pulse rounded-full bg-slate-800" />
          <div className="h-3 w-5/6 animate-pulse rounded-full bg-slate-800/80" />
          <div className="h-3 w-3/5 animate-pulse rounded-full bg-slate-800/60" />
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div className={`h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r ${accentMap.pulse}`} />
          </div>
        </div>
      </div>
    </div>
  );
}

function PanelErrorState({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-[26px] border border-rose-500/20 bg-gradient-to-br from-rose-500/10 via-slate-900/95 to-slate-950/95 p-6 shadow-2xl shadow-rose-950/20 fade-in-up">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10 text-rose-300">
            <Shield className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
            <p className="max-w-2xl text-sm text-slate-400">{description}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm font-medium text-slate-200 transition-all duration-300 hover:border-cyan-500/30 hover:bg-slate-800"
        >
          <RefreshCw className="h-4 w-4" />
          Tentar novamente
        </button>
      </div>
    </div>
  );
}
