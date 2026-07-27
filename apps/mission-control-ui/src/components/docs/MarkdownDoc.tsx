import { cn } from "@/lib/utils";
import { renderDocsMarkdown } from "@/lib/markdownRender";

export { renderDocsMarkdown };

export function MarkdownDoc({
  markdown,
  className,
  resolveInternalLink,
}: {
  markdown: string;
  className?: string;
  resolveInternalLink?: (href: string) => string | null;
}): JSX.Element {
  return (
    <article
      className={cn("docs-markdown max-w-none", className)}
      dangerouslySetInnerHTML={{
        __html: renderDocsMarkdown(markdown, { resolveInternalLink }),
      }}
    />
  );
}
