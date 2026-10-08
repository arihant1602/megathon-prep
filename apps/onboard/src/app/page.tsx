import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Cpu, CloudSlash, Lightning, WifiSlash } from "@phosphor-icons/react/ssr";
import { Reveal } from "@mega/platform/ui/reveal";
import { Logo } from "@/components/logo";
import { ScanOverlay } from "@/components/scan-overlay";

// The real inference call from src/lib/vision.worker.ts, trimmed.
const CODE = `const device = "gpu" in navigator ? "webgpu" : "wasm";

const detect = await pipeline("object-detection", "Xenova/yolos-tiny", {
  device,
  dtype: device === "webgpu" ? "fp32" : "q8",
});

const boxes = await detect(frame, { threshold: 0.6 });
// boxes stay on this device. Only labels and latency are saved.`;

export default function Landing() {
  return (
    <div className="min-h-[100dvh]">
      <header className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-8">
        <Logo />
        <nav className="flex items-center gap-6 text-sm">
          <a href="#runtime" className="hidden text-muted transition hover:text-fg sm:inline">
            Runtime
          </a>
          <Link href="/lab" className="rounded-ui bg-accent px-4 py-2 font-medium text-accent-fg transition active:scale-[0.98]">
            Launch camera
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl gap-10 px-4 pt-10 pb-20 md:px-8 md:pt-16 lg:grid-cols-[1fr_1.15fr] lg:items-center">
          <div className="rise">
            <h1 className="max-w-[15ch] text-4xl leading-[1.05] font-semibold tracking-tighter md:text-6xl">
              Vision models that run on the device.
            </h1>
            <p className="mt-6 max-w-[44ch] text-lg leading-relaxed text-muted">
              Onboard runs detection and classification inside the browser with WebGPU. Camera frames never leave the
              phone.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/lab"
                className="inline-flex items-center gap-2 rounded-ui bg-accent px-5 py-3 font-medium text-accent-fg transition active:scale-[0.98]"
              >
                Launch camera <ArrowRight weight="bold" />
              </Link>
              <a href="#runtime" className="rounded-ui border border-line px-5 py-3 font-medium transition hover:bg-surface">
                Runtime
              </a>
            </div>
          </div>
          <div className="rise rise-late relative aspect-[16/11] overflow-hidden rounded-ui border border-line">
            <Image
              src="https://picsum.photos/seed/onboard-street-crossing/1400/960"
              alt="A street scene seen through a camera"
              fill
              priority
              unoptimized
              className="object-cover"
            />
            <ScanOverlay />
          </div>
        </section>

        <section id="runtime" className="border-y border-line bg-surface">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 md:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:py-28">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">A few lines between a camera and a result.</h2>
              <p className="mt-4 max-w-[48ch] leading-relaxed text-muted">
                Transformers.js loads quantized ONNX weights once, caches them, then runs every frame locally. With no
                WebGPU, it falls back to WebAssembly on the CPU.
              </p>
            </div>
            <Reveal>
              <pre className="overflow-x-auto rounded-ui border border-line bg-bg p-5 font-mono text-[13px] leading-relaxed">
                <code>{CODE}</code>
              </pre>
            </Reveal>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 md:px-8 lg:py-28">
          <h2 className="max-w-[22ch] text-3xl font-semibold tracking-tight md:text-4xl">Private by construction, not by policy.</h2>
          <div className="mt-12 grid gap-4 md:grid-cols-4 md:grid-rows-[auto_auto]">
            <Reveal className="relative min-h-80 overflow-hidden rounded-ui md:col-span-2 md:row-span-2">
              <Image src="https://picsum.photos/seed/onboard-phone-hand/1000/1000" alt="A phone held in one hand" fill unoptimized className="object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#09090b]/90 via-[#09090b]/20 to-transparent" />
              <div className="absolute bottom-0 p-6 text-[#ececee]">
                <CloudSlash size={28} weight="duotone" />
                <h3 className="mt-3 text-xl font-semibold">No cloud inference</h3>
                <p className="mt-1 max-w-[40ch] text-sm leading-relaxed text-[#c9c9d1]">
                  There is no inference endpoint to call. The server only ever receives labels and timings you choose to save.
                </p>
              </div>
            </Reveal>
            <Reveal delay={0.05} className="rounded-ui bg-accent p-6 text-accent-fg md:col-span-2">
              <Lightning size={28} weight="duotone" />
              <h3 className="mt-3 text-xl font-semibold">WebGPU first</h3>
              <p className="mt-1 text-sm leading-relaxed opacity-85">Runs on the GPU when the browser exposes one, with measured latency on every frame.</p>
            </Reveal>
            <Reveal delay={0.1} className="rounded-ui border border-line bg-surface p-6">
              <WifiSlash size={28} weight="duotone" className="text-accent" />
              <h3 className="mt-3 text-lg font-semibold">Offline after first load</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">Weights are cached by the browser.</p>
            </Reveal>
            <Reveal delay={0.15} className="rounded-ui border border-line bg-accent-soft p-6">
              <Cpu size={28} weight="duotone" className="text-accent" />
              <h3 className="mt-3 text-lg font-semibold">Path to the NPU</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">Same ONNX models export to Qualcomm AI Hub for Snapdragon.</p>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted md:px-8">
          <Logo />
          <p>Models: Xenova/yolos-tiny and Xenova/mobilevit-small via Transformers.js.</p>
        </div>
      </footer>
    </div>
  );
}
