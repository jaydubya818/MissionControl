import { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

interface SearchBarProps {
  projectId: string | undefined;
  onResultClick: (taskId: string) => void;
}

export function SearchBar({ projectId, onResultClick }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Get search results
  const results = useQuery(
    api.search.searchAll,
    query.length >= 2 && projectId
      ? { projectId: projectId as any, query, limit: 10 }
      : "skip"
  );

  // Get suggestions for autocomplete
  const suggestions = useQuery(
    api.search.getSuggestions,
    query.length >= 2 && projectId
      ? { projectId: projectId as any, prefix: query }
      : "skip"
  );

  useEffect(() => {
    setIsOpen(query.length >= 2 && (results?.length ?? 0) > 0);
    setSelectedIndex(0);
  }, [query, results]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!results || results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      onResultClick(results[selectedIndex].task._id);
      setQuery("");
      setIsOpen(false);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const handleResultClick = (taskId: string) => {
    onResultClick(taskId);
    setQuery("");
    setIsOpen(false);
  };

  const highlightMatch = (text: string, query: string) => {
    const parts = text.split(new RegExp(`(${query})`, "gi"));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <mark key={i} className="bg-yellow-200 dark:bg-yellow-800">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

  return (
    <div className="relative w-full" style={{ maxWidth: "400px" }}>
      {/* Search Input */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => query.length >= 2 && setIsOpen(true)}
          placeholder="Search tasks..."
          style={{
            width: "100%",
            padding: "6px 12px 6px 32px",
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: "6px",
            color: "#e2e8f0",
            fontSize: "0.85rem",
            outline: "none",
          }}
        />
        <svg
          style={{
            position: "absolute",
            left: "10px",
            top: "8px",
            height: "16px",
            width: "16px",
            color: "#64748b",
          }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setIsOpen(false);
            }}
            style={{
              position: "absolute",
              right: "8px",
              top: "6px",
              color: "#64748b",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "2px",
            }}
          >
            <svg style={{ height: "16px", width: "16px" }} fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
      </div>


      {/* Search Results */}
      {isOpen && results && results.length > 0 && (
        <div
          style={{
            position: "absolute",
            zIndex: 1000,
            width: "100%",
            marginTop: "4px",
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: "8px",
            boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
            maxHeight: "400px",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              padding: "8px 12px",
              fontSize: "0.75rem",
              color: "#94a3b8",
              borderBottom: "1px solid #334155",
            }}
          >
            Found {results.length} result{results.length !== 1 ? "s" : ""}
          </div>
          {results.map((result, i) => {
            const task = result.task;
            const isSelected = i === selectedIndex;
            
            const statusColors: Record<string, string> = {
              INBOX: "bg-gray-100 text-gray-800",
              ASSIGNED: "bg-blue-100 text-blue-800",
              IN_PROGRESS: "bg-yellow-100 text-yellow-800",
              REVIEW: "bg-purple-100 text-purple-800",
              NEEDS_APPROVAL: "bg-orange-100 text-orange-800",
              BLOCKED: "bg-red-100 text-red-800",
              DONE: "bg-green-100 text-green-800",
              CANCELED: "bg-gray-100 text-gray-800",
            };

            return (
              <button
                key={task._id}
                onClick={() => handleResultClick(task._id)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "12px",
                  background: isSelected ? "#334155" : "transparent",
                  border: "none",
                  borderBottom: "1px solid #334155",
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.background = "#1e293b";
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.background = "transparent";
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: "0.875rem", color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {highlightMatch(task.title, query)}
                    </div>
                    {task.description && (
                      <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "4px", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                        {highlightMatch(task.description, query)}
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px", fontSize: "0.75rem" }}>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: "12px",
                          background: "#334155",
                          color: "#94a3b8",
                          fontSize: "0.7rem",
                        }}
                      >
                        {task.status}
                      </span>
                      <span style={{ color: "#64748b" }}>
                        {task.type}
                      </span>
                      <span style={{ color: "#64748b" }}>
                        P{task.priority}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* No Results */}
      {isOpen && results && results.length === 0 && query.length >= 2 && (
        <div
          style={{
            position: "absolute",
            zIndex: 1000,
            width: "100%",
            marginTop: "4px",
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: "8px",
            padding: "16px",
            textAlign: "center",
            color: "#94a3b8",
            fontSize: "0.875rem",
          }}
        >
          No tasks found for "{query}"
        </div>
      )}
    </div>
  );
}
