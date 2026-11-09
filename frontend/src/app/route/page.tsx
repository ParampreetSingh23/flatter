import { NavAuth, SignUpCta } from "@/components/auth-controls";
import { Icon, type IconName } from "@/components/icons";
import { Logo } from "@/components/logo";

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
      <div className="relative rounded-[32px] bg-white p-8 text-left text-ink">
        <div className="flex items-center gap-4">
          <span className="flex size-16 items-center justify-center rounded-full bg-secondary text-2xl font-semibold text-ink">A</span>
          <div>
            <p className="text-xl font-bold tracking-[-0.01em] text-ink">Aarav, 26</p>
            <p className="flex items-center gap-1 text-sm text-muted"><Icon name="pin" className="size-4" />Gurugram · Working professional</p>
          </div>
        </div>
        <ul className="mt-6 flex flex-wrap gap-2">
          {chips.map(([icon, label]) => (
            <li key={label} className="flex items-center gap-2 text-sm text-ink"><Icon name={icon} className="size-4" />{label}</li>
          ))}
        </ul>
        <div className="mt-6 flex items-center justify-between border-t border-hairline pt-4">
          <span className="flex items-center gap-2 text-sm text-muted"><Icon name="calendar" className="size-4" />Moving in next month</span>
          <span className="flex size-11 items-center justify-center rounded-full bg-surface-card text-ink"><Icon name="heart" /></span>
        </div>
        <span className="mt-6 block text-xs text-muted">Example profile · Delhi NCR</span>
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-3 focus:text-ink">
        Skip to content
      </a>

      <header className="sticky top-0 z-40 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          <nav aria-label="Primary" className="flex items-center gap-6">
            <a href="#how-it-works" className="hidden text-sm font-semibold text-ink hover:underline md:inline">How it works</a>
            <a href="#why-flatter" className="hidden text-sm font-semibold text-ink hover:underline md:inline">Why Flatter</a>
            <NavAuth />
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        <section className="bg-surface-soft text-ink">
          <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[1.1fr_1fr] lg:gap-12 lg:py-16">
            <div className="text-center lg:text-left">
              <h1 className="text-4xl font-semibold leading-[1.1] tracking-[-1.2px] min-[480px]:text-[44px] sm:text-[56px] lg:text-[70px]">
                Find your people. Then your place.
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-base leading-[1.4] text-body lg:mx-0">
                Flatter matches students and working professionals in India with compatible flatmates, so the home you find together actually works.
              </p>
              <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center lg:justify-start">
                <SignUpCta />
                <a href="#how-it-works" className="inline-flex min-h-11 items-center rounded-2xl px-3.5 text-sm font-bold text-ink hover:bg-surface-card">See how it works</a>
              </div>
            </div>
            <ProfilePreview />
          </div>
        </section>

        <section id="match-on" className="bg-white px-4 py-8 sm:px-6 sm:py-12 lg:py-16">
          <div className="mx-auto max-w-7xl">
            <h2 className="mx-auto max-w-3xl text-center text-[28px] font-bold leading-[1.2] tracking-[-1.2px] text-ink">
              Match on the things that decide whether flatmates get along.
            </h2>
            <ul className="mt-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {matchOn.map(([icon, title, body]) => (
                <li key={title} className="rounded-2xl bg-surface-card p-4">
                  <span className="flex size-10 items-center justify-center rounded-full bg-white text-ink"><Icon name={icon} /></span>
                  <h3 className="mt-4 text-lg font-semibold text-ink">{title}</h3>
                  <p className="mt-1 text-sm text-muted">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="how-it-works" className="bg-surface-soft px-4 py-8 sm:px-6 sm:py-12 lg:py-16">
          <div className="mx-auto max-w-7xl">
            <h2 className="text-center text-[28px] font-bold leading-[1.2] tracking-[-1.2px] text-ink">How it works</h2>
            <ol className="relative mt-16 grid gap-12 md:grid-cols-3">
              <div aria-hidden="true" className="absolute left-[16%] right-[16%] top-8 hidden border-t-2 border-dashed border-hairline md:block" />
              {steps.map(([n, icon, title, body]) => (
                <li key={n} className="relative text-center">
                  <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-secondary text-ink"><Icon name={icon} className="size-7" /></span>
                  <span className="mt-5 block text-sm font-bold text-muted">Step {n}</span>
                  <h3 className="mt-2 text-[22px] font-semibold leading-[1.25] text-ink">{title}</h3>
                  <p className="mx-auto mt-3 max-w-xs text-muted">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="why-flatter" className="bg-white px-4 py-8 sm:px-6 sm:py-12 lg:py-16">
          <ul className="mx-auto grid max-w-7xl gap-12 md:grid-cols-3">
            {why.map(([icon, line]) => (
              <li key={line} className="text-center md:text-left">
                <Icon name={icon} className="mx-auto size-10 text-ink md:mx-0" />
                <p className="mt-5 text-[28px] font-bold leading-[1.2] tracking-[-1.2px] text-ink">{line}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-surface-dark text-white">
          <div className="mx-auto max-w-7xl px-8 py-12 text-center">
            <h2 className="text-[28px] font-bold leading-[1.2] tracking-[-1.2px]">Ready to meet your flatmates?</h2>
            <div className="mt-10 flex justify-center"><SignUpCta /></div>
          </div>
        </section>
      </main>

      <footer className="border-t border-hairline bg-white text-muted">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
          <nav aria-label="Footer" className="flex gap-6 text-sm">
            <a href="#how-it-works" className="hover:underline">How it works</a>
            <a href="#why-flatter" className="hover:underline">Why Flatter</a>
          </nav>
          <div className="flex items-center gap-4">
            <Logo />
            <span className="text-xs">© 2026 Flatter</span>
          </div>
        </div>
      </footer>
    </>
  );
}
