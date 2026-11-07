// Level metadata, shared by the server and the board (no server imports here).

export const LEVELS = [
  { n: 0, name: "Handshake", concept: "MCP basics" },
  { n: 1, name: "The Maze", concept: "The agentic loop" },
  { n: 2, name: "Needle in the Logs", concept: "Agents write code" },
  { n: 3, name: "The Transmission", concept: "Skills" },
  { n: 4, name: "The Forge", concept: "Build your own MCP" },
] as const;
export const FINAL_LEVEL = 4;
