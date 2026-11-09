import { btnSecondary, NavAuth, SignUpCta } from "@/components/auth-controls";
import { Logo } from "@/components/logo";
import { Wave } from "@/components/wave";

const steps = [
  ["01", "Share your lifestyle", "Sleep schedule, cleanliness, budget, city. Tell us how you actually live."],
  ["02", "Meet compatible people", "Swipe through flatmates who fit your habits, then chat once you both say yes."],
  ["03", "Find a place together", "Team up with your matches and look for a home as a group."],
];

const why = [
  "Compatibility first, listings second.",
  "Built for students and professionals across India.",
  "Know who you'll live with before you sign anything.",
];

export default function Landing() {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-3 focus:text-electric">
        Skip to content
      </a>

      <header className="grain sticky top-0 z-40">
        <div className="mx-auto flex h-20 max-w-[75rem] items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          <nav aria-label="Primary" className="flex items-center gap-6">
            <a href="#how-it-works" className="hidden text-sm text-white hover:underline md:inline">How it works</a>
            <a href="#why-flatter" className="hidden text-sm text-white hover:underline md:inline">Why Flatter</a>
            <NavAuth />
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        <section className="grain text-white">
          <div className="mx-auto max-w-[75rem] px-4 pb-24 pt-16 text-center sm:px-6 sm:pt-24">
            <h1 className="mx-auto max-w-4xl text-[2.5rem] font-black leading-none tracking-[-0.02em] sm:text-[4rem]">
              Find your people. Then your place.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-xl">
              Flatter matches students and working professionals in India with compatible flatmates, so the home you find together actually works.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <SignUpCta />
              <a href="#how-it-works" className={btnSecondary}>See how it works</a>
            </div>
          </div>
          <div className="text-electric"><Wave id="w-hero" /></div>
        </section>

        <section id="how-it-works" className="bg-cream px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-[75rem]">
            <p className="text-center font-mono text-xs font-bold uppercase tracking-wider text-muted">How it works</p>
            <ol className="mt-6 grid gap-12 md:grid-cols-3">
              {steps.map(([n, title, body]) => (
                <li key={n} className="text-center">
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-muted">{n}</span>
                  <h2 className="mt-3 text-[2rem] font-bold leading-[1.1] tracking-[-0.01em] text-electric sm:text-[2.5rem]">{title}</h2>
                  <p className="mt-6 text-muted">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="why-flatter" className="bg-cream px-4 pb-24 sm:px-6">
          <div className="mx-auto max-w-[75rem]">
            <p className="text-center font-mono text-xs font-bold uppercase tracking-wider text-muted">Why Flatter</p>
            <ul className="mt-6 grid gap-12 md:grid-cols-3">
              {why.map((line) => (
                <li key={line} className="text-center text-[2rem] font-bold leading-[1.1] tracking-[-0.01em] text-electric sm:text-[2.5rem]">
                  “{line}”
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="grain text-white">
          <div className="text-cream"><Wave id="w-cta-top" /></div>
          <div className="mx-auto max-w-[75rem] px-4 py-24 text-center sm:px-6">
            <h2 className="text-[2.5rem] font-black leading-none tracking-[-0.02em] sm:text-[4rem]">Ready to meet your flatmates?</h2>
            <div className="mt-10 flex justify-center"><SignUpCta /></div>
          </div>
        </section>
      </main>

      <footer className="grain text-white">
        <div className="mx-auto flex max-w-[75rem] flex-col gap-6 px-4 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <nav aria-label="Footer" className="flex gap-6 text-sm">
            <a href="#how-it-works" className="hover:underline">How it works</a>
            <a href="#why-flatter" className="hover:underline">Why Flatter</a>
          </nav>
          <div className="flex items-center gap-4">
            <Logo />
            <span className="font-mono text-xs uppercase tracking-wider">© 2026 Flatter</span>
          </div>
        </div>
      </footer>
    </>
  );
}
