"use client";

import { useEffect, useState } from "react";
import { event } from "@/data/event";

export function useOrigin() {
  const [origin, setOrigin] = useState(event.siteUrl);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- window is only known after mount
    setOrigin(window.location.origin);
  }, []);
  return origin;
}

const NAME = "<your-github-username>";

type Tab = { id: string; label: string; prefix: string; copy: (url: string) => string; note?: (url: string) => string };

const TABS: Tab[] = [
  {
    id: "claude",
    label: "Claude Code",
    prefix: "claude mcp add --transport http gauntlet",
    copy: (url) => `claude mcp add --transport http gauntlet "${url}"`,
  },
  {
    id: "codex",
    label: "Codex",
    prefix: "codex mcp add gauntlet --url",
    copy: (url) => `codex mcp add gauntlet --url "${url}"`,
  },
  {
    id: "other",
    label: "Cursor / other",
    prefix: "",
    copy: (url) => url,
    note: (url) =>
      `Add this URL as a remote (Streamable HTTP) MCP server named gauntlet. Cursor: put {"mcpServers": {"gauntlet": {"url": "${url}"}}} in ~/.cursor/mcp.json.`,
  },
];

export function ConnectCommand({ big = false }: { big?: boolean }) {
  const origin = useOrigin();
  const [tabId, setTabId] = useState(TABS[0].id);
  const [copied, setCopied] = useState(false);
  const tab = TABS.find((t) => t.id === tabId) ?? TABS[0];
  const url = `${origin}/mcp?name=${NAME}`;

  const urlParts = (
    <>
      <span className="text-accent">{origin}/mcp?name=</span>
      <span className="text-success">{NAME}</span>
    </>
  );

  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <div className="flex items-end gap-1 border-b border-border bg-canvas-subtle px-2 pt-2">
        <div role="tablist" aria-label="Your agent" className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={t.id === tab.id}
              onClick={() => {
                setTabId(t.id);
                setCopied(false);
              }}
              className={`-mb-px rounded-t-md border px-3 py-1.5 text-sm font-medium ${
                t.id === tab.id ? "border-border border-b-background bg-background text-foreground" : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(tab.copy(url));
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="mb-1.5 ml-auto rounded-md border border-border bg-background px-3 py-1 text-sm font-medium hover:bg-border/40"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <pre className={`overflow-x-auto p-4 font-mono leading-relaxed ${big ? "text-base sm:text-lg" : "text-[13px]"}`}>
        <code>
          {tab.prefix ? (
            <>
              <span className="select-none text-muted">$ </span>
              {tab.prefix} \{"\n"}
              {"    "}&quot;{urlParts}&quot;
            </>
          ) : (
            urlParts
          )}
        </code>
      </pre>
      {tab.note && <p className="border-t border-border px-4 py-2.5 text-xs text-muted">{tab.note(url)}</p>}
    </div>
  );
}
