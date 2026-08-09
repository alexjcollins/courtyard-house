"use client"

import { useEffect, useRef } from "react"
import { ArrowUpRight, CalendarDays, Flag, Link2, Milestone, X } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import { IssueMarkdown, proxyLinearAsset } from "@/components/critical-path/issue-markdown"
import { PriorityIcon, StateIcon, priorityLabel } from "@/components/critical-path/linear-icons"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { isOverdue } from "@/lib/critical-path-utils"
import { formatDate } from "@/lib/format"
import type { LinearViewIssue } from "@/lib/linear"
import { cn } from "@/lib/utils"

function MetaItem({
  icon,
  children,
  className,
}: {
  icon: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", className)}>
      {icon}
      {children}
    </span>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
      {children}
    </p>
  )
}

export function IssueDrawer({
  issue,
  onClose,
}: {
  issue: LinearViewIssue | null
  onClose: () => void
}) {
  const bodyRef = useRef<HTMLDivElement>(null)

  // Switching issues without this keeps the previous scroll offset.
  useEffect(() => {
    bodyRef.current?.scrollTo(0, 0)
  }, [issue?.id])

  const overdue = issue ? isOverdue(issue) : false

  return (
    <Sheet open={Boolean(issue)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        showClose={false}
        overlayClassName="bg-foreground/10 backdrop-blur-[2px]"
        className="w-full gap-0 border-l border-border/80 p-0 sm:max-w-[640px] lg:max-w-[760px]"
      >
        {issue ? (
          <>
            <div className="shrink-0 border-b border-border/80 px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                  {issue.identifier}
                </span>
                <div className="flex items-center gap-2">
                  {issue.linearUrl ? (
                    <a
                      href={issue.linearUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition hover:text-foreground"
                    >
                      Open in Linear
                      <ArrowUpRight className="size-3" />
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="inline-flex size-7 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </div>

              <SheetTitle className="mt-2 text-xl font-medium tracking-tight">
                {issue.title}
              </SheetTitle>
              <SheetDescription className="sr-only">
                Details for {issue.identifier}
              </SheetDescription>

              {issue.parent ? (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Sub-task of {issue.parent.identifier} · {issue.parent.title}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground">
                <MetaItem
                  icon={
                    <StateIcon
                      type={issue.state.type}
                      color={issue.state.color}
                      name={issue.state.name}
                    />
                  }
                >
                  {issue.state.name}
                </MetaItem>

                <MetaItem icon={<PriorityIcon priority={issue.priority} className="size-3.5" />}>
                  {issue.priorityLabel || priorityLabel(issue.priority)}
                </MetaItem>

                {issue.assignee ? (
                  <MetaItem
                    icon={
                      <Avatar className="size-4">
                        {issue.assignee.avatarUrl ? (
                          <AvatarImage
                            src={issue.assignee.avatarUrl}
                            alt={issue.assignee.name}
                          />
                        ) : null}
                        <AvatarFallback className="text-[8px] font-medium">
                          {issue.assignee.initials}
                        </AvatarFallback>
                      </Avatar>
                    }
                  >
                    {issue.assignee.name}
                  </MetaItem>
                ) : (
                  <MetaItem icon={<Flag className="size-3.5" />}>Unassigned</MetaItem>
                )}

                {issue.dueDate ? (
                  <MetaItem
                    icon={<CalendarDays className="size-3.5" />}
                    className={overdue ? "text-[color:var(--accent)]" : undefined}
                  >
                    Due {formatDate(issue.dueDate)}
                  </MetaItem>
                ) : null}

                {issue.milestone ? (
                  <MetaItem icon={<Milestone className="size-3.5" />}>
                    {issue.milestone.name}
                  </MetaItem>
                ) : null}
              </div>
            </div>

            <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <Eyebrow>Description</Eyebrow>
              <div className="mt-3">
                {issue.description ? (
                  <IssueMarkdown source={issue.description} />
                ) : (
                  <p className="text-sm leading-6 text-muted-foreground">
                    No description.
                  </p>
                )}
              </div>

              {issue.labels.length > 0 ? (
                <>
                  <hr className="my-6 border-t border-border/70" />
                  <Eyebrow>Labels</Eyebrow>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {issue.labels.map((label) => (
                      <span
                        key={label.id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-1 text-xs text-muted-foreground"
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{ backgroundColor: label.color }}
                        />
                        {label.name}
                      </span>
                    ))}
                  </div>
                </>
              ) : null}

              {issue.attachments.length > 0 ? (
                <>
                  <hr className="my-6 border-t border-border/70" />
                  <Eyebrow>Links and attachments</Eyebrow>
                  <div className="mt-3 border border-border/70">
                    {issue.attachments.map((attachment) => (
                      <a
                        key={attachment.id}
                        href={
                          attachment.isLinearUpload
                            ? proxyLinearAsset(attachment.url)
                            : attachment.url
                        }
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="flex items-center gap-3 border-b border-border/60 px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-secondary/60"
                      >
                        <Link2 className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-foreground">
                            {attachment.title}
                          </span>
                          {attachment.subtitle || attachment.host ? (
                            <span className="block truncate text-xs text-muted-foreground">
                              {attachment.subtitle || attachment.host}
                            </span>
                          ) : null}
                        </span>
                        <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
                      </a>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
