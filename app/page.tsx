import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-20">
      <div className="max-w-2xl text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5 text-sm text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
          <span className="h-2 w-2 rounded-full bg-indigo-500" />
          Local-First · Offline Sync · Version Control
        </div>
        <h1 className="text-5xl font-bold tracking-tight text-zinc-900 dark:text-white">
          DocFlow
        </h1>
        <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
          A collaborative document editor that works offline. Edit without
          network, sync when connected, and travel through document history
          safely.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/register"
            className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Get Started
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-zinc-300 px-6 py-3 text-sm font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Sign In
          </Link>
        </div>
        <div className="mt-16 grid gap-4 text-left sm:grid-cols-3">
          {[
            {
              title: "Local-First",
              desc: "IndexedDB is the source of truth. Zero network blocking on edits.",
            },
            {
              title: "Conflict Resolution",
              desc: "Deterministic operation merging with Lamport clocks — no data loss.",
            },
            {
              title: "Version History",
              desc: "Capture snapshots and restore safely without corrupting shared state.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                {f.title}
              </h3>
              <p className="mt-1 text-sm text-zinc-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
