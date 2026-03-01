"use client"

import { startTransition, useMemo, useState } from "react"
import { Sparkles } from "lucide-react"
import type { DataFileName, EditableFile, AssistantDiff } from "@/lib/data"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

type AdminJsonWorkbenchProps = {
  files: EditableFile[]
}

type SaveState = "idle" | "saving" | "saved" | "error"

export function AdminJsonWorkbench({ files }: AdminJsonWorkbenchProps) {
  const initialFileMap = useMemo(
    () =>
      Object.fromEntries(files.map((file) => [file.name, file.content])) as Record<
        DataFileName,
        string
      >,
    [files],
  )

  const [fileMap, setFileMap] = useState(initialFileMap)
  const [saveState, setSaveState] = useState<Record<DataFileName, SaveState>>(
    Object.fromEntries(files.map((file) => [file.name, "idle"])) as Record<
      DataFileName,
      SaveState
    >,
  )
  const [saveMessage, setSaveMessage] = useState<string>("")
  const [prompt, setPrompt] = useState("")
  const [diff, setDiff] = useState<AssistantDiff | null>(null)
  const [diffMessage, setDiffMessage] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isApplying, setIsApplying] = useState(false)

  async function saveFile(fileName: DataFileName) {
    setSaveState((current) => ({ ...current, [fileName]: "saving" }))
    setSaveMessage("")

    try {
      const response = await fetch("/api/admin/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName,
          content: fileMap[fileName],
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || "Save failed.")
      }

      setFileMap((current) => ({ ...current, [fileName]: payload.content }))
      setSaveState((current) => ({ ...current, [fileName]: "saved" }))
      setSaveMessage(`${fileName} saved.`)
    } catch (error) {
      setSaveState((current) => ({ ...current, [fileName]: "error" }))
      setSaveMessage(error instanceof Error ? error.message : "Save failed.")
    }
  }

  async function generateDiff() {
    setIsGenerating(true)
    setDiffMessage("")

    try {
      const response = await fetch("/api/admin/generate-diff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || "Could not generate diff.")
      }

      setDiff(payload.diff as AssistantDiff)
      setDiffMessage(payload.diff.summary)
    } catch (error) {
      setDiff(null)
      setDiffMessage(error instanceof Error ? error.message : "Could not generate diff.")
    } finally {
      setIsGenerating(false)
    }
  }

  async function applyDiff() {
    if (!diff) return
    setIsApplying(true)
    setDiffMessage("")

    try {
      const response = await fetch("/api/admin/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: diff.fileName,
          content: diff.nextContent,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || "Could not apply diff.")
      }

      setFileMap((current) => ({ ...current, [diff.fileName]: payload.content }))
      setSaveState((current) => ({ ...current, [diff.fileName]: "saved" }))
      setDiffMessage("Diff applied.")
      setDiff(null)
      setPrompt("")
    } catch (error) {
      setDiffMessage(error instanceof Error ? error.message : "Could not apply diff.")
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/70 py-0">
        <CardHeader className="px-5 pt-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Update box
          </p>
          <CardTitle className="text-2xl font-medium tracking-tight">
            Prompt to JSON diff
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-5 pb-5">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <Input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Add quote from ABC Groundworks £42k ex VAT expiring 14 days"
            />
            <Button
              type="button"
              onClick={() =>
                startTransition(() => {
                  void generateDiff()
                })
              }
              disabled={isGenerating}
              className="bg-[color:var(--accent)] text-black hover:bg-[color:var(--accent)]/90"
            >
              <Sparkles className="size-4" />
              {isGenerating ? "Generating…" : "Generate diff"}
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            MVP parser support: add quote instructions. It writes to
            `procurement.json` and lets you confirm before applying.
          </p>

          {diffMessage ? <p className="text-sm text-foreground">{diffMessage}</p> : null}

          {diff ? (
            <div className="border border-border/70 bg-secondary/40 p-4">
              <p className="text-sm font-medium text-foreground">{diff.summary}</p>
              <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                {diff.changes.map((change) => (
                  <p key={`${change.path}-${change.after}`}>
                    {change.path}: {change.before} → {change.after}
                  </p>
                ))}
              </div>
              <div className="mt-4 flex gap-3">
                <Button
                  type="button"
                  onClick={() =>
                    startTransition(() => {
                      void applyDiff()
                    })
                  }
                  disabled={isApplying}
                >
                  {isApplying ? "Applying…" : "Apply"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDiff(null)}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Tabs defaultValue={files[0]?.name} className="gap-4">
        <TabsList className="h-auto flex-wrap rounded-full bg-transparent p-0">
          {files.map((file) => (
            <TabsTrigger
              key={file.name}
              value={file.name}
              className="rounded-full border border-border bg-card px-4 py-2 data-[state=active]:border-foreground data-[state=active]:bg-foreground data-[state=active]:text-background"
            >
              {file.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {files.map((file) => (
          <TabsContent key={file.name} value={file.name}>
            <Card className="border-border/70 py-0">
              <CardHeader className="px-5 pt-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                      JSON source
                    </p>
                    <CardTitle className="mt-2 text-2xl font-medium tracking-tight">
                      {file.name}
                    </CardTitle>
                  </div>
                  <Button
                    type="button"
                    onClick={() =>
                      startTransition(() => {
                        void saveFile(file.name)
                      })
                    }
                    disabled={saveState[file.name] === "saving"}
                  >
                    {saveState[file.name] === "saving" ? "Saving…" : "Save file"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <Textarea
                  className="min-h-[520px] border-border/70 bg-muted/20 font-mono text-xs"
                  value={fileMap[file.name]}
                  onChange={(event) =>
                    setFileMap((current) => ({
                      ...current,
                      [file.name]: event.target.value,
                    }))
                  }
                />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {saveMessage ? <p className="text-sm text-muted-foreground">{saveMessage}</p> : null}
    </div>
  )
}
