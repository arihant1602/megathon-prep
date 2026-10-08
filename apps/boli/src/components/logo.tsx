import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
      <span className="grid size-8 place-items-center rounded-full bg-accent text-accent-fg">बो</span>
      Boli
    </Link>
  );
}
