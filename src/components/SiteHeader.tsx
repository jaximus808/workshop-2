import Link from "next/link";
import { event } from "@/data/event";

export function SiteHeader({ active }: { active: "board" | "levels" }) {
  const link = (href: string, label: string, on: boolean) => (
    <Link href={href} className={on ? "font-semibold text-foreground" : "text-muted hover:text-foreground"}>
      {label}
    </Link>
  );
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-header">
      <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3">
        <span className="font-mono text-lg font-bold text-accent">&gt;_</span>
        <span className="text-sm font-semibold">
          {event.chapter} · {event.title}
        </span>
        <nav className="ml-auto flex items-center gap-4 text-sm">
          {link("/", "Board", active === "board")}
          {link("/levels", "Levels", active === "levels")}
          {event.slides && (
            <a href={event.slides} target="_blank" rel="noopener noreferrer" className="hidden text-muted hover:text-foreground sm:inline">
              Slides
            </a>
          )}
          <a
            href={event.repo}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-border px-3 py-1 font-medium hover:bg-border/40"
          >
            Repo
          </a>
        </nav>
      </div>
    </header>
  );
}
