import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FadeIn } from "@/components/fade-in";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function Profile() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login?next=/me");

  // Read through RLS as the signed-in user.
  const { data: profile } = await supabase
    .from("profiles")
    .select("telegram_id, username, first_name, last_name, photo_url")
    .eq("id", data.claims.sub)
    .maybeSingle();

  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Без имени";

  return (
    <Card>
      <CardHeader className="flex items-center gap-4">
        {profile?.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.photo_url} alt="" className="size-12 rounded-full" />
        ) : null}
        <div>
          <CardTitle>{name}</CardTitle>
          {profile?.username ? <p className="text-muted-foreground text-sm">@{profile.username}</p> : null}
        </div>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">Telegram ID: {profile?.telegram_id ?? "—"}</CardContent>
      <CardFooter>
        <form action="/auth/sign-out" method="post">
          <Button variant="outline" type="submit">
            Выйти
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}

export default function MePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <FadeIn>
        <Suspense fallback={<Card className="h-40 animate-pulse" />}>
          <Profile />
        </Suspense>
      </FadeIn>
    </main>
  );
}
