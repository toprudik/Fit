import { DaMark } from "@/components/brand/da-mark";

/**
 * The frame of an onboarding step (screens.md §3.1): the Da-mark, a large title and the step's content
 * in one narrow column, the way /login and /onboarding/trainer look. The title is passed as content so
 * a step can pick it once it knows who is signed in.
 */
export function OnboardingScreen({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 pt-[max(var(--safe-top),var(--space-6))] pb-[max(var(--safe-bottom),var(--space-6))]">
      <DaMark className="size-12" />
      {children}
    </main>
  );
}
