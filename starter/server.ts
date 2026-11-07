// The Forge: your own MCP server, running locally over stdio.
//
// Your agent launches this file as a child process and talks to it over
// stdin/stdout. Each tool is three things: a name, a description the model
// reads to decide when to call it, and a handler that does the work.
//
// Register it (run inside starter/):
//   claude mcp add forge -- npx tsx "$(pwd)/server.ts"
//   codex mcp add forge -- npx tsx "$(pwd)/server.ts"

import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

const server = new McpServer({ name: "forge", version: "0.1.0" });

// Example tool. LLMs see tokens, not letters, so counting letters is a classic
// thing they get wrong. A tool makes it exact.
server.registerTool(
  "count_letters",
  {
    title: "Count letters",
    description: "Count exactly how many times a letter appears in a piece of text (case-insensitive).",
    inputSchema: z.object({
      text: z.string().describe("The text to search"),
      letter: z.string().length(1).describe("A single letter to count"),
    }),
  },
  async ({ text, letter }) => {
    const n = [...text.toLowerCase()].filter((c) => c === letter.toLowerCase()).length;
    return { content: [{ type: "text", text: `"${letter}" appears ${n} time(s) in "${text}".` }] };
  },
);

// TODO: add your own tool below. Ideas:
//   - days_between(date1, date2): exact date math
//   - random_pick(options): real randomness, which a model can't do
//   - weather(city): call a free API like https://wttr.in/<city>?format=j1
//   - read_csv_column(path, column): read a local file format

// Never console.log() in a stdio server: stdout is the protocol channel.
// Use console.error() for debugging.
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("forge MCP server running on stdio");
