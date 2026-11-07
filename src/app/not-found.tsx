import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
      <h1 className="text-3xl font-semibold">Dead end.</h1>
      <p className="text-muted">Like a maze room with one door. Go back the way you came.</p>
      <Link href="/" className="text-accent hover:underline">
        Back to the board
      </Link>
    </main>
  );
}
