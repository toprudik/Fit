import Link from "next/link";
import { FadeIn } from "@/components/fade-in";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12">
      <FadeIn>
        <h1 className="text-4xl font-semibold tracking-tight">Fit</h1>
      </FadeIn>
      <FadeIn delay={0.1}>
        <p className="text-muted-foreground">Каркас приложения: веб и Telegram Mini App с входом через Telegram.</p>
      </FadeIn>
      <FadeIn delay={0.2} className="flex gap-3">
        <Button asChild>
          <Link href="/me">Мой профиль</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/login">Войти</Link>
        </Button>
      </FadeIn>
    </main>
  );
}
