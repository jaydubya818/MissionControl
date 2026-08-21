import { safeExternalUrl } from "./safeExternalUrl";
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeExternalHref(href: string): string {
  const trimmed = href.trim();
  // Same http(s) policy as every other external link in the app, plus mailto,
  // which is safe and meaningful inside rendered documentation.
  if (/^mailto:/i.test(trimmed)) return trimmed;
  return safeExternalUrl(trimmed) ?? "#";
}

function inlineMarkdown(
  text: string,
  options?: { resolveInternalLink?: (href: string) => string | null }
): string {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, "<code class=\"rounded bg-surface-2 px-1 py-0.5 font-mono text-[12.5px] text-ink\">$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong class=\"font-semibold text-ink\">$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m, label, href) => {
      const pageId = options?.resolveInternalLink?.(href);
      if (pageId) {
        return `<a href="#" data-docs-page="${escapeHtml(pageId)}" class="text-act underline underline-offset-2 hover:opacity-90">${label}</a>`;
      }
      return `<a href="${escapeHtml(safeExternalHref(href))}" class="text-act underline underline-offset-2 hover:opacity-90" target="_blank" rel="noopener noreferrer">${label}</a>`;
    }
  );
  return out;
}

function isTableRow(line: string): boolean {
  return line.trim().startsWith("|") && line.trim().endsWith("|");
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

/** Lightweight markdown → HTML for in-app docs (no extra dependency). */
export function renderDocsMarkdown(
  source: string,
  options?: { resolveInternalLink?: (href: string) => string | null }
): string {
  const inline = (text: string) => inlineMarkdown(text, options);
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      i += 1;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1;
      html.push(
        `<pre class="my-4 overflow-x-auto rounded-xl border border-line bg-surface-2 p-4"><code class="font-mono text-[12.5px] leading-relaxed text-ink-secondary"${lang ? ` data-lang="${escapeHtml(lang)}"` : ""}>${escapeHtml(codeLines.join("\n"))}</code></pre>`
      );
      continue;
    }

    if (line.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      html.push(
        `<blockquote class="my-4 rounded-xl border border-info/30 bg-info-soft/40 px-4 py-3 text-[13.5px] leading-relaxed text-ink-secondary">${quoteLines.map((q) => `<p class="mb-1 last:mb-0">${inline(q)}</p>`).join("")}</blockquote>`
      );
      continue;
    }

    if (isTableRow(line)) {
      const tableLines: string[] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        tableLines.push(lines[i]);
        i += 1;
      }
      const header = parseTableRow(tableLines[0]);
      const bodyRows = tableLines.slice(2).map(parseTableRow);
      html.push(
        `<div class="my-4 overflow-x-auto rounded-xl border border-line"><table class="w-full min-w-[480px] text-left text-[13px]"><thead class="bg-surface-2"><tr>${header.map((h) => `<th class="px-3 py-2 font-semibold text-ink">${inline(h)}</th>`).join("")}</tr></thead><tbody>${bodyRows.map((row, ri) => `<tr class="${ri % 2 === 0 ? "bg-surface-1" : "bg-app"}">${row.map((c) => `<td class="border-t border-line px-3 py-2 text-ink-secondary">${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
      );
      continue;
    }

    if (/^#{1,3}\s/.test(line)) {
      const level = line.match(/^#+/)?.[0].length ?? 1;
      const text = line.replace(/^#+\s*/, "");
      const tag = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
      const cls =
        level === 1
          ? "mt-2 mb-4 text-[26px] font-semibold tracking-tight text-ink"
          : level === 2
          ? "mt-8 mb-3 text-[19px] font-semibold text-ink"
          : "mt-6 mb-2 text-[15px] font-semibold text-ink";
      html.push(`<${tag} class="${cls}">${inline(text)}</${tag}>`);
      i += 1;
      continue;
    }

    if (/^[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s*/, ""));
        i += 1;
      }
      html.push(
        `<ul class="my-3 list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-ink-secondary">${items.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`
      );
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s*/, ""));
        i += 1;
      }
      html.push(
        `<ol class="my-3 list-decimal space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-ink-secondary">${items.map((item) => `<li>${inline(item)}</li>`).join("")}</ol>`
      );
      continue;
    }

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    const para: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^#/.test(lines[i]) &&
      !lines[i].startsWith("```") &&
      !lines[i].startsWith(">") &&
      !isTableRow(lines[i]) &&
      !/^[-*]\s/.test(lines[i]) &&
      !/^\d+\.\s/.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    html.push(
      `<p class="my-3 text-[13.5px] leading-relaxed text-ink-secondary">${inline(para.join(" "))}</p>`
    );
  }

  return html.join("\n");
}
