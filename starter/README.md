# The Forge: build your own MCP server (Level 5)

This folder is a complete MCP server in about 40 lines of TypeScript. It runs locally and talks to Claude Code over **stdio**: Claude Code starts it as a child process and sends JSON-RPC over stdin/stdout. The gauntlet server, by contrast, is **remote** and speaks HTTP. Same protocol, different transport.

## 1. Run it

```bash
cd starter
npm install
claude mcp add forge -- npx tsx "$(pwd)/server.ts"
```

Restart `claude` and run `/mcp`. You should see `forge` connected with one tool, `count_letters`. Try:

> How many r's are in "strawberry"? Use the forge tool.

## 2. Add your own tool

Open `server.ts` and add a second `server.registerTool(...)` call. Give the model something it can't do well on its own:

- **Exact math or dates:** `days_between`, `compound_interest`
- **Real randomness:** `roll_dice`, `random_pick`
- **The outside world:** `weather(city)` via `https://wttr.in/<city>?format=j1`, a GitHub API call
- **Your machine:** read a local file format, list running processes

Write the `description` carefully. It's the only thing the model reads when it decides whether to call your tool.

After editing, restart `claude` (or reconnect with `/mcp`) to pick up changes.

## 3. Use both servers at once

Ask your agent to do something that needs both your tool and the gauntlet, for example "use my forge tool on the passphrase from level 4". Then claim your spot:

> Call claim_forge with my tool's name and a one-sentence description.

## Debugging

- `npm run inspect` opens the MCP Inspector, a web UI for calling your tools by hand.
- Never `console.log` in a stdio server. stdout is the protocol channel. Use `console.error`.
- `claude mcp list` shows every configured server and whether it's healthy.
