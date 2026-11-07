// Wipe the board between sessions:
//   curl -X POST <site>/api/reset -H "Authorization: Bearer $RESET_TOKEN"
import { resetAll } from "@/lib/game";

export async function POST(req: Request) {
  const token = process.env.RESET_TOKEN;
  if (!token) return Response.json({ error: "RESET_TOKEN is not set on the server" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${token}`)
    return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ deleted: await resetAll() });
}
