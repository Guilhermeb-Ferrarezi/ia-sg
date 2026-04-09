import { useEffect, useMemo, useRef, useState } from "react";
import * as React from "react";
import * as ReactDOMClient from "react-dom/client";
import { AlertTriangle, LoaderCircle } from "lucide-react";
import * as LucideIcons from "lucide-react";

import type { LandingCodeBundle } from "../types/dashboard";
import * as AccordionModule from "./ui/accordion";
import * as AlertDialogModule from "./ui/alert-dialog";
import * as AspectRatioModule from "./ui/aspect-ratio";
import * as AvatarModule from "./ui/avatar";
import * as BadgeModule from "./ui/badge";
import * as ButtonModule from "./ui/button";
import * as CardModule from "./ui/card";
import * as CheckboxModule from "./ui/checkbox";
import * as CollapsibleModule from "./ui/collapsible";
import * as ContextMenuModule from "./ui/context-menu";
import * as DirectionModule from "./ui/direction";
import * as DialogModule from "./ui/dialog";
import * as DropdownMenuModule from "./ui/dropdown-menu";
import * as HoverCardModule from "./ui/hover-card";
import * as LabelModule from "./ui/label";
import * as MenubarModule from "./ui/menubar";
import * as NavigationMenuModule from "./ui/navigation-menu";
import * as PopoverModule from "./ui/popover";
import * as ProgressModule from "./ui/progress";
import * as RadioGroupModule from "./ui/radio-group";
import * as ScrollAreaModule from "./ui/scroll-area";
import * as SelectModule from "./ui/select";
import * as SeparatorModule from "./ui/separator";
import * as SheetModule from "./ui/sheet";
import * as SliderModule from "./ui/slider";
import * as SwitchModule from "./ui/switch";
import * as TabsModule from "./ui/tabs";
import * as ToggleModule from "./ui/toggle";
import * as ToggleGroupModule from "./ui/toggle-group";
import * as TooltipModule from "./ui/tooltip";

type RuntimeState = "preparing" | "transpiling" | "ready" | "error";

function buildIframeDocument(styles: string): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${styles}
    <style>
      html, body, #landing-root {
        min-height: 100%;
        margin: 0;
        background: #020617;
      }
      body {
        color: #f8fafc;
        overflow-x: hidden;
      }
    </style>
  </head>
  <body>
    <div id="landing-root"></div>
  </body>
</html>`;
}

function getHeadStylesMarkup(): string {
  if (typeof document === "undefined") return "";
  return Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((node) => node.outerHTML)
    .join("\n");
}

function normalizeBundlePath(value: string): string {
  const segments = value.split("/").filter(Boolean);
  const output: string[] = [];

  for (const segment of segments) {
    if (segment === ".") continue;
    if (segment === "..") {
      output.pop();
      continue;
    }
    output.push(segment);
  }

  return output.join("/");
}

const LANDING_UI_EXTERNAL_MODULES: Record<string, unknown> = {
  "@/components/ui/accordion": AccordionModule,
  "@/components/ui/alert-dialog": AlertDialogModule,
  "@/components/ui/aspect-ratio": AspectRatioModule,
  "@/components/ui/avatar": AvatarModule,
  "@/components/ui/badge": BadgeModule,
  "@/components/ui/button": ButtonModule,
  "@/components/ui/card": CardModule,
  "@/components/ui/checkbox": CheckboxModule,
  "@/components/ui/collapsible": CollapsibleModule,
  "@/components/ui/context-menu": ContextMenuModule,
  "@/components/ui/direction": DirectionModule,
  "@/components/ui/dialog": DialogModule,
  "@/components/ui/dropdown-menu": DropdownMenuModule,
  "@/components/ui/hover-card": HoverCardModule,
  "@/components/ui/label": LabelModule,
  "@/components/ui/menubar": MenubarModule,
  "@/components/ui/navigation-menu": NavigationMenuModule,
  "@/components/ui/popover": PopoverModule,
  "@/components/ui/progress": ProgressModule,
  "@/components/ui/radio-group": RadioGroupModule,
  "@/components/ui/scroll-area": ScrollAreaModule,
  "@/components/ui/select": SelectModule,
  "@/components/ui/separator": SeparatorModule,
  "@/components/ui/sheet": SheetModule,
  "@/components/ui/slider": SliderModule,
  "@/components/ui/switch": SwitchModule,
  "@/components/ui/tabs": TabsModule,
  "@/components/ui/toggle": ToggleModule,
  "@/components/ui/toggle-group": ToggleGroupModule,
  "@/components/ui/tooltip": TooltipModule,
};

export default function LandingCodePreviewHost({
  bundle,
  onPrimaryAction,
}: {
  bundle: LandingCodeBundle;
  onPrimaryAction?: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const requestIdRef = useRef(0);
  const [frameReady, setFrameReady] = useState(false);
  const [runtimeState, setRuntimeState] = useState<RuntimeState>("preparing");
  const [runtimeError, setRuntimeError] = useState("");
  const stylesMarkup = useMemo(() => getHeadStylesMarkup(), []);
  const srcDoc = useMemo(() => buildIframeDocument(stylesMarkup), [stylesMarkup]);

  useEffect(() => {
    setFrameReady(false);
    setRuntimeState("preparing");
    setRuntimeError("");
  }, [srcDoc]);

  useEffect(() => {
    let cancelled = false;

    async function renderBundle() {
      if (!frameReady || !iframeRef.current?.contentWindow || !iframeRef.current.contentDocument) return;

      const iframeWindow = iframeRef.current.contentWindow;
      const iframeDocument = iframeRef.current.contentDocument;
      const rootElement = iframeDocument.getElementById("landing-root");
      if (!rootElement) return;

      setRuntimeState("transpiling");
      setRuntimeError("");

      try {
        const ts = await import("typescript");
        if (cancelled) return;

        const transpiledFiles = Object.fromEntries(
          bundle.files.map((file) => [
            normalizeBundlePath(file.path),
            ts.transpileModule(file.code, {
              compilerOptions: {
                target: ts.ScriptTarget.ES2020,
                module: ts.ModuleKind.CommonJS,
                jsx: ts.JsxEmit.React,
                esModuleInterop: true,
                allowSyntheticDefaultImports: true,
              },
              fileName: file.path,
            }).outputText,
          ])
        );

        requestIdRef.current += 1;
        const requestId = requestIdRef.current;

        iframeWindow.__LANDING_PREVIEW_RUNTIME = {
          requestId,
          entryFile: normalizeBundlePath(bundle.entryFile),
          files: transpiledFiles,
          React,
          ReactDOM: ReactDOMClient,
          props: {
            onPrimaryAction,
          },
          externalModules: {
            react: { ...React, default: React },
            ...LANDING_UI_EXTERNAL_MODULES,
            "lucide-react": LucideIcons,
          },
        };

        (iframeWindow as Window & { eval: (code: string) => void }).eval(`
          (() => {
            const runtime = window.__LANDING_PREVIEW_RUNTIME;
            const moduleCache = {};
            const RESPONSIVE_BREAKPOINTS = {
              sm: "640px",
              md: "768px",
              lg: "1024px",
              xl: "1280px",
              "2xl": "1536px",
            };
            const PSEUDO_VARIANTS = {
              hover: ":hover",
              focus: ":focus",
              "focus-visible": ":focus-visible",
              active: ":active",
              visited: ":visited",
              disabled: ":disabled",
            };

            const normalizePath = (value) => {
              const segments = value.split("/").filter(Boolean);
              const output = [];
              for (const segment of segments) {
                if (segment === ".") continue;
                if (segment === "..") {
                  output.pop();
                  continue;
                }
                output.push(segment);
              }
              return output.join("/");
            };

            const dirname = (value) => {
              const segments = normalizePath(value).split("/").filter(Boolean);
              segments.pop();
              return segments.join("/");
            };

            const resolveRelativeImport = (fromPath, request) => {
              const baseDir = dirname(fromPath);
              return normalizePath([baseDir, request].filter(Boolean).join("/"));
            };

            const requireModule = (request, fromPath) => {
              if (runtime.externalModules[request]) {
                return runtime.externalModules[request];
              }

              if (request.startsWith("./") || request.startsWith("../")) {
                return executeModule(resolveRelativeImport(fromPath, request));
              }

              throw new Error("Import nao permitido no preview: " + request);
            };

            const executeModule = (filePath) => {
              if (moduleCache[filePath]) {
                return moduleCache[filePath].exports;
              }

              const source = runtime.files[filePath];
              if (!source) {
                throw new Error("Arquivo nao encontrado no bundle: " + filePath);
              }

              const module = { exports: {} };
              moduleCache[filePath] = module;
              const localRequire = (request) => requireModule(request, filePath);
              const fn = new Function("require", "module", "exports", source);
              fn(localRequire, module, module.exports);
              return module.exports;
            };

            const splitVariants = (token) => {
              const variants = [];
              let current = "";
              let bracketDepth = 0;

              for (const char of token) {
                if (char === "[" && bracketDepth >= 0) bracketDepth += 1;
                if (char === "]" && bracketDepth > 0) bracketDepth -= 1;

                if (char === ":" && bracketDepth === 0) {
                  variants.push(current);
                  current = "";
                  continue;
                }

                current += char;
              }

              return {
                variants,
                utilityToken: current,
              };
            };

            const decodeArbitraryValue = (value) =>
              value
                .replace(/\\\\_/g, "\\u0000")
                .replace(/_/g, " ")
                .replace(/\\u0000/g, "_");

            const looksLikeColor = (value) => {
              const normalized = value.trim();
              if (!normalized) return false;
              if (/^-?\\d/.test(normalized)) return false;
              return /^(#|rgb\\(|rgba\\(|hsl\\(|hsla\\(|oklch\\(|oklab\\(|lab\\(|lch\\(|color\\(|var\\(|white$|black$|transparent$|currentColor$|[a-z]+$)/i.test(normalized);
            };

            const buildArbitraryDeclarations = (utility, rawValue) => {
              const value = decodeArbitraryValue(rawValue);
              const isColor = looksLikeColor(value);

              switch (utility) {
                case "bg":
                  if (/gradient\\(|url\\(/i.test(value)) return "background-image:" + value + ";";
                  return "background-color:" + value + ";";
                case "text":
                  return isColor ? "color:" + value + ";" : "font-size:" + value + ";";
                case "border":
                  return isColor ? "border-color:" + value + ";" : "border-width:" + value + ";";
                case "ring":
                  return isColor ? "--tw-ring-color:" + value + ";" : "--tw-ring-shadow:0 0 0 " + value + " var(--tw-ring-color);";
                case "shadow":
                  return "box-shadow:" + value + ";";
                case "rounded":
                  return "border-radius:" + value + ";";
                case "tracking":
                  return "letter-spacing:" + value + ";";
                case "leading":
                  return "line-height:" + value + ";";
                case "w":
                  return "width:" + value + ";";
                case "h":
                  return "height:" + value + ";";
                case "min-w":
                  return "min-width:" + value + ";";
                case "min-h":
                  return "min-height:" + value + ";";
                case "max-w":
                  return "max-width:" + value + ";";
                case "max-h":
                  return "max-height:" + value + ";";
                case "z":
                  return "z-index:" + value + ";";
                case "opacity":
                  return "opacity:" + value + ";";
                case "grid-cols":
                  return "grid-template-columns:" + value + ";";
                case "grid-rows":
                  return "grid-template-rows:" + value + ";";
                default:
                  return null;
              }
            };

            const compileArbitraryUtilityRule = (token) => {
              const { variants, utilityToken } = splitVariants(token);
              const utilityMatch = utilityToken.match(/^([a-z-]+)-\\[(.+)\\]$/);
              if (!utilityMatch) return null;

              const declarations = buildArbitraryDeclarations(utilityMatch[1], utilityMatch[2]);
              if (!declarations) return null;

              let pseudoSelector = "";
              let mediaQuery = "";

              for (const variant of variants) {
                if (PSEUDO_VARIANTS[variant]) {
                  pseudoSelector += PSEUDO_VARIANTS[variant];
                  continue;
                }

                if (RESPONSIVE_BREAKPOINTS[variant]) {
                  mediaQuery = "@media (min-width: " + RESPONSIVE_BREAKPOINTS[variant] + ")";
                  continue;
                }

                return null;
              }

              const selector = "." + CSS.escape(token) + pseudoSelector;
              const rule = selector + "{" + declarations + "}";
              return mediaQuery ? mediaQuery + "{" + rule + "}" : rule;
            };

            const ensureArbitraryStyleElement = () => {
              let styleElement = document.getElementById("landing-preview-arbitrary-utilities");
              if (!styleElement) {
                styleElement = document.createElement("style");
                styleElement.id = "landing-preview-arbitrary-utilities";
                document.head.appendChild(styleElement);
              }
              return styleElement;
            };

            const collectClassTokens = (root) => {
              const tokens = new Set();

              const registerElement = (element) => {
                if (!(element instanceof Element) || !element.classList?.length) return;
                for (const className of element.classList) {
                  if (className) tokens.add(className);
                }
              };

              registerElement(root);
              root.querySelectorAll("[class]").forEach(registerElement);
              return tokens;
            };

            const syncArbitraryUtilityStyles = (root) => {
              const rules = [];
              for (const token of collectClassTokens(root)) {
                const rule = compileArbitraryUtilityRule(token);
                if (rule) rules.push(rule);
              }

              ensureArbitraryStyleElement().textContent = rules.join("\\n");
            };

            const entry = executeModule(runtime.entryFile);
            const Component = entry.default || entry.LandingPage || entry;
            if (typeof Component !== "function") {
              throw new Error("O bundle nao exportou um componente React valido.");
            }

            const mountNode = document.getElementById("landing-root");
            if (!mountNode) {
              throw new Error("Root do preview nao encontrado.");
            }

            if (window.__LANDING_PREVIEW_ROOT) {
              try {
                window.__LANDING_PREVIEW_ROOT.unmount();
              } catch {}
            }

            window.__LANDING_PREVIEW_ROOT = runtime.ReactDOM.createRoot(mountNode);
            window.__LANDING_PREVIEW_ROOT.render(runtime.React.createElement(Component, runtime.props));

            queueMicrotask(() => {
              syncArbitraryUtilityStyles(mountNode);

              if (window.__LANDING_PREVIEW_STYLE_OBSERVER) {
                try {
                  window.__LANDING_PREVIEW_STYLE_OBSERVER.disconnect();
                } catch {}
              }

              const observer = new MutationObserver(() => {
                syncArbitraryUtilityStyles(mountNode);
              });

              observer.observe(mountNode, {
                subtree: true,
                childList: true,
                attributes: true,
                attributeFilter: ["class"],
              });

              window.__LANDING_PREVIEW_STYLE_OBSERVER = observer;
            });
          })();
        `);

        if (cancelled || requestId !== requestIdRef.current) return;
        setRuntimeState("ready");
      } catch (err) {
        if (cancelled) return;
        setRuntimeState("error");
        setRuntimeError(err instanceof Error ? err.message : "Falha ao renderizar bundle React.");
      }
    }

    void renderBundle();

    return () => {
      cancelled = true;
    };
  }, [bundle, frameReady, onPrimaryAction]);

  return (
    <div className="relative min-h-full bg-[#020617]">
      {runtimeState !== "ready" ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#020617]">
          {runtimeState === "error" ? (
            <div className="mx-6 max-w-xl rounded-[28px] border border-rose-400/20 bg-rose-500/10 p-6 text-left text-white shadow-[0_24px_80px_rgba(2,6,23,0.55)]">
              <div className="flex items-center gap-3 text-rose-200">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-300/20 bg-rose-400/10">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-rose-200/80">Falha no preview</p>
                  <p className="mt-1 text-sm font-semibold text-white">O bundle React foi gerado, mas o canvas nao conseguiu renderizar.</p>
                </div>
              </div>
              <p className="mt-4 rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 font-mono text-xs leading-6 text-rose-50/90">
                {runtimeError || "Erro desconhecido no runtime do preview."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 text-center text-white">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-200">
                <LoaderCircle className="h-6 w-6 animate-spin" />
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-200/75">Renderizando preview</p>
                <p className="mt-2 text-sm text-slate-300">
                  {runtimeState === "preparing" ? "Preparando o iframe..." : "Compilando o bundle React..."}
                </p>
              </div>
            </div>
          )}
        </div>
      ) : null}
      <iframe
        ref={iframeRef}
        title={bundle.metadata.title}
        sandbox="allow-scripts allow-same-origin"
        srcDoc={srcDoc}
        onLoad={() => setFrameReady(true)}
        className="min-h-[900px] w-full border-0 bg-transparent"
      />
    </div>
  );
}

declare global {
  interface Window {
    __LANDING_PREVIEW_ROOT?: {
      unmount?: () => void;
    };
    __LANDING_PREVIEW_STYLE_OBSERVER?: {
      disconnect?: () => void;
    };
  }

  interface Window {
    __LANDING_PREVIEW_RUNTIME?: {
      requestId: number;
      entryFile: string;
      files: Record<string, string>;
      React: typeof React;
      ReactDOM: typeof ReactDOMClient;
      props: {
        onPrimaryAction?: () => void;
      };
      externalModules: Record<string, unknown>;
    };
  }
}
