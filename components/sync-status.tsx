import { cn } from "@/lib/utils";
import type { ConnectionStatus } from "@/hooks/use-sync";

const STATUS_CONFIG: Record<
  ConnectionStatus,
  { label: string; color: string; dot: string }
> = {
  online: {
    label: "Synced",
    color: "text-emerald-700 bg-emerald-50 border-emerald-200",
    dot: "bg-emerald-500",
  },
  offline: {
    label: "Offline",
    color: "text-amber-700 bg-amber-50 border-amber-200",
    dot: "bg-amber-500",
  },
  syncing: {
    label: "Syncing…",
    color: "text-blue-700 bg-blue-50 border-blue-200",
    dot: "bg-blue-500 animate-pulse",
  },
  error: {
    label: "Sync error",
    color: "text-red-700 bg-red-50 border-red-200",
    dot: "bg-red-500",
  },
};

interface SyncStatusProps {
  status: ConnectionStatus;
  pendingCount: number;
  onRetry?: () => void;
}

export function SyncStatus({ status, pendingCount, onRetry }: SyncStatusProps) {
  const config = STATUS_CONFIG[status];

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
        config.color
      )}
      role="status"
      aria-live="polite"
    >
      <span className={cn("h-2 w-2 rounded-full", config.dot)} aria-hidden />
      <span>{config.label}</span>
      {pendingCount > 0 && (
        <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px]">
          {pendingCount} pending
        </span>
      )}
      {status === "error" && onRetry && (
        <button
          onClick={onRetry}
          className="underline hover:no-underline"
          aria-label="Retry sync"
        >
          Retry
        </button>
      )}
    </div>
  );
}
