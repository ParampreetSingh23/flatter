import { btnSecondary, NavAuth, SignUpCta } from "@/components/auth-controls";
import { Icon, type IconName } from "@/components/icons";
import { Logo } from "@/components/logo";
import { Wave } from "@/components/wave";

const steps: [string, IconName, string, string][] = [
  ["01", "moon", "Share your lifestyle", "Sleep schedule, cleanliness, budget, city. Tell us how you actually live."],
  ["02", "heart", "Meet compatible people", "Swipe through flatmates who fit your habits, then chat once you both say yes."],
  ["03", "home", "Find a place together", "Team up with your matches and look for a home as a group."],
];

const why: [IconName, string][] = [
  ["heart", "Compatibility first, listings second."],
  ["users", "Built for students and professionals across India."],
  ["shield", "Know who you'll live with before you sign anything."],
];

const matchOn: [IconName, string, string][] = [
  ["moon", "Sleep schedule", "Early bird or night owl."],
  ["sparkle", "Cleanliness", "From spotless to relaxed."],
  ["utensils", "Food habits", "Veg, non-veg, or either."],
  ["smoke", "Smoking", "Your comfort with smoke."],
  ["door", "Guests", "How often friends drop by."],
  ["paw", "Pets", "Pet-friendly or pet-free."],
  ["rupee", "Budget", "Rent you can both afford."],
  ["pin", "Area", "Localities across Delhi NCR."],
];

const chips: [IconName, string][] = [["moon", "Night owl"], ["sparkle", "Very tidy"], ["utensils", "Vegetarian"], ["smoke", "Non-smoker"], ["rupee", "₹15k–20k"]];

// Decorative product preview. Hidden from assistive tech; labelled as an example.
function ProfilePreview() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-md">
      <div className="absolute inset-0 translate-x-4 translate-y-4 rotate-3 rounded-3xl bg-indigo" />
      <div className="relative rounded-3xl bg-white p-6 text-left text-ink shadow-xl">
        <div className="flex items-center gap-4">
          <span className="flex size-16 items-center justify-center rounded-full bg-electric text-2xl font-black text-white">A</span>
          <div>
            <p className="text-xl font-black tracking-[-0.01em] text-electric">Aarav, 26</p>
            <p className="flex items-center gap-1 text-sm text-muted"><Icon name="pin" className="size-4" />Gurugram · Working professional</p>
          </div>
        </div>
        <ul className="mt-6 flex flex-wrap gap-2">
          {chips.map(([icon, label]) => (
            <li key={label} className="flex items-center gap-2 rounded-full bg-electric/10 px-3 py-1.5 text-sm font-bold text-electric"><Icon name={icon} className="size-4" />{label}</li>
          ))}
        </ul>
        <div className="mt-6 flex items-center justify-between border-t border-indigo/10 pt-4">
          <span className="flex items-center gap-2 text-sm text-muted"><Icon name="calendar" className="size-4" />Moving in next month</span>
          <span className="flex size-11 items-center justify-center rounded-xl bg-electric text-white"><Icon name="heart" /></span>
        </div>
        <span className="absolute -top-3 right-6 rounded-full bg-indigo px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider text-white">Example profile</span>
      </div>
      <svg viewBox="0 0 120 120" className="absolute -bottom-12 right-6 size-28 rotate-12 rounded-full bg-cream text-electric shadow-lg sm:size-32">
        <defs><path id="ring" d="M60 60m-42 0a42 42 0 1 1 84 0a42 42 0 1 1-84 0" /></defs>
        <text className="fill-current font-mono text-[11px] font-bold uppercase" letterSpacing="2.2"><textPath href="#ring">Now in Delhi NCR · Now in Delhi NCR ·</textPath></text>
        <g transform="translate(46 46)" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 14l12-10 12 10" /><path d="M5 13v13h6v-8h6v8h6V13" /></g>
      </svg>
    </div>
  );
}

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
          <div className="mx-auto grid max-w-[75rem] items-center gap-16 px-4 pb-24 pt-16 sm:px-6 sm:pt-20 lg:grid-cols-[1.1fr_1fr] lg:gap-12 lg:pb-32 lg:pt-28">
            <div className="text-center lg:text-left">
              <h1 className="text-[2.5rem] font-black leading-none tracking-[-0.02em] sm:text-[4rem] lg:text-[4.5rem]">
                Find your people. Then your place.
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-xl lg:mx-0">
                Flatter matches students and working professionals in India with compatible flatmates, so the home you find together actually works.
              </p>
              <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center lg:justify-start">
                <SignUpCta />
                <a href="#how-it-works" className={btnSecondary}>See how it works</a>
              </div>
            </div>
            <ProfilePreview />
          </div>
          <div className="text-electric"><Wave id="w-hero" /></div>
        </section>

        <section id="match-on" className="bg-cream px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-[75rem]">
            <h2 className="mx-auto max-w-3xl text-center text-[2rem] font-bold leading-[1.1] tracking-[-0.01em] text-electric sm:text-[2.5rem]">
              Match on the things that decide whether flatmates get along.
            </h2>
            <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {matchOn.map(([icon, title, body]) => (
                <li key={title} className="rounded-2xl bg-white p-6 ring-1 ring-indigo/10">
                  <span className="flex size-12 items-center justify-center rounded-xl bg-electric text-white"><Icon name={icon} className="size-6" /></span>
                  <h3 className="mt-5 text-lg font-bold text-indigo">{title}</h3>
                  <p className="mt-1 text-sm text-muted">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="how-it-works" className="bg-white px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-[75rem]">
            <h2 className="text-center text-[2rem] font-bold leading-[1.1] tracking-[-0.01em] text-electric sm:text-[2.5rem]">How it works</h2>
            <ol className="relative mt-16 grid gap-12 md:grid-cols-3">
              <div aria-hidden="true" className="absolute left-[16%] right-[16%] top-8 hidden border-t-2 border-dashed border-electric/30 md:block" />
              {steps.map(([n, icon, title, body]) => (
                <li key={n} className="relative text-center">
                  <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-electric text-white ring-8 ring-white"><Icon name={icon} className="size-7" /></span>
                  <span className="mt-5 block font-mono text-xs font-bold uppercase tracking-wider text-muted">Step {n}</span>
                  <h3 className="mt-2 text-2xl font-bold leading-[1.15] tracking-[-0.01em] text-indigo">{title}</h3>
                  <p className="mx-auto mt-3 max-w-xs text-muted">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="why-flatter" className="bg-cream px-4 py-24 sm:px-6">
          <ul className="mx-auto grid max-w-[75rem] gap-12 md:grid-cols-3">
            {why.map(([icon, line]) => (
              <li key={line} className="text-center md:text-left">
                <Icon name={icon} className="mx-auto size-10 text-electric md:mx-0" />
                <p className="mt-5 text-[2rem] font-bold leading-[1.1] tracking-[-0.01em] text-electric sm:text-[2.25rem]">{line}</p>
              </li>
            ))}
          </ul>
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
