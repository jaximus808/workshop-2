"use client";

import { useState } from "react";

export function CopyLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-stretch overflow-hidden rounded-md border border-border bg-background">
      <code className="min-w-0 flex-1 break-words px-2.5 py-2 font-mono text-xs leading-relaxed">{text}</code>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // clipboard blocked (http, permissions): the text is still selectable
          }
        }}
        className="shrink-0 border-l border-border px-2.5 text-xs text-muted hover:bg-canvas-subtle hover:text-foreground"
        aria-label="Copy"
      >
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}
