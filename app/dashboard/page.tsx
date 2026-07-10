"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { formatDate } from "@/lib/utils";

interface Document {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
  role: string;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const fetchDocuments = async () => {
    const res = await fetch("/api/documents");
    if (res.ok) {
      const data = await res.json();
      setDocuments(data.documents ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const createDocument = async () => {
    setCreating(true);
    const res = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled Document" }),
    });
    if (res.ok) {
      const doc = await res.json();
      window.location.href = `/docs/${doc.id}`;
    }
    setCreating(false);
  };

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">DocFlow</h1>
            <p className="text-sm text-zinc-500">
              Welcome, {session?.user?.name ?? session?.user?.email}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={createDocument}
              disabled={creating}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {creating ? "Creating…" : "+ New Document"}
            </button>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <h2 className="text-lg font-semibold">Your Documents</h2>
        {loading ? (
          <p className="mt-4 text-sm text-zinc-500">Loading…</p>
        ) : documents.length === 0 ? (
          <div className="mt-8 text-center">
            <p className="text-zinc-500">No documents yet.</p>
            <button
              onClick={createDocument}
              className="mt-4 text-sm text-indigo-600 hover:underline"
            >
              Create your first document
            </button>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {documents.map((doc) => (
              <li key={doc.id}>
                <Link
                  href={`/docs/${doc.id}`}
                  className="flex items-center justify-between px-4 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  <div>
                    <p className="font-medium">{doc.title}</p>
                    <p className="mt-0.5 line-clamp-1 text-sm text-zinc-500">
                      {doc.content || "Empty document"}
                    </p>
                  </div>
                  <div className="text-right text-xs text-zinc-400">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
                      {doc.role}
                    </span>
                    <p className="mt-1">{formatDate(doc.updatedAt)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
