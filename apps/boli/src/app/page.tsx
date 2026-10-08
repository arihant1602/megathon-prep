import Image from "next/image";
import Link from "next/link";
import { ChatCircleText, Microphone, SpeakerHigh, Translate } from "@phosphor-icons/react/ssr";
import { Reveal } from "@mega/platform/ui/reveal";
import { Logo } from "@/components/logo";
import { NATIVE } from "@/lib/languages";

const DOMAINS = [
  { seed: "boli-paddy-field", title: "Farming", body: "Pest on the leaves, rain next week, today's mandi price, PM-KISAN status." },
  { seed: "boli-clinic-queue", title: "Health", body: "What a prescription says, when to see a doctor, how Ayushman Bharat works." },
  { seed: "boli-village-market", title: "Money", body: "UPI, KYC, loan basics, and how to spot a fraud call before it costs you." },
  { seed: "boli-railway-platform", title: "Travel", body: "Directions, local food, train help, and what to say at the counter." },
];

const FLOW = [
  { icon: Microphone, title: "Speak", body: "Bhashini speech recognition writes down what you said." },
  { icon: Translate, title: "Translate", body: "Your question is translated into English for the model." },
  { icon: ChatCircleText, title: "Answer", body: "A language model answers in short, simple sentences." },
  { icon: SpeakerHigh, title: "Listen", body: "The answer comes back in your language, read aloud." },
];

export default function Landing() {
  const names = Object.values(NATIVE);
  return (
    <div className="min-h-[100dvh] overflow-x-clip">
      <header className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-8">
        <Logo />
        <nav className="flex items-center gap-6 text-sm">
          <a href="#topics" className="hidden text-muted transition hover:text-fg sm:inline">
            Topics
          </a>
          <a href="#how" className="hidden text-muted transition hover:text-fg sm:inline">
            How it works
          </a>
          <Link href="/talk" className="rounded-ui bg-accent px-4 py-2 font-medium text-accent-fg transition active:scale-[0.98]">
            Start talking
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl items-center gap-10 px-4 pt-10 pb-16 md:px-8 md:pt-16 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rise">
            <h1 className="max-w-[16ch] text-4xl leading-[1.05] font-semibold tracking-tighter md:text-6xl">
              Ask in your language. Hear the answer back.
            </h1>
            <p className="mt-6 max-w-[46ch] text-lg leading-relaxed text-muted">
              Boli listens in Hindi, Telugu, Tamil and ten more languages, then answers out loud about crops, health and
              money.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/talk"
                className="inline-flex items-center gap-2 rounded-ui bg-accent px-6 py-3 font-medium text-accent-fg transition active:scale-[0.98]"
              >
                <Microphone weight="fill" /> Start talking
              </Link>
              <a href="#how" className="rounded-ui border border-line px-6 py-3 font-medium transition hover:bg-surface">
                How it works
              </a>
            </div>
          </div>
          <div className="rise rise-late relative aspect-[4/5] overflow-hidden rounded-ui lg:-mb-8">
            <Image
              src="https://picsum.photos/seed/boli-farmer-phone/900/1125"
              alt="A person outdoors holding a phone"
              fill
              priority
              unoptimized
              className="object-cover"
            />
          </div>
        </section>

        {/* One marquee: breadth of supported languages, in their own scripts */}
        <section aria-label="Supported languages" className="border-y border-line bg-surface py-6">
          <div className="flex w-max gap-12 text-3xl font-medium text-muted marquee-track md:text-4xl">
            {[...names, ...names].map((n, i) => (
              <span key={i} aria-hidden={i >= names.length}>
                {n}
              </span>
            ))}
          </div>
        </section>

        <section id="topics" className="mx-auto max-w-7xl px-4 py-20 md:px-8 lg:py-28">
          <h2 className="max-w-[20ch] text-3xl font-semibold tracking-tight md:text-4xl">Help for the questions people actually ask.</h2>
          <div className="-mx-4 mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
            {DOMAINS.map((d, i) => (
              <Reveal key={d.title} delay={i * 0.05} className="w-[78vw] shrink-0 snap-start sm:w-[45vw] md:w-auto">
                <article className="overflow-hidden rounded-ui border border-line bg-surface">
                  <div className="relative aspect-[4/3]">
                    <Image src={`https://picsum.photos/seed/${d.seed}/800/600`} alt="" fill unoptimized className="object-cover" />
                  </div>
                  <div className="p-5">
                    <h3 className="text-lg font-semibold">{d.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{d.body}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        <section id="how" className="border-t border-line bg-accent-soft/60">
          <div className="mx-auto max-w-7xl px-4 py-20 md:px-8 lg:py-28">
            <h2 className="max-w-[22ch] text-3xl font-semibold tracking-tight md:text-4xl">One question, four quick hops.</h2>
            <ol className="relative mt-12 grid gap-10 md:grid-cols-4 md:gap-6">
              <div aria-hidden className="absolute top-6 right-8 left-8 hidden h-px bg-line md:block" />
              {FLOW.map(({ icon: Icon, title, body }, i) => (
                <Reveal key={title} delay={i * 0.08}>
                  <li className="relative flex gap-4 md:flex-col">
                    <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-accent-fg">
                      <Icon size={22} weight="fill" />
                    </span>
                    <div>
                      <h3 className="font-semibold">{title}</h3>
                      <p className="mt-1 max-w-[30ch] text-sm leading-relaxed text-muted">{body}</p>
                    </div>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-20 md:grid-cols-[1fr_auto] md:px-8">
          <div>
            <h2 className="max-w-[24ch] text-3xl font-semibold tracking-tight md:text-4xl">Works with typing too, when speaking is not an option.</h2>
            <p className="mt-3 max-w-[52ch] text-muted">Every answer is saved, so you can come back and play it again.</p>
          </div>
          <Link
            href="/talk"
            className="inline-flex items-center gap-2 justify-self-start rounded-ui bg-accent px-6 py-3 font-medium text-accent-fg transition active:scale-[0.98]"
          >
            <Microphone weight="fill" /> Start talking
          </Link>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted md:px-8">
          <Logo />
          <p>Speech and translation by Bhashini, Government of India.</p>
        </div>
      </footer>
    </div>
  );
}
