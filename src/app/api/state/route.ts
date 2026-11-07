import { board } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await board(), { headers: { "Cache-Control": "no-store" } });
}
