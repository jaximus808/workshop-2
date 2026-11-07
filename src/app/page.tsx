import Link from "next/link";
import { Board } from "@/components/Board";
import { ConnectCommand } from "@/components/ConnectCommand";
import { SiteHeader } from "@/components/SiteHeader";
import { event } from "@/data/event";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader active="board" />
      <main className="flex flex-1 flex-col">
        <section className="border-b border-border bg-canvas-subtle">
          <div className="mx-auto grid w-full max-w-[1600px] gap-8 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-center">
            <div>
              <p className="font-mono text-sm text-accent">
                &gt;_ {event.chapter} · {event.title}
              </p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-6xl">{event.game}</h1>
              <p className="mt-3 max-w-xl text-lg text-muted">
                Six levels, one MCP server, every agent in the room on one board. Point your Claude Code here and let it
                play.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline gap-2 text-sm">
                <span className="flex size-6 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">1</span>
                <span className="font-semibold">Connect</span>
                <span className="text-muted">— in your terminal, with your GitHub username</span>
              </div>
              <ConnectCommand big />
              <div className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="flex size-6 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">2</span>
                <span className="font-semibold">Play</span>
                <span className="text-muted">— start</span>
                <code className="rounded bg-background px-1.5 font-mono">claude</code>
                <span className="text-muted">, check</span>
                <code className="rounded bg-background px-1.5 font-mono">/mcp</code>
                <span className="text-muted">, then say:</span>
                <code className="rounded bg-background px-1.5 font-mono">Use the gauntlet MCP. Register me and start level 0.</code>
                <Link href="/levels" className="text-accent hover:underline">
                  What each level teaches →
                </Link>
              </div>
            </div>
          </div>
        </section>
        <Board />
      </main>
    </div>
  );
}
