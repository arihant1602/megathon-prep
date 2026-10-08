import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CloudArrowUp, Eye, UsersThree } from "@phosphor-icons/react/ssr";
import { Logo } from "@/components/logo";

export default function Landing() {
  return (
    <div className="min-h-[100dvh]">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-8">
        <Logo />
        <nav className="flex items-center gap-6 text-sm">
          <a href="#sync" className="hidden text-muted transition hover:text-fg sm:inline">
            How sync works
          </a>
          <Link href="/docs" className="rounded-ui bg-accent px-4 py-2 font-medium text-accent-fg transition active:scale-[0.98]">
            Start writing
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-20 md:px-8 md:pt-20 lg:grid-cols-[1fr_1fr]">
          <div>
            <h1 className="max-w-[20ch] text-4xl leading-[1.08] font-semibold tracking-tighter md:text-5xl">
              Write together, even when the Wi-Fi drops.
            </h1>
            <p className="mt-6 max-w-[44ch] text-lg leading-relaxed text-muted">
              Margin syncs every keystroke live, shows who is typing where, and merges offline edits the moment you
              reconnect.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/docs"
                className="inline-flex items-center gap-2 rounded-ui bg-accent px-5 py-3 font-medium text-accent-fg transition active:scale-[0.98]"
              >
                Start writing <ArrowRight weight="bold" />
              </Link>
              <a href="#sync" className="rounded-ui border border-line px-5 py-3 font-medium transition hover:bg-surface">
                How sync works
              </a>
            </div>
          </div>
          <div className="relative aspect-[5/4] overflow-hidden rounded-ui">
            <Image
              src="https://picsum.photos/seed/margin-desk-notebook/1200/960"
              alt="A desk with an open notebook"
              fill
              priority
              unoptimized
              className="object-cover"
            />
          </div>
        </section>

        <section className="border-t border-line">
          <div className="mx-auto grid max-w-6xl gap-4 px-4 py-20 md:grid-cols-[1.3fr_1fr] md:grid-rows-2 md:px-8 lg:py-28">
            <article className="flex flex-col justify-between gap-8 rounded-ui bg-accent-soft p-8 md:row-span-2">
              <UsersThree size={32} weight="duotone" className="text-accent" />
              <div>
                <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">See every cursor, with a name on it.</h2>
                <p className="mt-3 max-w-[44ch] leading-relaxed text-muted">
                  Collaborators appear in the margin of the page as they type. No refresh, no lock icons, no &ldquo;someone
                  else is editing&rdquo; banners.
                </p>
              </div>
            </article>
            <article className="rounded-ui border border-line bg-surface p-6">
              <Eye size={26} weight="duotone" className="text-accent" />
              <h3 className="mt-4 text-lg font-semibold">Editors and viewers</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Share by email. Viewers watch changes arrive live but cannot type; the server rejects their writes.
              </p>
            </article>
            <article className="rounded-ui border border-line bg-surface p-6">
              <CloudArrowUp size={26} weight="duotone" className="text-accent" />
              <h3 className="mt-4 text-lg font-semibold">Offline first</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Edits are kept in the browser while you are disconnected and sent when the connection returns.
              </p>
            </article>
          </div>
        </section>

        <section id="sync" className="border-t border-line bg-surface">
          <div className="mx-auto max-w-3xl px-4 py-24 text-center md:px-8">
            <h2 className="text-3xl leading-tight font-semibold tracking-tight md:text-4xl">
              Built on CRDTs, so two people typing in the same sentence both keep their words.
            </h2>
            <p className="mx-auto mt-5 max-w-[56ch] leading-relaxed text-muted">
              Every document is a Yjs structure. Changes merge the same way on every device, in any order, so there is no
              central server deciding who wins.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted md:px-8">
          <Logo />
          <p>Yjs, Hocuspocus and TipTap under the hood.</p>
        </div>
      </footer>
    </div>
  );
}
