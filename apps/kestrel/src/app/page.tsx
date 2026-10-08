import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Brain, FileCsv, ListChecks, MagnifyingGlass, Scales, Waveform } from "@phosphor-icons/react/ssr";
import { Reveal } from "@mega/platform/ui/reveal";
import { Logo } from "@/components/logo";
import { ShapChart, type Contribution } from "@/components/shap-chart";

// Sample output in the exact shape the risk service returns. Labeled as sample in the UI.
const SAMPLE: Contribution[] = [
  { feature: "is_foreign", label: "Foreign merchant", value: 1, contribution: 1.62 },
  { feature: "hour", label: "Hour of day", value: 3, contribution: 0.94 },
  { feature: "account_age_days", label: "Account age (days)", value: 41, contribution: 0.71 },
  { feature: "amount", label: "Transaction amount", value: 18450, contribution: 0.38 },
  { feature: "txns_last_24h", label: "Transactions in last 24h", value: 1, contribution: -0.27 },
];

const STEPS = [
  { icon: Waveform, title: "Score", body: "Send a transaction or a renewal. The model returns a probability and a low, medium or high band." },
  { icon: MagnifyingGlass, title: "Explain", body: "Every score comes with exact Shapley values, so you see which inputs pushed it and by how much." },
  { icon: Scales, title: "Decide", body: "Save it as a case, escalate or clear it, and keep a note for the audit trail." },
];

export default function Landing() {
  return (
    <div className="min-h-[100dvh]">
      <header className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-8">
        <Logo />
        <nav className="flex items-center gap-6 text-sm">
          <a href="#how" className="hidden text-muted transition hover:text-fg sm:inline">
            How it works
          </a>
          <a href="#capabilities" className="hidden text-muted transition hover:text-fg sm:inline">
            Capabilities
          </a>
          <Link
            href="/console"
            className="rounded-ui bg-accent px-4 py-2 font-medium text-accent-fg transition active:scale-[0.98]"
          >
            Open console
          </Link>
        </nav>
      </header>

      <main>
        {/* Hero: asymmetric split, real component preview on the right */}
        <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 pt-12 pb-20 md:px-8 md:pt-20 lg:grid-cols-[1.05fr_1fr]">
          <div className="rise">
            <h1 className="max-w-[22ch] text-4xl leading-[1.05] font-semibold tracking-tighter md:text-5xl">
              See why a payment looks wrong, before it clears.
            </h1>
            <p className="mt-6 max-w-[48ch] text-lg leading-relaxed text-muted">
              Kestrel scores card transactions and renewals, then shows the exact factors behind every score so analysts
              can act fast.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/console"
                className="inline-flex items-center gap-2 rounded-ui bg-accent px-5 py-3 font-medium text-accent-fg transition active:scale-[0.98]"
              >
                Open console <ArrowRight weight="bold" />
              </Link>
              <a href="#how" className="rounded-ui border border-line px-5 py-3 font-medium transition hover:bg-surface">
                How it works
              </a>
            </div>
          </div>

          <div className="rise rise-late">
            <figure className="rounded-ui border border-line bg-surface p-5 shadow-[0_24px_60px_-30px_rgb(36_80_200/0.35)]">
              <div className="flex items-baseline justify-between gap-4">
                <div>
                  <p className="text-sm text-muted">Sample transaction</p>
                  <p className="mt-1 font-mono text-3xl font-semibold">
                    87.4<span className="text-lg text-muted">%</span>
                  </p>
                </div>
                <span className="rounded-ui bg-accent-soft px-2.5 py-1 text-sm font-medium text-accent">High risk</span>
              </div>
              <div className="mt-4">
                <ShapChart data={SAMPLE} height={220} />
              </div>
              <figcaption className="mt-3 text-sm text-muted">
                Foreign merchant at 3 a.m. on a six-week-old account. Bars to the right raise the score.
              </figcaption>
            </figure>
          </div>
        </section>

        {/* How it works: image + verb list */}
        <section id="how" className="border-t border-line">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 md:px-8 lg:grid-cols-2 lg:py-28">
            <Reveal className="relative aspect-[4/3] overflow-hidden rounded-ui">
              <Image
                src="https://picsum.photos/seed/kestrel-operations-desk/1200/900?grayscale"
                alt="An operations desk with monitors"
                fill
                unoptimized
                className="object-cover"
              />
            </Reveal>
            <div className="flex flex-col justify-center">
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">From score to decision in one screen.</h2>
              <ul className="mt-10 flex flex-col gap-8">
                {STEPS.map(({ icon: Icon, title, body }, i) => (
                  <Reveal key={title} delay={i * 0.06}>
                    <li className="flex gap-4">
                      <Icon size={26} weight="duotone" className="mt-0.5 shrink-0 text-accent" />
                      <div>
                        <h3 className="font-semibold">{title}</h3>
                        <p className="mt-1 max-w-[52ch] leading-relaxed text-muted">{body}</p>
                      </div>
                    </li>
                  </Reveal>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Capabilities: 4-cell bento with varied backgrounds */}
        <section id="capabilities" className="mx-auto max-w-7xl px-4 py-20 md:px-8 lg:py-28">
          <h2 className="max-w-[24ch] text-3xl font-semibold tracking-tight md:text-4xl">
            Built for reviewers, not for black boxes.
          </h2>
          <div className="mt-12 grid gap-4 md:grid-cols-3 md:grid-rows-2">
            <Reveal className="relative min-h-72 overflow-hidden rounded-ui md:col-span-2 md:row-span-1">
              <Image
                src="https://picsum.photos/seed/kestrel-city-night/1400/700"
                alt="A city at night"
                fill
                unoptimized
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0b0e13]/85 via-[#0b0e13]/30 to-transparent" />
              <div className="absolute bottom-0 p-6 text-[#f3f5f9]">
                <Brain size={28} weight="duotone" />
                <h3 className="mt-3 text-xl font-semibold">Exact attributions</h3>
                <p className="mt-1 max-w-[46ch] text-sm leading-relaxed text-[#d5dae3]">
                  TreeSHAP values computed inside XGBoost. No sampling, no approximation, same answer every time.
                </p>
              </div>
            </Reveal>
            <Reveal delay={0.05} className="flex flex-col justify-between rounded-ui bg-accent p-6 text-accent-fg">
              <ListChecks size={28} weight="duotone" />
              <div>
                <h3 className="text-xl font-semibold">Case queue</h3>
                <p className="mt-1 text-sm leading-relaxed opacity-85">
                  Open, escalated or cleared, with a note on every decision.
                </p>
              </div>
            </Reveal>
            <Reveal delay={0.1} className="flex flex-col justify-between rounded-ui border border-line bg-surface p-6">
              <FileCsv size={28} weight="duotone" className="text-accent" />
              <div>
                <h3 className="text-xl font-semibold">Bring your own CSV</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  Upload labelled data, pick the target column, and a new model is live in seconds.
                </p>
              </div>
            </Reveal>
            <Reveal delay={0.15} className="rounded-ui border border-line bg-accent-soft p-6 md:col-span-2">
              <h3 className="text-xl font-semibold">Plain-English summaries</h3>
              <p className="mt-1 max-w-[56ch] text-sm leading-relaxed text-muted">
                A language model turns the top drivers into two or three sentences and a suggested next step, written
                for operations staff.
              </p>
              <blockquote className="mt-5 max-w-[60ch] border-l-2 border-accent pl-4 text-sm leading-relaxed">
                &ldquo;A foreign merchant late at night on a new account is the main reason. Next step: hold the
                payment and confirm with the customer by SMS.&rdquo;
                <span className="mt-2 block text-xs text-muted">Example summary</span>
              </blockquote>
            </Reveal>
          </div>
        </section>

        {/* Closing band */}
        <section className="border-t border-line">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-4 py-20 md:flex-row md:items-center md:px-8">
            <h2 className="max-w-[22ch] text-3xl font-semibold tracking-tight md:text-4xl">
              Two models ship ready: card fraud and customer churn.
            </h2>
            <Link
              href="/console"
              className="inline-flex shrink-0 items-center gap-2 rounded-ui bg-accent px-5 py-3 font-medium text-accent-fg transition active:scale-[0.98]"
            >
              Open console <ArrowRight weight="bold" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted md:px-8">
          <Logo />
          <p>Built for Megathon. Scores are decision support, not decisions.</p>
        </div>
      </footer>
    </div>
  );
}
