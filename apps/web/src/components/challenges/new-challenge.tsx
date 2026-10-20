"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ChipRadio } from "@/components/ui/chip";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { plural } from "@/i18n/format";
import { createChallenge } from "@/lib/challenges/actions";
import { trainerChallengePath } from "@/lib/challenges/present";
import { CHALLENGE_METRICS, CHALLENGE_TITLE_MAX, CHALLENGE_WEEK_OPTIONS, parseGoal, type ChallengeMetric } from "@/lib/challenges/challenges";

/**
 * "Новый челлендж" in a group (wave-3 §2.3-9), or for all clients with groupId null: a name, one metric, 1 to 12
 * weeks from today or next Monday, an optional goal and the leaderboard. The bot invites the clients.
 */
export function NewChallengeButton({ groupId, today, monday }: { groupId: string | null; today: string; monday: string }) {
  const { t, locale } = useI18n();
  const copy = t.challenges;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [metric, setMetric] = useState<ChallengeMetric>("workouts");
  const [weeks, setWeeks] = useState(4);
  const [start, setStart] = useState<"today" | "monday">("monday");
  const [goal, setGoal] = useState("");
  const [leaderboard, setLeaderboard] = useState(true);
  const [errors, setErrors] = useState<{ title?: boolean; goal?: boolean }>({});
  const [pending, startTransition] = useTransition();

  function reset() {
    setTitle("");
    setMetric("workouts");
    setWeeks(4);
    setStart("monday");
    setGoal("");
    setLeaderboard(true);
    setErrors({});
  }

  function save() {
    const name = title.trim();
    const parsedGoal = parseGoal(goal);
    const next = { title: !name || name.length > CHALLENGE_TITLE_MAX, goal: !parsedGoal.ok };
    setErrors(next);
    if (next.title || !parsedGoal.ok) return;
    startTransition(async () => {
      const result = await createChallenge({
        groupId,
        title: name,
        metric,
        weeks,
        startsOn: start === "today" ? today : monday,
        goal: parsedGoal.value,
        leaderboard,
      });
      if (!result.ok) {
        toast.error(result.reason === "plan" ? copy.form.plan : copy.form.failed);
        return;
      }
      toast.success(groupId ? copy.form.created : copy.form.createdAll);
      setOpen(false);
      router.push(trainerChallengePath(groupId, result.value));
    });
  }

  return (
    <>
      <Button
        icon={Plus}
        variant="secondary"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        {copy.group.create}
      </Button>
      <Sheet open={open} onOpenChange={(next) => !pending && setOpen(next)} title={copy.form.title} description={copy.form.description}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <TextField
            label={copy.form.name}
            value={title}
            maxLength={CHALLENGE_TITLE_MAX}
            onChange={(event) => setTitle(event.target.value)}
            error={errors.title ? copy.form.nameError : undefined}
            autoComplete="off"
          />
          <fieldset className="flex flex-col gap-1.5">
            <legend className="px-1 pb-1.5 text-footnote text-ink-2">{copy.form.metric}</legend>
            <div className="flex flex-wrap gap-2">
              {CHALLENGE_METRICS.map((option) => (
                <ChipRadio key={option} name="metric" value={option} checked={metric === option} onChange={() => setMetric(option)}>
                  {copy.metrics[option]}
                </ChipRadio>
              ))}
            </div>
            <p className="px-1 text-footnote text-ink-2">{copy.metricHints[metric]}</p>
          </fieldset>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="px-1 pb-1.5 text-footnote text-ink-2">{copy.form.weeks}</legend>
            <div className="flex flex-wrap gap-2">
              {CHALLENGE_WEEK_OPTIONS.map((option) => (
                <ChipRadio key={option} name="weeks" value={option} checked={weeks === option} onChange={() => setWeeks(option)}>
                  {plural(locale, option, copy.form.weeksOption)}
                </ChipRadio>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="px-1 pb-1.5 text-footnote text-ink-2">{copy.form.start}</legend>
            <div className="flex flex-wrap gap-2">
              <ChipRadio name="start" value="today" checked={start === "today"} onChange={() => setStart("today")}>
                {copy.form.today}
              </ChipRadio>
              <ChipRadio name="start" value="monday" checked={start === "monday"} onChange={() => setStart("monday")}>
                {copy.form.nextMonday}
              </ChipRadio>
            </div>
          </fieldset>
          <TextField
            label={copy.form.goal}
            hint={copy.form.goalHint}
            value={goal}
            inputMode="numeric"
            onChange={(event) => setGoal(event.target.value)}
            error={errors.goal ? copy.form.goalError : undefined}
            autoComplete="off"
          />
          <Switch checked={leaderboard} onCheckedChange={setLeaderboard} label={copy.form.leaderboard} hint={copy.form.leaderboardHint} showLabel />
          <Button type="submit" size="lg" block loading={pending}>
            {copy.form.create}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
