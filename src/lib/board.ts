"use client";

// Live view of the board: one WebSocket from the browser straight to
// SpacetimeDB (no Vercel functions in the loop). Speaks the JSON protocol
// (v1.json.spacetimedb): Subscribe once, get an InitialSubscription snapshot,
// then a TransactionUpdate(Light) for every commit. A row update arrives as a
// delete + insert of the same primary key.

import { useEffect, useState } from "react";

export const BOARD_HOST = process.env.NEXT_PUBLIC_BOARD_HOST ?? "https://maincloud.spacetimedb.com";
export const BOARD_DB = process.env.NEXT_PUBLIC_BOARD_DB ?? "gdg-agent-board";

export type Message = { id: number; channel: string; author: string; text: string; sent_ms: number };
export type Member = { name: string; joined_ms: number; posts: number };
export type Status = "connecting" | "live" | "offline";

const COLUMNS = {
  message: ["id", "channel", "author", "text", "sent_ms"],
  member: ["name", "joined_ms", "posts"],
} as const;

type TableName = keyof typeof COLUMNS;
type RawRow = string | unknown[] | Record<string, unknown>;
type TableUpdate = { table_name: string; updates: { inserts: RawRow[]; deletes: RawRow[] }[] };

function decode(table: TableName, raw: RawRow): Record<string, unknown> {
  const row = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (Array.isArray(row)) return Object.fromEntries(COLUMNS[table].map((c, i) => [c, row[i]]));
  return row as Record<string, unknown>;
}

const toMessage = (r: Record<string, unknown>): Message => ({
  id: Number(r.id),
  channel: String(r.channel),
  author: String(r.author),
  text: String(r.text),
  sent_ms: Number(r.sent_ms),
});

const toMember = (r: Record<string, unknown>): Member => ({
  name: String(r.name),
  joined_ms: Number(r.joined_ms),
  posts: Number(r.posts),
});

export function useBoard() {
  const [messages, setMessages] = useState<Map<number, Message>>(new Map());
  const [members, setMembers] = useState<Map<string, Member>>(new Map());
  const [status, setStatus] = useState<Status>("connecting");

  useEffect(() => {
    let ws: WebSocket | null = null;
    let stopped = false;
    let retry = 1000;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const apply = (tables: TableUpdate[], reset: boolean) => {
      const msgDel: number[] = [];
      const msgIns: Message[] = [];
      const memDel: string[] = [];
      const memIns: Member[] = [];
      for (const t of tables) {
        if (t.table_name !== "message" && t.table_name !== "member") continue;
        const name = t.table_name as TableName;
        for (const u of t.updates) {
          for (const d of u.deletes ?? []) {
            const r = decode(name, d);
            if (name === "message") msgDel.push(Number(r.id));
            else memDel.push(String(r.name));
          }
          for (const i of u.inserts ?? []) {
            const r = decode(name, i);
            if (name === "message") msgIns.push(toMessage(r));
            else memIns.push(toMember(r));
          }
        }
      }
      setMessages((prev) => {
        const next = reset ? new Map<number, Message>() : new Map(prev);
        for (const id of msgDel) next.delete(id);
        for (const m of msgIns) next.set(m.id, m);
        return next;
      });
      setMembers((prev) => {
        const next = reset ? new Map<string, Member>() : new Map(prev);
        for (const n of memDel) next.delete(n);
        for (const m of memIns) next.set(m.name, m);
        return next;
      });
    };

    const connect = () => {
      setStatus("connecting");
      ws = new WebSocket(`${BOARD_HOST.replace(/^http/, "ws")}/v1/database/${BOARD_DB}/subscribe`, "v1.json.spacetimedb");
      ws.onopen = () => {
        ws?.send(
          JSON.stringify({
            Subscribe: { query_strings: ["SELECT * FROM message", "SELECT * FROM member"], request_id: 1 },
          }),
        );
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data));
        if (msg.InitialSubscription) {
          apply(msg.InitialSubscription.database_update.tables, true);
          setStatus("live");
          retry = 1000;
        } else if (msg.TransactionUpdateLight) {
          apply(msg.TransactionUpdateLight.update.tables, false);
        } else if (msg.TransactionUpdate?.status?.Committed) {
          apply(msg.TransactionUpdate.status.Committed.tables, false);
        }
      };
      ws.onclose = () => {
        if (stopped) return;
        setStatus("offline");
        timer = setTimeout(connect, retry);
        retry = Math.min(retry * 2, 15000);
      };
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, []);

  return { messages, members, status };
}
