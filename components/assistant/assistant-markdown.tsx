"use client"

import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

import { markdownComponents } from "@/components/critical-path/issue-markdown"

/**
 * Assistant output, rendered in the same house styling as issue descriptions.
 *
 * Composes over the existing map rather than restating it — there is no
 * typography plugin in this app, so every element is hand-mapped and duplicating
 * that would be ~80 lines that drift apart. Two overrides:
 *  - `img` is dropped; the assistant never emits images, and the inherited
 *    renderer routes through the Linear asset proxy, which is wrong here.
 *  - links open in a new tab, since the panel floats over the page the user is
 *    working on.
 *
 * As with issue descriptions, there is no rehype-raw, so raw HTML in model
 * output is ignored rather than rendered.
 */
const assistantComponents: Components = {
  ...markdownComponents,
  img: () => null,
  a: ({ href, ...props }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="underline decoration-border underline-offset-4 transition hover:decoration-foreground"
      {...props}
    />
  ),
}

export function AssistantMarkdown({ source }: { source: string }) {
  return (
    <div className="space-y-3 text-sm leading-6 text-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={assistantComponents}>
        {source}
      </ReactMarkdown>
    </div>
  )
}
