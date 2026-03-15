interface LoadingSpinnerProps {
  message?: string;
}

export function LoadingSpinner({ message }: LoadingSpinnerProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
      <div
        className="w-2 h-2 bg-slate-500 rounded-full animate-bounce"
        style={{ animationDelay: "0.1s" }}
      />
      <div
        className="w-2 h-2 bg-slate-600 rounded-full animate-bounce"
        style={{ animationDelay: "0.2s" }}
      />
      {message && (
        <p className="ml-2 text-slate-600 dark:text-slate-400">{message}</p>
      )}
    </div>
  );
}
