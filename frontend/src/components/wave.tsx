// Scalloped edge hanging below a band. Colour the band with `text-*` on the parent.
export function Wave({ id }: { id: string }) {
  return (
    <svg aria-hidden="true" className="block h-6 w-full" fill="currentColor">
      <defs>
        <pattern id={id} width="48" height="24" patternUnits="userSpaceOnUse">
          <circle cx="24" cy="0" r="24" />
        </pattern>
      </defs>
      <rect width="100%" height="24" fill={`url(#${id})`} />
    </svg>
  );
}
