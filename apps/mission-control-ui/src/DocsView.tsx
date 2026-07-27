import { useState, useRef, useEffect, useCallback } from "react";
import { BookOpen, FileText, Loader2, MessageSquare, RotateCcw, Search, Send, Zap } from "lucide-react";
import { useAction, useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/factory/badges";
import { DocsSiteBrowser } from "@/components/docs/DocsSiteBrowser";
import { PageHeader } from "./components/PageHeader";
import { TabBar } from "./components/TabBar";
import { cn } from "@/lib/utils";
import { DOCS_SITE_PAGES } from "@/lib/docsSiteConfig";

// ---------------------------------------------------------------------------
// TABS
// ---------------------------------------------------------------------------

const TABS = [
  { id: "documentation", label: "Documentation" },
  { id: "search", label: "Search" },
  { id: "chat", label: "Chat with Repo" },
];

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
  const [activeTab, setActiveTab] = useState("documentation");

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-app">
      <PageHeader
        title="Documentation"
        description="Agentic software factory guides — Tessl-style docs for Mission Control, plus semantic search and repo chat."
        icon={<BookOpen size={16} strokeWidth={1.7} aria-hidden />}
        status={<StatusBadge tone="neutral">{DOCS_SITE_PAGES.length} guides</StatusBadge>}
      />
      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} className="px-6 shrink-0" />

      {activeTab === "documentation" && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-2">
          <DocsSiteBrowser />
        </div>
      )}
      {activeTab === "search" && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SearchTab />
        </div>
      )}
      {activeTab === "chat" && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ChatTab />
        </div>
      )}
    </main>
  );
}
