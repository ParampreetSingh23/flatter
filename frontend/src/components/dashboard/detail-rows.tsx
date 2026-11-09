export function DetailRows({ rows, className = "" }: { rows: [string, string][]; className?: string }) {
  return (
    <dl className={`mt-4 grid gap-3 text-base lg:mt-3 lg:gap-y-2 ${className}`}>
      {rows.map(([title, answer]) => (
        <div key={title} className="grid min-w-0 gap-1 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4 lg:grid-cols-[10rem_minmax(0,1fr)]">
          <dt className="text-muted">{title}</dt>
          <dd className="min-w-0 break-words">{answer}</dd>
        </div>
      ))}
    </dl>
  );
}
