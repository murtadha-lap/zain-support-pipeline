"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"
import type { SaveState } from "@/components/tickets/draft-editor"
import { api, errorMessage } from "@/lib/api"
import { qk } from "@/lib/hooks"
import type { TicketDetail } from "@/lib/types"

const AUTOSAVE_MS = 1500

// Working draft for the ticket workspace.
// - Local edits are autosaved 1.5 s after the last keystroke (only when changed).
// - When the server's draft_md changes (triage finished, re-triage, restore) and the
//   person has no unsaved edits, the editor is re-mounted with the new text.
export function useDraft(ticket: TicketDetail, enabled: boolean) {
  const qc = useQueryClient()
  const id = ticket.id
  const [draft, setDraftState] = useState(ticket.draft_md)
  const [resetKey, setResetKey] = useState(0)
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" })
  const serverDraft = useRef(ticket.draft_md)
  const draftRef = useRef(ticket.draft_md)
  const dirty = useRef(false)

  const { mutate, isPending } = useMutation({
    mutationFn: (md: string) => api.put<TicketDetail>(`/tickets/${id}/draft`, { draft_md: md }),
    onMutate: () => setSaveState({ status: "saving" }),
    onSuccess: (data, md) => {
      serverDraft.current = data.draft_md
      if (draftRef.current === md) dirty.current = false
      setSaveState({ status: "saved", at: Date.now() })
      qc.setQueryData(qk.ticket(id), data)
    },
    onError: (err) => setSaveState({ status: "error", message: errorMessage(err) }),
  })

  // Adopt a new server draft (also used by "Restore AI draft" and re-triage).
  const adopt = useCallback((md: string, opts?: { save?: boolean }) => {
    draftRef.current = md
    setDraftState(md)
    setResetKey((k) => k + 1)
    if (opts?.save) {
      dirty.current = true
    } else {
      serverDraft.current = md
      dirty.current = false
    }
  }, [])

  // Server → local sync.
  useEffect(() => {
    const server = ticket.draft_md
    if (server === serverDraft.current) return
    serverDraft.current = server
    if (server === draftRef.current) {
      dirty.current = false
      return
    }
    if (!dirty.current) {
      draftRef.current = server
      setDraftState(server)
      setResetKey((k) => k + 1)
    }
  }, [ticket.draft_md])

  const setDraft = useCallback((md: string) => {
    draftRef.current = md
    dirty.current = md !== serverDraft.current
    setDraftState(md)
  }, [])

  // Debounced autosave.
  useEffect(() => {
    if (!enabled || !dirty.current || draft === serverDraft.current) return
    const t = setTimeout(() => {
      if (dirty.current && draftRef.current !== serverDraft.current) mutate(draftRef.current)
    }, AUTOSAVE_MS)
    return () => clearTimeout(t)
  }, [draft, enabled, mutate])

  // Save pending edits when leaving the page.
  useEffect(() => {
    return () => {
      if (enabled && dirty.current && draftRef.current !== serverDraft.current) {
        void api.put(`/tickets/${id}/draft`, { draft_md: draftRef.current }).catch(() => undefined)
      }
    }
  }, [id, enabled])

  // Warn before closing the tab with unsaved edits.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (enabled && dirty.current && draftRef.current !== serverDraft.current) e.preventDefault()
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [enabled])

  const retry = useCallback(() => mutate(draftRef.current), [mutate])

  const restore = useCallback(
    (md: string) => {
      adopt(md, { save: true })
      mutate(md)
    },
    [adopt, mutate],
  )

  // The draft is about to be sent with approve; nothing left to autosave.
  const markClean = useCallback(() => {
    serverDraft.current = draftRef.current
    dirty.current = false
  }, [])

  return { draft, setDraft, resetKey, saveState, retry, restore, adopt, markClean, saving: isPending }
}
