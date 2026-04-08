import { useEffect, useMemo, useRef, useState } from "react";
import * as React from "react";
import * as ReactDOMClient from "react-dom/client";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CodeXml,
  Globe,
  History,
  LoaderCircle,
  MessageSquare,
  MonitorPlay,
  PanelsTopLeft,
  Sparkles,
} from "lucide-react";

import type { LandingCodeBundle } from "../types/dashboard";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import * as BadgeModule from "./ui/badge";
import * as ButtonModule from "./ui/button";
import * as CardModule from "./ui/card";
import * as DialogModule from "./ui/dialog";
import * as DropdownMenuModule from "./ui/dropdown-menu";
import * as SheetModule from "./ui/sheet";
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
            "@/components/ui/button": ButtonModule,
            "@/components/ui/badge": BadgeModule,
            "@/components/ui/card": CardModule,
            "@/components/ui/dialog": DialogModule,
            "@/components/ui/dropdown-menu": DropdownMenuModule,
            "@/components/ui/sheet": SheetModule,
            "@/components/ui/tooltip": TooltipModule,
            "lucide-react": {
              AlertTriangle,
              ArrowRight,
              CheckCircle2,
              CodeXml,
              Globe,
              History,
              LoaderCircle,
              MessageSquare,
              MonitorPlay,
              PanelsTopLeft,
              Sparkles,
            },
          },
        };

        (iframeWindow as Window & { eval: (code: string) => void }).eval(`
          (() => {
            const runtime = window.__LANDING_PREVIEW_RUNTIME;
            const moduleCache = {};

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
      <iframe
        ref={iframeRef}
        title={bundle.metadata.title}
        sandbox="allow-scripts allow-same-origin"
        srcDoc={srcDoc}
        onLoad={() => setFrameReady(true)}
        className="min-h-[900px] w-full border-0 bg-transparent"
      />

      {runtimeState !== "ready" ? (
        <div className="pointer-events-none absolute inset-0 flex items-start justify-end p-4">
          <Card className="max-w-md border-slate-700/80 bg-slate-950/88 shadow-2xl backdrop-blur-xl">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Badge variant={runtimeState === "error" ? "outline" : "secondary"}>
                  {runtimeState === "error" ? "Preview com erro" : "Sandbox ativo"}
                </Badge>
                <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                  {bundle.source === "fallback" ? "Bundle fallback" : "Bundle IA"}
                </span>
              </div>
              <CardTitle className="text-xl">
                {runtimeState === "error" ? "Nao foi possivel executar o bundle" : "Preparando preview React"}
              </CardTitle>
              <CardDescription>
                {runtimeState === "error"
                  ? runtimeError
                  : "Compilando o TSX gerado pela IA e renderizando a landing no iframe isolado."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {bundle.usedComponents.slice(0, 6).map((componentName) => (
                <Badge key={componentName} variant="secondary">
                  {componentName}
                </Badge>
              ))}
              {!bundle.usedComponents.length ? (
                <Badge variant="secondary">Sem componentes mapeados</Badge>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

declare global {
  interface Window {
    __LANDING_PREVIEW_ROOT?: {
      unmount?: () => void;
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
