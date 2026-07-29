import { useMemo, useState, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronRight, ExternalLink, FileText, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/factory/badges";
import { MarkdownDoc } from "@/components/docs/MarkdownDoc";
import { cn } from "@/lib/utils";
import {
  DEFAULT_DOCS_PAGE_ID,
  DOCS_SITE_SECTIONS,
  LEGACY_REPO_DOCS,
  docsMarkdownForPath,
  findDocsPage,
  resolveDocsPageId,
  resolveDocsPageByHref,
} from "@/lib/docsSiteConfig";

export function DocsSiteBrowser(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPageId = resolveDocsPageId(searchParams.get("doc"));
  const [activePageId, setActivePageId] = useState(requestedPageId);
  const [filter, setFilter] = useState("");

  const activePage = findDocsPage(activePageId) ?? findDocsPage(DEFAULT_DOCS_PAGE_ID)!;
  const markdown = useMemo(() => docsMarkdownForPath(activePage.path), [activePage.path]);

  useEffect(() => {
    setActivePageId(requestedPageId);
  }, [requestedPageId]);

  const selectPage = useCallback(
    (pageId: string) => {
      const resolvedPageId = resolveDocsPageId(pageId);
      setActivePageId(resolvedPageId);
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set("doc", resolvedPageId);
        return next;
      });
    },
    [setSearchParams]
  );

  const resolveInternalLink = useCallback(
    (href: string) => resolveDocsPageByHref(href, activePage.path),
    [activePage.path]
  );

  const handleDocClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const target = (event.target as HTMLElement).closest("[data-docs-page]");
      if (!target) return;
      event.preventDefault();
      const pageId = target.getAttribute("data-docs-page");
      if (pageId) selectPage(pageId);
    },
    [selectPage]
  );

  const filteredSections = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return DOCS_SITE_SECTIONS;
    return DOCS_SITE_SECTIONS.map((section) => ({
      ...section,
      pages: section.pages.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.path.toLowerCase().includes(q)
      ),
    })).filter((s) => s.pages.length > 0);
  }, [filter]);

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 gap-0 px-6 pb-6">
      {/* Sidebar — Tessl-style section nav */}
      <aside className="hidden w-[260px] shrink-0 flex-col border-r border-line pr-4 lg:flex">
        <div className="relative mb-3">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter docs…"
            aria-label="Filter documentation"
            className="h-8 w-full rounded-lg border border-line bg-surface-1 pl-8 pr-2 text-[12.5px] text-ink placeholder:text-ink-muted"
          />
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto space-y-5 pb-4">
          {filteredSections.map((section) => {
            const Icon = section.icon;
            return (
              <div key={section.id}>
                <div className="mb-1.5 flex items-center gap-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                  <Icon size={12} strokeWidth={1.8} aria-hidden />
                  {section.label}
                </div>
                <ul className="space-y-0.5">
                  {section.pages.map((page) => (
                    <li key={page.id}>
                      <button
                        type="button"
                        onClick={() => selectPage(page.id)}
                        className={cn(
                          "flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors duration-150",
                          page.id === activePageId
                            ? "bg-act/15 font-medium text-act"
                            : "text-ink-secondary hover:bg-surface-2 hover:text-ink"
                        )}
                      >
                        <ChevronRight
                          size={12}
                          className={cn("shrink-0 opacity-0", page.id === activePageId && "opacity-100")}
                          aria-hidden
                        />
                        <span className="truncate">{page.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-line pt-3">
          <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            Repo docs
          </p>
          <ul className="max-h-40 space-y-0.5 overflow-y-auto">
            {LEGACY_REPO_DOCS.slice(0, 5).map((doc) => (
              <li key={doc.path}>
                <a
                  href={`/${doc.path}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-ink-muted hover:bg-surface-2 hover:text-ink-secondary"
                >
                  <FileText size={11} aria-hidden />
                  <span className="truncate">{doc.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Main content */}
      <div className="min-w-0 flex-1 overflow-y-auto pl-0 lg:pl-6">
        {/* Mobile page picker */}
        <div className="mb-4 lg:hidden">
          <label htmlFor="docs-page-select" className="sr-only">
            Documentation page
          </label>
          <select
            id="docs-page-select"
            value={activePageId}
            onChange={(e) => selectPage(e.target.value)}
            className="h-9 w-full rounded-lg border border-line bg-surface-1 px-3 text-[13px] text-ink"
          >
            {DOCS_SITE_SECTIONS.flatMap((s) =>
              s.pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {s.label}: {p.title}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StatusBadge tone="neutral">docs.tessl.io-style</StatusBadge>
          <StatusBadge tone="info">Software Factory</StatusBadge>
          <a
            href="https://docs.tessl.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 text-[12.5px] text-ink-muted hover:text-ink-secondary"
          >
            Tessl reference
            <ExternalLink size={12} aria-hidden />
          </a>
        </div>

        {markdown ? (
          <div onClick={handleDocClick}>
            <MarkdownDoc markdown={markdown} resolveInternalLink={resolveInternalLink} />
          </div>
        ) : (
          <Card className="p-6 text-[13.5px] text-ink-secondary">
            Could not load <code className="font-mono">{activePage.path}.md</code>. Ensure{" "}
            <code className="font-mono">docs/site/</code> exists in the monorepo.
          </Card>
        )}

        <section className="mt-10 border-t border-line pt-6">
          <h2 className="mb-3 text-[15px] font-semibold text-ink">Implementation docs (repo root)</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {LEGACY_REPO_DOCS.map((doc) => (
              <a
                key={doc.path}
                href={`/${doc.path}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 rounded-xl border border-line bg-surface-1 px-3 py-2.5 transition-colors hover:border-line-strong hover:bg-surface-2"
              >
                <FileText size={15} className="shrink-0 text-ink-muted group-hover:text-ink-secondary" aria-hidden />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-ink">{doc.title}</p>
                  <p className="truncate text-[12px] text-ink-muted">{doc.description}</p>
                </div>
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
