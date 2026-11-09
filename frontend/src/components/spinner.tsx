// Neutral loader; primary color stays reserved for actions and the wordmark.
export function Spinner({ label = "Loading", tone = "blue", className = "size-10" }: { label?: string; tone?: "blue" | "light"; className?: string }) {
  const ring = tone === "light" ? "border-white/30 border-t-white" : "border-hairline border-t-ink";
  return (
    <span role="status" className="inline-flex items-center justify-center">
      <span aria-hidden="true" className={`${className} animate-spin rounded-full border-4 ${ring} motion-reduce:animate-[spin_3s_linear_infinite]`} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

// Centered block for page and route-level fallbacks.
export const PageSpinner = ({ label = "Loading", tone = "blue" }: { label?: string; tone?: "blue" | "light" }) => (
  <div className="flex min-h-[50vh] w-full items-center justify-center p-8">
    <Spinner label={label} tone={tone} className="size-12" />
  </div>
);
