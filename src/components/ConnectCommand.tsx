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

export function ConnectCommand({ big = false }: { big?: boolean }) {
  const origin = useOrigin();
  const [copied, setCopied] = useState(false);
  const cmd = `claude mcp add --transport http gauntlet ${origin}/mcp --header "X-Agent-Name: <your-github-username>"`;

  return (
    <div className="relative rounded-md border border-border bg-canvas-subtle">
      <pre className={`overflow-x-auto p-4 pr-24 font-mono leading-relaxed ${big ? "text-base sm:text-lg" : "text-[13px]"}`}>
        <code>
          <span className="text-muted select-none">$ </span>
          claude mcp add --transport http gauntlet <span className="text-accent">{origin}/mcp</span> \{"\n"}
          {"    "}--header <span className="text-success">&quot;X-Agent-Name: &lt;your-github-username&gt;&quot;</span>
        </code>
      </pre>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(cmd);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute right-3 top-3 rounded-md border border-border bg-background px-3 py-1 text-sm font-medium hover:bg-border/40"
      >
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}
