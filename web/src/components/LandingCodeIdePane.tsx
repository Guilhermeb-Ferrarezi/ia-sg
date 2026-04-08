import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, CodeXml, Copy, Download, FileCode2, FolderClosed, Search, X } from "lucide-react";

import { cn } from "../lib/utils";
import type { LandingCodeBundle, LandingCodeFile } from "../types/dashboard";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

type ToastType = "success" | "error";

type CodeTreeNode =
  | {
      kind: "folder";
      name: string;
      path: string;
      children: CodeTreeNode[];
    }
  | {
      kind: "file";
      name: string;
      path: string;
      file: LandingCodeFile;
    };

type MutableCodeTreeBranch = {
  folders: Map<string, MutableCodeTreeBranch>;
  files: LandingCodeFile[];
};

function createCodeTreeBranch(): MutableCodeTreeBranch {
  return {
    folders: new Map(),
    files: [],
  };
}

function buildCodeTree(files: LandingCodeFile[]): CodeTreeNode[] {
  const root = createCodeTreeBranch();

  for (const file of files) {
    const segments = file.path.split("/").filter(Boolean);
    if (!segments.length) continue;

    let branch = root;
    for (const segment of segments.slice(0, -1)) {
      if (!branch.folders.has(segment)) {
        branch.folders.set(segment, createCodeTreeBranch());
      }
      branch = branch.folders.get(segment)!;
    }

    branch.files.push(file);
  }

  function walk(branch: MutableCodeTreeBranch, prefix = ""): CodeTreeNode[] {
    const folderNodes = Array.from(branch.folders.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, childBranch]) => {
        const path = prefix ? `${prefix}/${name}` : name;
        return {
          kind: "folder" as const,
          name,
          path,
          children: walk(childBranch, path),
        };
      });

    const fileNodes = [...branch.files]
      .sort((left, right) => left.path.localeCompare(right.path))
      .map((file) => ({
        kind: "file" as const,
        name: file.path.split("/").pop() || file.path,
        path: file.path,
        file,
      }));

    return [...folderNodes, ...fileNodes];
  }

  return walk(root);
}

function collectCodeFolderPaths(nodes: CodeTreeNode[]): string[] {
  const output: string[] = [];

  for (const node of nodes) {
    if (node.kind !== "folder") continue;
    output.push(node.path);
    output.push(...collectCodeFolderPaths(node.children));
  }

  return output;
}

export default function LandingCodeIdePane({
  bundle,
  title,
  onBackToPreview,
  onToast,
}: {
  bundle: LandingCodeBundle;
  title?: string;
  onBackToPreview?: () => void;
  onToast?: (message: string, type: ToastType) => void;
}) {
  const [activeFilePath, setActiveFilePath] = useState(bundle.entryFile || bundle.files[0]?.path || "");
  const [codeSearch, setCodeSearch] = useState("");
  const [expandedCodeFolders, setExpandedCodeFolders] = useState<Record<string, boolean>>({});
  const [openCodeTabs, setOpenCodeTabs] = useState<string[]>([]);

  const bundleFingerprint = useMemo(() => {
    return `${bundle.entryFile}:${bundle.metadata.generatedAt}:${bundle.files.map((file) => file.path).join("|")}`;
  }, [bundle.entryFile, bundle.files, bundle.metadata.generatedAt]);

  const filteredCodeFiles = useMemo(() => {
    const searchTerm = codeSearch.trim().toLowerCase();
    if (!searchTerm) return bundle.files;

    return bundle.files.filter((file) => {
      return [file.path, file.summary, file.code].some((value) => value?.toLowerCase().includes(searchTerm));
    });
  }, [bundle.files, codeSearch]);

  const codeTree = useMemo(() => buildCodeTree(filteredCodeFiles), [filteredCodeFiles]);

  const selectedCodeFile = useMemo(() => {
    return bundle.files.find((file) => file.path === activeFilePath)
      || bundle.files.find((file) => file.path === bundle.entryFile)
      || bundle.files[0]
      || null;
  }, [activeFilePath, bundle.entryFile, bundle.files]);

  const selectedCodeLines = useMemo(() => {
    if (!selectedCodeFile) return [];
    return selectedCodeFile.code.replace(/\r\n/g, "\n").split("\n");
  }, [selectedCodeFile]);

  useEffect(() => {
    setActiveFilePath(bundle.entryFile || bundle.files[0]?.path || "");
    setCodeSearch("");
    setExpandedCodeFolders({});
    setOpenCodeTabs([]);
  }, [bundleFingerprint, bundle.entryFile, bundle.files]);

  useEffect(() => {
    const hasCurrentPath = bundle.files.some((file) => file.path === activeFilePath);
    if (!hasCurrentPath) {
      setActiveFilePath(bundle.entryFile || bundle.files[0]?.path || "");
    }
  }, [activeFilePath, bundle.entryFile, bundle.files]);

  useEffect(() => {
    if (!selectedCodeFile) {
      setOpenCodeTabs([]);
      return;
    }

    setOpenCodeTabs((current) => {
      if (current.includes(selectedCodeFile.path)) return current;
      return [...current.slice(-4), selectedCodeFile.path];
    });
  }, [selectedCodeFile]);

  useEffect(() => {
    const folderPaths = collectCodeFolderPaths(codeTree);
    if (!folderPaths.length) return;

    setExpandedCodeFolders((current) => {
      const next = { ...current };
      for (const path of folderPaths) {
        if (!(path in next) || codeSearch.trim()) {
          next[path] = true;
        }
      }
      return next;
    });
  }, [codeSearch, codeTree]);

  const openCodeFile = useCallback((path: string) => {
    setActiveFilePath(path);
    setOpenCodeTabs((current) => (current.includes(path) ? current : [...current.slice(-4), path]));
  }, []);

  const toggleCodeFolder = useCallback((path: string) => {
    setExpandedCodeFolders((current) => ({
      ...current,
      [path]: !(current[path] ?? true),
    }));
  }, []);

  const closeCodeTab = useCallback((path: string) => {
    setOpenCodeTabs((current) => {
      const nextTabs = current.filter((item) => item !== path);
      if (activeFilePath === path) {
        const fallbackPath = nextTabs[nextTabs.length - 1] || bundle.entryFile || bundle.files[0]?.path || "";
        setActiveFilePath(fallbackPath);
      }
      return nextTabs;
    });
  }, [activeFilePath, bundle.entryFile, bundle.files]);

  const copySelectedCodeFile = useCallback(async () => {
    if (!selectedCodeFile) return;

    try {
      await navigator.clipboard.writeText(selectedCodeFile.code);
      onToast?.("Codigo copiado.", "success");
    } catch {
      onToast?.("Falha ao copiar o codigo.", "error");
    }
  }, [onToast, selectedCodeFile]);

  const downloadSelectedCodeFile = useCallback(() => {
    if (!selectedCodeFile) return;

    const blob = new Blob([selectedCodeFile.code], { type: "text/plain;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = selectedCodeFile.path.split("/").pop() || "landing.tsx";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(blobUrl);
    onToast?.("Arquivo baixado.", "success");
  }, [onToast, selectedCodeFile]);

  const renderCodeTree = (nodes: CodeTreeNode[], depth = 0) => nodes.map((node) => {
    if (node.kind === "folder") {
      const isExpanded = expandedCodeFolders[node.path] ?? true;

      return (
        <div key={node.path}>
          <button
            type="button"
            onClick={() => toggleCodeFolder(node.path)}
            className="flex w-full items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
            style={{ paddingLeft: `${10 + depth * 14}px` }}
          >
            {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-500" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-500" />}
            <FolderClosed className="h-3.5 w-3.5 text-slate-400" />
            <span className="truncate">{node.name}</span>
          </button>
          {isExpanded ? renderCodeTree(node.children, depth + 1) : null}
        </div>
      );
    }

    const isActive = selectedCodeFile?.path === node.path;
    return (
      <button
        key={node.path}
        type="button"
        onClick={() => openCodeFile(node.path)}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-sm transition-colors",
          isActive ? "bg-sky-500/15 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"
        )}
        style={{ paddingLeft: `${28 + depth * 14}px` }}
      >
        <FileCode2 className={cn("h-3.5 w-3.5", isActive ? "text-sky-300" : "text-slate-500")} />
        <span className="truncate">{node.name}</span>
      </button>
    );
  });

  const metadataRows = [
    { label: "entry", value: bundle.entryFile },
    { label: "slug", value: bundle.metadata.slug || "-" },
    { label: "tema", value: bundle.metadata.visualTheme || "-" },
    { label: "gerado", value: bundle.metadata.generatedAt },
  ];

  return (
    <section className="flex h-full min-h-0 flex-col bg-[#111111]">
      <div className="border-b border-white/10 bg-[#161616] px-5 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200">
                <CodeXml className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">Code</p>
                <p className="truncate text-xs text-slate-500">{bundle.metadata.summary}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="secondary">{bundle.source === "fallback" ? "Fallback" : "IA"}</Badge>
              <Badge variant="secondary">{bundle.files.length} arquivo{bundle.files.length === 1 ? "" : "s"}</Badge>
              <Badge variant="secondary">{selectedCodeLines.length} linhas</Badge>
              <Badge variant="secondary">{bundle.metadata.title || title || "Landing"}</Badge>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {onBackToPreview ? (
              <Button type="button" variant="ghost" size="sm" onClick={onBackToPreview}>
                Voltar ao Preview
              </Button>
            ) : null}
            <Button type="button" variant="ghost" size="sm" onClick={() => void copySelectedCodeFile()} disabled={!selectedCodeFile}>
              <Copy className="h-3.5 w-3.5" />
              Copiar
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={downloadSelectedCodeFile} disabled={!selectedCodeFile}>
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 bg-[#111111] lg:grid-cols-[280px_minmax(0,1fr)_320px]">
        <aside className="flex min-h-0 flex-col border-r border-white/10 bg-[#171717]">
          <div className="border-b border-white/10 px-4 py-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={codeSearch}
                onChange={(event) => setCodeSearch(event.target.value)}
                placeholder="Search code"
                className="w-full rounded-xl border border-white/10 bg-[#1f1f1f] py-2 pl-9 pr-3 text-sm text-slate-200 outline-none transition-colors placeholder:text-slate-500 focus:border-sky-400/40"
              />
            </label>
          </div>

          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
            <span>Explorer</span>
            <span>{filteredCodeFiles.length}</span>
          </div>

          <div className="supabase-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {codeTree.length ? (
              <div className="space-y-0.5">{renderCodeTree(codeTree)}</div>
            ) : (
              <div className="px-3 py-4 text-sm text-slate-500">Nenhum arquivo encontrado.</div>
            )}
          </div>
        </aside>

        <div className="flex min-h-0 flex-col bg-[#121212]">
          <div className="border-b border-white/10 bg-[#191919] px-3 py-2">
            <div className="supabase-scroll flex items-center gap-2 overflow-x-auto">
              {openCodeTabs.map((path) => {
                const isActive = selectedCodeFile?.path === path;
                const label = path.split("/").pop() || path;

                return (
                  <div
                    key={path}
                    className={cn(
                      "flex items-center gap-2 rounded-t-xl border px-3 py-2 text-sm",
                      isActive ? "border-white/10 bg-[#1f1f1f] text-white" : "border-transparent bg-[#151515] text-slate-500"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => openCodeFile(path)}
                      className="inline-flex items-center gap-2"
                    >
                      <FileCode2 className="h-3.5 w-3.5" />
                      <span className="max-w-[180px] truncate">{label}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => closeCodeTab(path)}
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white/10 hover:text-white"
                      aria-label={`Fechar aba ${label}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 border-b border-white/10 bg-[#151515] px-5 py-3">
            <div className="min-w-0">
              <p className="truncate font-mono text-sm text-slate-200">{selectedCodeFile?.path || "Sem arquivo selecionado"}</p>
              <p className="mt-1 text-xs text-slate-500">{selectedCodeFile?.summary || "Codigo TSX gerado pela IA para esta landing."}</p>
            </div>
            <div className="hidden shrink-0 items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 md:flex">
              <span>{bundle.framework}</span>
              <span className="h-1 w-1 rounded-full bg-slate-600" />
              <span>{selectedCodeFile?.path.split(".").pop()?.toUpperCase() || "TSX"}</span>
            </div>
          </div>

          <div className="supabase-scroll min-h-0 flex-1 overflow-auto bg-[#111111]">
            <div className="grid min-w-max grid-cols-[auto_minmax(0,1fr)]">
              <div className="select-none border-r border-white/10 bg-[#161616] py-4 text-right text-xs text-slate-600">
                {selectedCodeLines.length ? (
                  selectedCodeLines.map((_, index) => (
                    <div key={`line-${index + 1}`} className="px-4 font-mono leading-6">
                      {index + 1}
                    </div>
                  ))
                ) : (
                  <div className="px-4 font-mono leading-6">1</div>
                )}
              </div>

              <div className="py-4">
                {selectedCodeLines.length ? (
                  selectedCodeLines.map((line, index) => (
                    <div key={`code-${index + 1}`} className="px-5 font-mono text-[13px] leading-6 text-slate-200">
                      <span className="whitespace-pre">{line || " "}</span>
                    </div>
                  ))
                ) : (
                  <div className="px-5 font-mono text-[13px] leading-6 text-slate-500">
                    Nenhum codigo disponivel para esta versao.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <aside className="flex min-h-0 flex-col border-l border-white/10 bg-[#171717]">
          <div className="border-b border-white/10 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Inspect</p>
          </div>

          <div className="supabase-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="space-y-5">
              <section className="rounded-2xl border border-white/10 bg-black/15 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Resumo</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Arquivos</p>
                    <p className="mt-1 text-sm font-semibold text-white">{bundle.files.length}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Componentes</p>
                    <p className="mt-1 text-sm font-semibold text-white">{bundle.usedComponents.length}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Imports</p>
                    <p className="mt-1 text-sm font-semibold text-white">{bundle.usedImports.length}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Origem</p>
                    <p className="mt-1 text-sm font-semibold text-white">{bundle.source === "fallback" ? "Fallback" : "IA"}</p>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-black/15 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Metadados</p>
                <div className="mt-3 space-y-2">
                  {metadataRows.map((row) => (
                    <div key={row.label} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{row.label}</p>
                      <p className="mt-1 break-all text-sm text-slate-200">{row.value}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-black/15 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Arquivos criados</p>
                  <Badge variant="secondary">{bundle.files.length}</Badge>
                </div>
                <div className="mt-3 space-y-2">
                  {bundle.files.map((file) => {
                    const isActive = selectedCodeFile?.path === file.path;
                    return (
                      <button
                        key={file.path}
                        type="button"
                        onClick={() => openCodeFile(file.path)}
                        className={cn(
                          "block w-full rounded-xl border px-3 py-2 text-left transition-colors",
                          isActive
                            ? "border-sky-400/25 bg-sky-500/10"
                            : "border-white/10 bg-white/5 hover:bg-white/10"
                        )}
                      >
                        <p className="break-all font-mono text-xs text-slate-200">{file.path}</p>
                        <p className="mt-1 text-xs text-slate-500">{file.summary || "Arquivo gerado pela IA."}</p>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-black/15 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Componentes usados</p>
                  <Badge variant="secondary">{bundle.usedComponents.length}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {bundle.usedComponents.length ? (
                    bundle.usedComponents.map((componentName) => (
                      <Badge key={componentName} variant="secondary" className="normal-case tracking-normal">
                        {componentName}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">Nenhum componente identificado.</p>
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-black/15 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Imports usados</p>
                  <Badge variant="secondary">{bundle.usedImports.length}</Badge>
                </div>
                <div className="mt-3 space-y-2">
                  {bundle.usedImports.length ? (
                    bundle.usedImports.map((usedImport) => (
                      <div key={usedImport} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                        <p className="break-all font-mono text-xs text-slate-200">{usedImport}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">Nenhum import registrado.</p>
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-black/15 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Tokens do tema</p>
                <div className="mt-3 space-y-2">
                  {Object.entries(bundle.themeTokens).map(([tokenName, tokenValue]) => (
                    <div key={tokenName} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{tokenName}</p>
                        <p className="mt-1 break-all font-mono text-xs text-slate-200">{tokenValue}</p>
                      </div>
                      <span
                        className="h-7 w-7 shrink-0 rounded-lg border border-white/10"
                        style={{ backgroundColor: tokenValue }}
                      />
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
