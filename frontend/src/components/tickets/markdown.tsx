"use client"

import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"

// Every block gets dir="auto" so an Arabic paragraph is right-to-left and an
// English one left-to-right, even inside the same message.
const components: Components = {
  p: ({ children }) => <p dir="auto">{children}</p>,
  li: ({ children }) => <li dir="auto">{children}</li>,
  blockquote: ({ children }) => <blockquote dir="auto">{children}</blockquote>,
  h1: ({ children }) => <h1 dir="auto">{children}</h1>,
  h2: ({ children }) => <h2 dir="auto">{children}</h2>,
  h3: ({ children }) => <h3 dir="auto">{children}</h3>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  ),
}

export function Markdown({
  children,
  className,
  size = "sm",
}: {
  children: string
  className?: string
  size?: "sm" | "base"
}) {
  return (
    <div
      dir="auto"
      className={cn(
        "prose dark:prose-invert font-arabic max-w-none break-words [&_*]:text-start",
        size === "sm" && "prose-sm",
        "prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-headings:mt-3 prose-headings:mb-1.5 first:[&>*]:mt-0 last:[&>*]:mb-0",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
