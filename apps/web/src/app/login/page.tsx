import { Suspense } from "react";
import { FadeIn } from "@/components/fade-in";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ERRORS: Record<string, string> = {
  expired: "Время входа истекло, попробуй ещё раз.",
  denied: "Вход отменён в Telegram.",
  state: "Не удалось проверить запрос входа, попробуй ещё раз.",
  failed: "Не удалось войти через Telegram.",
};

async function LoginForm({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const { error, next } = await searchParams;
  const href = `/auth/telegram/login${typeof next === "string" ? `?next=${encodeURIComponent(next)}` : ""}`;
  const message = typeof error === "string" ? ERRORS[error] : undefined;

  return (
    <CardContent className="flex flex-col gap-3">
      {message ? <p className="text-destructive text-sm">{message}</p> : null}
      {/* Plain link: the route handler redirects to Telegram's OIDC authorization page. */}
      <Button asChild size="lg">
        <a href={href}>Войти через Telegram</a>
      </Button>
    </CardContent>
  );
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <FadeIn>
        <Card>
          <CardHeader>
            <CardTitle>Вход</CardTitle>
            <CardDescription>Используем твой аккаунт Telegram — без паролей и почты.</CardDescription>
          </CardHeader>
          <Suspense fallback={<CardContent className="h-10" />}>
            <LoginForm searchParams={props.searchParams} />
          </Suspense>
        </Card>
      </FadeIn>
    </main>
  );
}
