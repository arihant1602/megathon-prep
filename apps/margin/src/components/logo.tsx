import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="h-5 w-1 rounded-ui bg-accent" />
      Margin
    </Link>
  );
}
