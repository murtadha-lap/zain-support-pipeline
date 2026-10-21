import { format, formatDistanceToNowStrict, isValid, parseISO } from "date-fns"

function toDate(value: string | Date | null | undefined) {
  if (!value) return null
  const d = typeof value === "string" ? parseISO(value) : value
  return isValid(d) ? d : null
}

export function timeAgo(value: string | null | undefined) {
  const d = toDate(value)
  return d ? `${formatDistanceToNowStrict(d)} ago` : "—"
}

export function dateTime(value: string | null | undefined) {
  const d = toDate(value)
  return d ? format(d, "d MMM yyyy, HH:mm") : "—"
}

export function shortDate(value: string | null | undefined) {
  const d = toDate(value)
  return d ? format(d, "d MMM") : "—"
}

export function percent(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  return `${(value * 100).toFixed(digits)}%`
}

export function iqd(value: number | null | undefined) {
  if (value === null || value === undefined) return "—"
  return `${new Intl.NumberFormat("en-US").format(value)} IQD`
}

export function duration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return "—"
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`
  return `${(seconds / 86400).toFixed(1)}d`
}

export function initials(name: string | null | undefined) {
  if (!name) return "?"
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")
}

// True when the string is mostly Arabic script, used to pick dir="rtl".
export function isArabic(text: string | null | undefined) {
  if (!text) return false
  const arabic = text.match(/[؀-ۿ]/g)?.length ?? 0
  const latin = text.match(/[A-Za-z]/g)?.length ?? 0
  return arabic > latin
}
