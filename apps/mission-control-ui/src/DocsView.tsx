import { useState, useRef, useEffect, useCallback } from "react";
import { ExternalLink, FileText, ChevronRight, Search, MessageSquare, BookOpen, Loader2, Zap, RotateCcw, Send, X, FolderGit2, Bot, NotebookPen, Boxes, Package, type LucideIcon } from "lucide-react";
import { useAction, useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "./components/factory/badges";
import { PageHeader } from "./components/PageHeader";
import { TabBar } from "./components/TabBar";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// DATA
// ---------------------------------------------------------------------------

const DOC_LINKS = [
  { title: "Design DNA",           path: "design.md", description: "Shared design contract" },
  { title: "PRD V2",               path: "docs/PRD_V2.md", description: "Product requirements" },
  { title: "App Flow",             path: "docs/APP_FLOW.md", description: "Application architecture" },
  { title: "Backend Structure",    path: "docs/BACKEND_STRUCTURE.md", description: "Backend overview" },
  { title: "Frontend Guidelines",  path: "docs/FRONTEND_GUIDELINES.md", description: "UI/UX standards" },
  { title: "Tech Stack",           path: "docs/TECH_STACK.md", description: "Technologies used" },
  { title: "Quick Start",          path: "docs/guides/QUICK_START_NOW.md", description: "Get up and running" },
  { title: "Runbook",              path: "docs/runbook/RUNBOOK.md", description: "Operations runbook" },
  { title: "Implementation Plan",  path: "docs/planning/IMPLEMENTATION_PLAN.md", description: "Implementation roadmap" },
  { title: "Architecture",         path: "docs/ARCHITECTURE.md", description: "System architecture" },
  { title: "Agent Guide",          path: "docs/AGENT_GUIDE.md", description: "Working with agents" },
  { title: "Creating Plugins",     path: "docs/CREATING_PLUGINS.md", description: "Skills, rules, and registry packages" },
  { title: "Context Manifests",    path: "docs/CONTEXT_MANIFESTS.md", description: "Lock and install context packages" },
  { title: "Creating Workflows",   path: "docs/CREATING_WORKFLOWS.md", description: "Custom multi-agent workflows" },
  { title: "Security Audit",       path: "docs/SECURITY_AUDIT.md", description: "Security review" },
  { title: "Decisions",            path: "docs/DECISIONS.md", description: "Architecture decisions" },
];

interface QuickLinkItem {
  label: string;
  href: string;
  category: string;
}

const QUICK_LINK_CATEGORY_ICONS: Record<string, LucideIcon> = {
  Project: FolderGit2,
  "AI Tools": Bot,
  Tessl: Package,
  Workspace: NotebookPen,
  Infra: Boxes,
};

const QUICK_LINKS: QuickLinkItem[] = [
  // Project
  { label: "GitHub Repository",         href: "https://github.com/jaydubya818/MissionControl", category: "Project" },
  { label: "Vercel Dashboard",          href: "https://vercel.com/jaydubya818/mission-control-mission-control-ui",  category: "Project" },
  { label: "Convex Dashboard",          href: "https://dashboard.convex.dev", category: "Project" },
  { label: "Taskmaster Tasks",          href: "https://github.com/jaydubya818/MissionControl/blob/main/.taskmaster/tasks/tasks.json", category: "Project" },

  // AI Tools
  { label: "Claude (claude.ai)",        href: "https://claude.ai", category: "AI Tools" },
  { label: "Claude API Docs",           href: "https://docs.anthropic.com/en/api/getting-started", category: "AI Tools" },
  { label: "Claude Model Reference",    href: "https://docs.anthropic.com/en/docs/about-claude/models/overview", category: "AI Tools" },
  { label: "Codex (OpenAI)",            href: "https://platform.openai.com/docs/guides/code", category: "AI Tools" },
  { label: "OpenAI Platform",           href: "https://platform.openai.com", category: "AI Tools" },
  { label: "OpenAI API Docs",           href: "https://platform.openai.com/docs/api-reference", category: "AI Tools" },
  { label: "Cursor IDE",                href: "cursor://", category: "AI Tools" },
  { label: "Cursor Docs",               href: "https://docs.cursor.com", category: "AI Tools" },

  // Tessl (context package lifecycle reference)
  { label: "Tessl Docs",                href: "https://docs.tessl.io/", category: "Tessl" },
  { label: "Creating Plugins",          href: "https://docs.tessl.io/create/creating-plugins", category: "Tessl" },
  { label: "Creating Skills",           href: "https://docs.tessl.io/create/creating-skills", category: "Tessl" },
  { label: "Developing Plugins Locally", href: "https://docs.tessl.io/create/developing-plugins-locally", category: "Tessl" },
  { label: "Distributing via Registry", href: "https://docs.tessl.io/distribute/distributing-via-registry", category: "Tessl" },
  { label: "Tessl Glossary",            href: "https://docs.tessl.io/reference/glossary", category: "Tessl" },

  // Workspace
  { label: "Notion Workspace",          href: "https://notion.so", category: "Workspace" },
  { label: "Obsidian Vault",            href: "obsidian://open", category: "Workspace" },

  // Infra & Services
  { label: "Convex Docs",               href: "https://docs.convex.dev", category: "Infra" },
  { label: "Convex Vector Search",      href: "https://docs.convex.dev/search/vector-search", category: "Infra" },
  { label: "Tailwind CSS Docs",         href: "https://tailwindcss.com/docs", category: "Infra" },
  { label: "shadcn/ui Components",      href: "https://ui.shadcn.com/docs/components", category: "Infra" },
  { label: "Lucide Icons",              href: "https://lucide.dev/icons", category: "Infra" },
  { label: "Telegram Bot API",          href: "https://core.telegram.org/bots/api", category: "Infra" },
];

// ---------------------------------------------------------------------------
// TABS
// ---------------------------------------------------------------------------

const TABS = [
  { id: "knowledge", label: "Knowledge" },
  { id: "search",    label: "Search" },
  { id: "chat",      label: "Chat with Repo" },
];

// ---------------------------------------------------------------------------
// KNOWLEDGE TAB
// ---------------------------------------------------------------------------

function KnowledgeTab() {
  const categories = Array.from(new Set(QUICK_LINKS.map((l) => l.category)));

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-6 py-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
        <Card className="p-5">
          <div className="text-[15px] font-semibold text-ink">The operating handbook for Mission Control</div>
          <div className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-ink-secondary">
            Keep the mission, architecture, and runbooks close to the operator surface so every decision is grounded in the same source of truth.
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <StatusBadge tone="neutral">{DOC_LINKS.length} curated docs</StatusBadge>
            <StatusBadge tone="neutral">{QUICK_LINKS.length} linked tools</StatusBadge>
          </div>
        </Card>

        <Card className="p-5">
          <div className="text-[15px] font-semibold text-ink">Use this surface for stable context, not transient chatter.</div>
          <div className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-ink-secondary">
            <div className="rounded-lg border border-line bg-surface-2 px-3 py-3">
              Open docs first when you need trusted project context or process guidance.
            </div>
            <div className="rounded-lg border border-line bg-surface-2 px-3 py-3">
              Use search when you know the question but not the source document, then use repo chat for follow-up.
            </div>
          </div>
        </Card>
      </div>

      {/* Project docs grid */}
      <div>
        <h2 className="mb-3 text-[19px] font-semibold tracking-tight text-ink">Project Docs</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {DOC_LINKS.map((doc) => (
            <a
              key={doc.path}
              href={`/${doc.path}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block group"
            >
              <Card className="p-4 h-full flex items-center gap-3 cursor-pointer group-hover:bg-surface-2">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-secondary">
                  <FileText size={16} strokeWidth={1.7} aria-hidden />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-semibold text-ink truncate">{doc.title}</p>
                  <p className="text-[12.5px] text-ink-muted truncate">{doc.description}</p>
                </div>
                <ChevronRight size={14} strokeWidth={1.7} aria-hidden className="text-ink-muted group-hover:text-ink-secondary transition-colors duration-150 shrink-0" />
              </Card>
            </a>
          ))}
        </div>
      </div>

      {/* Quick links grouped by category */}
      <div>
        <h2 className="mb-3 text-[19px] font-semibold tracking-tight text-ink">Quick Links</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {categories.map((cat) => (
            <div key={cat}>
              <p className="mb-2 px-1 text-[12.5px] font-medium text-ink-muted">{cat}</p>
              <Card className="divide-y divide-line">
                {QUICK_LINKS.filter((l) => l.category === cat).map((link) => (
                  (() => {
                    const LinkIcon = QUICK_LINK_CATEGORY_ICONS[link.category] ?? FileText;
                    return (
                      <a
                        key={link.href}
                        href={link.href}
                        target={link.href.startsWith("obsidian://") || link.href.startsWith("cursor://") ? "_self" : "_blank"}
                        rel="noopener noreferrer"
                        className="flex items-center justify-between px-4 py-2.5 hover:bg-surface-2 transition-colors duration-150 group"
                      >
                        <span className="flex items-center gap-3 text-[13.5px] font-medium text-ink">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-secondary">
                            <LinkIcon size={15} strokeWidth={1.7} aria-hidden />
                          </span>
                          {link.label}
                        </span>
                        <ExternalLink size={14} strokeWidth={1.7} aria-hidden className="text-ink-muted group-hover:text-ink-secondary transition-colors duration-150 shrink-0" />
                      </a>
                    );
                  })()
                ))}
              </Card>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SEARCH TAB
// ---------------------------------------------------------------------------

interface SearchResult {
  _id: string;
  source: string;
  title: string;
  content: string;
  chunkIndex: number;
  score: number;
}

function SearchTab() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [indexStatus, setIndexStatus] = useState<string | null>(null);

  const totalChunks = useQuery(api.knowledge.getTotalChunks);
  const indexedSources = useQuery(api.knowledge.getIndexedSources);

  const semanticSearch = useAction(api.knowledge.semanticSearch);
  const indexAllDocs = useAction(api.knowledge.indexAllDocs);

  const isIndexed = (totalChunks ?? 0) > 0;

  const handleSearch = useCallback(async () => {
    if (!query.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await semanticSearch({ query: query.trim(), limit: 8 });
      setResults((res as SearchResult[]) ?? []);
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [query, loading, semanticSearch]);

  const handleIndex = async () => {
    setIndexing(true);
    setIndexStatus("Indexing docs…");
    try {
      const results = await indexAllDocs({});
      const succeeded = (results as { chunks: number; error?: string }[]).filter((r) => !r.error).length;
      setIndexStatus(`Indexed ${succeeded} documents successfully.`);
    } catch (e) {
      setIndexStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIndexing(false);
    }
  };

  function highlight(text: string, q: string) {
    if (!q.trim()) return text;
    const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    return text.replace(regex, '<mark class="bg-info-soft text-info-accent rounded px-0.5">$1</mark>');
  }

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-6 py-6">
      {/* Index status */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={cn("h-2 w-2 rounded-full", isIndexed ? "bg-ok" : "bg-warn")} />
            <div>
              <p className="text-[13.5px] font-medium text-ink">
                {isIndexed
                  ? `${totalChunks} chunks indexed across ${indexedSources?.length ?? 0} documents`
                  : "Knowledge base not indexed yet"}
              </p>
              <p className="text-[12.5px] text-ink-muted">
                {isIndexed ? "Semantic search is ready" : "Index docs to enable semantic search"}
              </p>
            </div>
          </div>
          <button
            onClick={handleIndex}
            disabled={indexing}
            className="flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-[13px] font-medium text-ink-secondary transition-colors duration-150 hover:border-line-strong hover:text-ink disabled:opacity-50"
          >
            {indexing ? <Loader2 size={14} strokeWidth={1.7} className="animate-spin" aria-hidden /> : <Zap size={14} strokeWidth={1.7} aria-hidden />}
            {indexing ? "Indexing…" : isIndexed ? "Re-index" : "Index Docs"}
          </button>
        </div>
        {indexStatus && (
          <p className="mt-2 text-[12.5px] text-ink-muted border-t border-line pt-2">{indexStatus}</p>
        )}
      </Card>

      {/* Search input */}
      <div className="relative">
        <Search size={15} strokeWidth={1.7} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Ask anything about the codebase… (semantic search)"
          aria-label="Search the knowledge base"
          className="h-9 w-full rounded-lg border border-line bg-surface-1 pl-10 pr-24 text-[13.5px] text-ink placeholder:text-ink-muted transition-colors duration-150"
        />
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim() || !isIndexed}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg bg-act px-3 py-1 text-[12.5px] font-medium text-act-ink transition-opacity duration-150 hover:opacity-90 disabled:opacity-40"
        >
          {loading ? <Loader2 size={14} strokeWidth={1.7} className="animate-spin" aria-hidden /> : "Search"}
        </button>
      </div>

      {!isIndexed && (
        <p className="text-[12.5px] text-center text-ink-muted">Index docs first to enable semantic search</p>
      )}

      {error && (
        <div className="rounded-xl bg-err-soft p-4">
          <p className="text-[13.5px] text-err">{error}</p>
        </div>
      )}

      {/* Results */}
      {searched && results.length === 0 && !loading && (
        <p className="text-[13.5px] text-ink-muted text-center py-8">No results found for "{query}"</p>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          <p className="text-[12.5px] text-ink-muted font-medium">
            {results.length} result{results.length !== 1 ? "s" : ""} — ranked by semantic similarity
          </p>
          {results.map((r) => (
            <Card key={r._id} className="p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="text-[13.5px] font-semibold text-ink">{r.title}</p>
                  <p className="text-[12.5px] text-ink-muted">{r.source} · chunk {r.chunkIndex + 1}</p>
                </div>
                <span className="shrink-0 rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[11.5px] text-ink-secondary">
                  {(r.score * 100).toFixed(0)}% match
                </span>
              </div>
              <p
                className="text-[12.5px] text-ink-secondary leading-relaxed line-clamp-4"
                dangerouslySetInnerHTML={{ __html: highlight(r.content.slice(0, 400), query) }}
              />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CHAT TAB
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: { title: string; source: string; excerpt: string }[];
}

const SESSION_ID = `session_${Math.random().toString(36).slice(2)}`;

function ChatTab() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const chatWithRepo = useAction(api.knowledge.chatWithRepo);
  const clearHistory = useMutation(api.knowledge.clearChatHistory);
  const totalChunks = useQuery(api.knowledge.getTotalChunks);

  const isIndexed = (totalChunks ?? 0) > 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setError(null);

    const userMsg: ChatMessage = { role: "user", content: q };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));
      const res = await chatWithRepo({ question: q, sessionId: SESSION_ID, history });
      const { answer, sources } = res as { answer: string; sources: ChatMessage["sources"] };
      setMessages((prev) => [...prev, { role: "assistant", content: answer, sources }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chat failed");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleClear = async () => {
    setMessages([]);
    await clearHistory({ sessionId: SESSION_ID });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const STARTERS = [
    "What is the task state machine?",
    "How do agents claim tasks?",
    "Explain the policy engine risk levels",
    "What tables are in the database?",
    "How does the Telegram bot work?",
  ];

  return (
    <div className="mx-auto flex h-[calc(100vh-220px)] w-full max-w-[1200px] flex-col gap-5 px-6 py-6">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageSquare size={15} strokeWidth={1.7} aria-hidden className="text-ink-secondary" />
          <span className="text-[13.5px] font-semibold text-ink">Chat with Repo</span>
          <span className={cn("rounded-md px-1.5 py-0.5 text-[11.5px] font-medium leading-none", isIndexed ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn")}>
            {isIndexed ? "Ready" : "Not indexed"}
          </span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 text-[12.5px] text-ink-muted hover:text-ink transition-colors duration-150"
          >
            <RotateCcw size={14} strokeWidth={1.7} aria-hidden />
            Clear
          </button>
        )}
      </div>

      {!isIndexed && (
        <div className="mb-4 rounded-xl bg-warn-soft p-4">
          <p className="text-[13.5px] text-warn">
            The knowledge base isn't indexed yet. Go to the <strong>Search</strong> tab and click <strong>Index Docs</strong> first.
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-auto space-y-4 mb-4 pr-1">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <div className="space-y-2">
              <BookOpen size={28} strokeWidth={1.6} aria-hidden className="mx-auto text-ink-muted" />
              <p className="text-[13.5px] font-medium text-ink">Ask anything about Mission Control</p>
              <p className="text-[12.5px] text-ink-muted max-w-sm">
                Powered by RAG — I search the indexed docs and answer using GPT-4o-mini with source citations.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => { setInput(s); inputRef.current?.focus(); }}
                  className="rounded-lg border border-line bg-surface-1 px-3 py-1.5 text-[12.5px] text-ink-secondary transition-colors duration-150 hover:border-line-strong hover:bg-surface-2 hover:text-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[80%] space-y-2")}>
              <div
                className={cn(
                  "rounded-xl px-4 py-3 text-[13.5px] leading-relaxed",
                  msg.role === "user"
                    ? "bg-act text-act-ink rounded-br-sm"
                    : "bg-surface-2 border border-line text-ink rounded-bl-sm"
                )}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>

              {msg.sources && msg.sources.length > 0 && (
                <div className="space-y-1 pl-1">
                  <p className="text-[11.5px] font-medium text-ink-muted">Sources</p>
                  {msg.sources.map((src, j) => (
                    <div key={j} className="flex items-start gap-2 text-[12.5px] text-ink-secondary bg-surface-2 rounded-lg px-3 py-2 border border-line">
                      <FileText size={14} strokeWidth={1.7} aria-hidden className="shrink-0 mt-0.5 text-ink-muted" />
                      <div>
                        <p className="font-medium text-ink">{src.title}</p>
                        <p className="line-clamp-2 mt-0.5">{src.excerpt}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-surface-2 border border-line rounded-xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
              <Loader2 size={15} strokeWidth={1.7} aria-hidden className="animate-spin text-ink-muted" />
              <span className="text-[13.5px] text-ink-secondary">Thinking…</span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-start">
            <div className="bg-err-soft rounded-xl px-4 py-3 text-[13.5px] text-err max-w-[80%]">
              {error}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="relative">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isIndexed ? "Ask a question… (Enter to send, Shift+Enter for newline)" : "Index docs first to enable chat"}
          disabled={!isIndexed || loading}
          rows={2}
          className="w-full pl-4 pr-14 py-3 rounded-lg border border-line bg-surface-1 text-[13.5px] text-ink placeholder:text-ink-muted transition-colors duration-150 resize-none disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading || !isIndexed}
          aria-label="Send message"
          className="absolute right-2 bottom-2.5 rounded-lg bg-act p-2 text-act-ink transition-opacity duration-150 hover:opacity-90 disabled:opacity-40"
        >
          <Send size={15} strokeWidth={1.7} aria-hidden />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ROOT
// ---------------------------------------------------------------------------

export function DocsView() {
  const [activeTab, setActiveTab] = useState("knowledge");

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
      <PageHeader
        title="Documentation"
        description="Project guides, runbooks, search, and repo-aware chat in one knowledge surface."
        icon={<BookOpen size={16} strokeWidth={1.7} aria-hidden />}
        status={<StatusBadge tone="neutral">{DOC_LINKS.length} docs</StatusBadge>}
      />
      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} className="px-6" />

      {activeTab === "knowledge" && <KnowledgeTab />}
      {activeTab === "search"    && <SearchTab />}
      {activeTab === "chat"      && <ChatTab />}
    </main>
  );
}
