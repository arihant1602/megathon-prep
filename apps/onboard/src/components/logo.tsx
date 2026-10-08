import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-mono text-sm font-semibold tracking-tight">
      <span className="size-3 rounded-ui bg-accent" />
      onboard
    </Link>
  );
}
