"use client"

import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { isLinearUploadUrl } from "@/lib/critical-path-utils"

// Renders a Linear issue description.
//
// No rehype-raw: react-markdown ignores raw HTML by default, which is exactly the
// sanitisation posture we want when Linear content reaches an anonymous visitor.
// No `prose` either — there is no typography plugin here, so every element is mapped
// onto the house classes by hand.

/**
 * Images pasted into Linear live on uploads.linear.app and 403 without credentials,
 * so they go through our authenticated proxy. Everything else passes through.
 */
export function proxyLinearAsset(src: string | undefined): string {
  if (!src) return ""
  if (!isLinearUploadUrl(src)) return src
  return `/api/critical-path/asset?url=${encodeURIComponent(src)}`
}

/**
 * Exported so the assistant panel can render markdown in the same house styling
 * rather than duplicating the map. It composes over this and overrides `img`,
 * which is Linear-specific.
 */
export const markdownComponents: Components = {
  // Headings are downgraded so a description never emits a heading that competes
  // with the drawer's own title.
  h1: (props) => (
    <h3
      className="mt-6 text-base font-medium tracking-tight text-foreground first:mt-0"
      {...props}
    />
  ),
  h2: (props) => (
    <h4
      className="mt-6 text-sm font-medium tracking-tight text-foreground first:mt-0"
      {...props}
    />
  ),
  h3: (props) => (
    <h5 className="mt-5 text-sm font-medium text-foreground first:mt-0" {...props} />
  ),
  h4: (props) => (
    <h6 className="mt-5 text-sm font-medium text-foreground first:mt-0" {...props} />
  ),
  p: (props) => <p className="text-sm leading-6 text-muted-foreground" {...props} />,
  a: ({ href, ...props }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="text-foreground underline decoration-border underline-offset-2 transition hover:decoration-foreground"
      {...props}
    />
  ),
  ul: ({ className, ...props }) => (
    <ul
      className={
        // remark-gfm marks checklists with `contains-task-list`. Those lose the
        // bullet indent so the boxes sit flush with the surrounding text.
        className?.includes("contains-task-list")
          ? "list-none space-y-1 text-sm leading-6 text-muted-foreground"
          : "list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground marker:text-border"
      }
      {...props}
    />
  ),
  ol: ({ className, ...props }) => (
    <ol
      className={
        className?.includes("contains-task-list")
          ? "list-none space-y-1 text-sm leading-6 text-muted-foreground"
          : "list-decimal space-y-1 pl-5 text-sm leading-6 text-muted-foreground marker:text-border"
      }
      {...props}
    />
  ),
  li: ({ className, ...props }) => (
    <li
      className={
        // remark-gfm tags checklist items. The box is pulled out of the text flow so
        // a wrapped line aligns with the first line's text, not under the box.
        className?.includes("task-list-item")
          ? "relative list-none pl-6 text-sm leading-6 [&_input]:absolute [&_input]:left-0 [&_input]:top-[5px]"
          : "text-sm leading-6"
      }
      {...props}
    />
  ),
  blockquote: (props) => (
    <blockquote
      className="border-l-2 border-border pl-4 text-sm italic leading-6 text-muted-foreground"
      {...props}
    />
  ),
  code: ({ className, ...props }) =>
    className?.startsWith("language-") ? (
      <code className={`font-mono text-[12px] leading-5 ${className}`} {...props} />
    ) : (
      <code
        className="border border-border/70 bg-secondary/60 px-1 py-0.5 font-mono text-[12px]"
        {...props}
      />
    ),
  pre: (props) => (
    <pre
      className="overflow-x-auto border border-border/70 bg-secondary/40 p-3 font-mono text-[12px] leading-5"
      {...props}
    />
  ),
  hr: () => <hr className="my-6 border-t border-border/70" />,
  table: (props) => (
    <div className="overflow-x-auto border border-border/70">
      <table className="w-full text-sm" {...props} />
    </div>
  ),
  th: (props) => (
    <th
      className="border-b border-border/70 bg-secondary/40 px-3 py-2 text-left text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground"
      {...props}
    />
  ),
  td: (props) => (
    <td
      className="border-b border-border/60 px-3 py-2 text-sm text-muted-foreground"
      {...props}
    />
  ),
  input: ({ type, checked }) =>
    type === "checkbox" ? (
      <input
        type="checkbox"
        disabled
        checked={Boolean(checked)}
        readOnly
        className="size-3.5 accent-[color:var(--accent)]"
      />
    ) : null,
  img: ({ src, alt }) => (
    // next/image would need remotePatterns; next.config.mjs sets images.unoptimized.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={proxyLinearAsset(typeof src === "string" ? src : undefined)}
      alt={alt ?? ""}
      loading="lazy"
      className="my-3 max-w-full border border-border/70"
    />
  ),
}

export function IssueMarkdown({ source }: { source: string }) {
  return (
    <div className="space-y-3">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {source}
      </ReactMarkdown>
    </div>
  )
}
