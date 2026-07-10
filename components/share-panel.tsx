"use client";

import { useCallback, useEffect, useState } from "react";

interface Member {
  id: string;
  role: "OWNER" | "EDITOR" | "VIEWER";
  user: { id: string; name?: string | null; email?: string | null };
}

interface SharePanelProps {
  documentId: string;
  isOwner: boolean;
  open: boolean;
  onClose: () => void;
}

export function SharePanel({
  documentId,
  isOwner,
  open,
  onClose,
}: SharePanelProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"EDITOR" | "VIEWER">("EDITOR");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchMembers = useCallback(async () => {
    const res = await fetch(`/api/documents/${documentId}/members`);
    if (res.ok) {
      const data = await res.json();
      setMembers(data.members ?? []);
    }
  }, [documentId]);

  useEffect(() => {
    if (open) fetchMembers();
  }, [open, fetchMembers]);

  if (!open) return null;

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/documents/${documentId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Invite failed");
        return;
      }
      setEmail("");
      await fetchMembers();
    } finally {
      setLoading(false);
    }
  };

  const updateRole = async (userId: string, nextRole: "EDITOR" | "VIEWER") => {
    await fetch(`/api/documents/${documentId}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role: nextRole }),
    });
    await fetchMembers();
  };

  const removeMember = async (userId: string) => {
    await fetch(`/api/documents/${documentId}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, remove: true }),
    });
    await fetchMembers();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Share document"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Share document</h2>
          <button
            onClick={onClose}
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            aria-label="Close share panel"
          >
            Close
          </button>
        </div>

        {isOwner && (
          <form onSubmit={invite} className="mb-4 space-y-2">
            {error && (
              <p className="rounded-md bg-red-50 p-2 text-xs text-red-700" role="alert">
                {error}
              </p>
            )}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Collaborator email"
              required
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              aria-label="Collaborator email"
            />
            <div className="flex gap-2">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "EDITOR" | "VIEWER")}
                className="rounded-md border border-zinc-300 px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                aria-label="Role"
              >
                <option value="EDITOR">Editor</option>
                <option value="VIEWER">Viewer</option>
              </select>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-md bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? "Inviting…" : "Invite"}
              </button>
            </div>
            <p className="text-xs text-zinc-500">
              Viewers can read but cannot push sync updates. Editors can edit and sync.
            </p>
          </form>
        )}

        <ul className="max-h-60 space-y-2 overflow-y-auto" role="list">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between rounded-md border border-zinc-100 px-3 py-2 text-sm dark:border-zinc-800"
            >
              <div>
                <p className="font-medium">{m.user.name ?? m.user.email}</p>
                <p className="text-xs text-zinc-500">{m.user.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {isOwner && m.role !== "OWNER" ? (
                  <>
                    <select
                      value={m.role}
                      onChange={(e) =>
                        updateRole(m.user.id, e.target.value as "EDITOR" | "VIEWER")
                      }
                      className="rounded border border-zinc-300 px-1 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                      aria-label={`Role for ${m.user.email}`}
                    >
                      <option value="EDITOR">Editor</option>
                      <option value="VIEWER">Viewer</option>
                    </select>
                    <button
                      onClick={() => removeMember(m.user.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">
                    {m.role}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
