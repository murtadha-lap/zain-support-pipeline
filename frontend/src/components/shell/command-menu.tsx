"use client"

import { Hash, Moon, Search, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { useMe } from "@/lib/hooks"
import { navFor } from "./nav"

export function CommandMenu() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const router = useRouter()
  const { data: me } = useMe()
  const { setTheme, resolvedTheme } = useTheme()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const go = (href: string) => {
    setOpen(false)
    setQuery("")
    router.push(href)
  }

  const refMatch = query.trim().match(/^(zs-?)?(\d{1,6})$/i)

  return (
    <>
      <Button
        variant="outline"
        className="text-muted-foreground hidden h-8 w-56 justify-start gap-2 px-3 text-sm font-normal md:flex"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" />
        Search or jump to…
        <kbd className="bg-muted ml-auto rounded px-1.5 font-mono text-[10px]">Ctrl K</kbd>
      </Button>
      <Button variant="ghost" size="icon" className="size-8 md:hidden" onClick={() => setOpen(true)} aria-label="Search">
        <Search className="size-4" />
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Command menu" description="Jump to a page or ticket">
        <CommandInput placeholder="Type a page, or a ticket number like ZS-000042…" value={query} onValueChange={setQuery} />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          {query.trim() ? (
            <CommandGroup heading="Tickets">
              {refMatch ? (
                <CommandItem value={`open-ticket-${query}`} onSelect={() => go(`/app/tickets/${Number(refMatch[2])}`)}>
                  <Hash className="size-4" /> Open ticket ZS-{refMatch[2].padStart(6, "0")}
                </CommandItem>
              ) : null}
              <CommandItem value={`search-${query}`} onSelect={() => go(`/app/tickets?q=${encodeURIComponent(query.trim())}`)}>
                <Search className="size-4" /> Search tickets for “{query.trim()}”
              </CommandItem>
            </CommandGroup>
          ) : null}
          {navFor(me?.role).map((group) => (
            <CommandGroup key={group.label} heading={group.label}>
              {group.items.map((item) => (
                <CommandItem key={item.href} value={`${item.title} ${item.description ?? ""}`} onSelect={() => go(item.href)}>
                  <item.icon className="size-4" />
                  {item.title}
                  {item.description ? (
                    <span className="text-muted-foreground ml-2 truncate text-xs">{item.description}</span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          <CommandSeparator />
          <CommandGroup heading="Preferences">
            <CommandItem
              value="toggle theme dark light"
              onSelect={() => {
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
                setOpen(false)
              }}
            >
              {resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              Switch to {resolvedTheme === "dark" ? "light" : "dark"} theme
              <CommandShortcut>Theme</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}
