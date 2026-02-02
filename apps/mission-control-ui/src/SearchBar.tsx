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
      ? { projectId, query, limit: 10 }
      : "skip"
  );

  // Get suggestions for autocomplete
  const suggestions = useQuery(
    api.search.getSuggestions,
    query.length >= 2 && projectId
      ? { projectId, prefix: query }
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
    <div className="relative w-full max-w-2xl">
      {/* Search Input */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => query.length >= 2 && setIsOpen(true)}
          placeholder="Search tasks... (type at least 2 characters)"
          className="w-full px-4 py-2 pl-10 pr-4 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-700 dark:text-white"
        />
        <svg
          className="absolute left-3 top-2.5 h-5 w-5 text-gray-400"
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
            className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Suggestions (autocomplete) */}
      {query.length >= 2 && suggestions && suggestions.length > 0 && !isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
          <div className="p-2 text-xs text-gray-500 dark:text-gray-400">
            Suggestions:
          </div>
          <div className="flex flex-wrap gap-2 p-2">
            {suggestions.map((suggestion, i) => (
              <button
                key={i}
                onClick={() => setQuery(suggestion)}
                className="px-2 py-1 text-sm bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search Results */}
      {isOpen && results && results.length > 0 && (
        <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-96 overflow-y-auto">
          <div className="p-2 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
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
                className={`w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0 ${
                  isSelected ? "bg-blue-50 dark:bg-gray-700" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-900 dark:text-white truncate">
                      {highlightMatch(task.title, query)}
                    </div>
                    {task.description && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                        {highlightMatch(task.description, query)}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-2 text-xs">
                      <span
                        className={`px-2 py-0.5 rounded-full ${
                          statusColors[task.status] || "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {task.status}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">
                        {task.type}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">
                        P{task.priority}
                      </span>
                      {result.score && (
                        <span className="text-gray-400 dark:text-gray-500 ml-auto">
                          Score: {result.score.toFixed(1)}
                        </span>
                      )}
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
        <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-4 text-center text-gray-500 dark:text-gray-400">
          No tasks found for "{query}"
        </div>
      )}

      {/* Keyboard Shortcuts Hint */}
      {isOpen && results && results.length > 0 && (
        <div className="absolute z-10 right-0 mt-2 text-xs text-gray-400 dark:text-gray-500">
          <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">↑↓</kbd> navigate
          <kbd className="ml-2 px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">Enter</kbd> select
          <kbd className="ml-2 px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">Esc</kbd> close
        </div>
      )}
    </div>
  );
}
