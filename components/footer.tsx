import { formatDate } from "@/lib/utils";

export function Footer() {
  const name = process.env.NEXT_PUBLIC_DEVELOPER_NAME ?? "Developer";
  const github = process.env.NEXT_PUBLIC_GITHUB_URL ?? "#";
  const linkedin = process.env.NEXT_PUBLIC_LINKEDIN_URL ?? "#";

  return (
    <footer className="mt-auto border-t border-zinc-200 bg-zinc-50 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 text-sm text-zinc-500 sm:flex-row">
        <p>
          DocFlow — Local-First Collaborative Editor &copy; {new Date().getFullYear()}
        </p>
        <p className="flex items-center gap-3">
          <span>{name}</span>
          <a
            href={github}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 hover:underline dark:text-indigo-400"
          >
            GitHub
          </a>
          <a
            href={linkedin}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 hover:underline dark:text-indigo-400"
          >
            LinkedIn
          </a>
        </p>
      </div>
    </footer>
  );
}
