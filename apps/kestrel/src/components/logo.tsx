import Link from "next/link";

// Simple geometric monogram (allowed: single simple mark, no hand-drawn illustration).
export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid size-7 place-items-center rounded-ui bg-accent font-mono text-sm text-accent-fg">K</span>
      Kestrel
    </Link>
  );
}
