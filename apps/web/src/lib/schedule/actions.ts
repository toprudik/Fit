"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DURATIONS, HORIZON_WEEKS, BUFFERS } from "./template";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const windowInput = z
  .object({
    isoWeekday: z.number().int().min(1).max(7),
    start: time,
    end: time,
    durationMin: z.number().int().refine((value) => (DURATIONS as readonly number[]).includes(value)),
    mode: z.enum(["offline", "online"]),
    locationId: z.uuid().nullable(),
    meetingUrl: z.string().trim().max(500).nullable(),
  })
  .refine((window) => window.mode === "online" || window.meetingUrl === null)
  .refine((window) => window.mode === "offline" || window.locationId === null);

const templateInput = z.object({
  windows: z.array(windowInput).max(100),
  horizonWeeks: z.number().int().refine((value) => (HORIZON_WEEKS as readonly number[]).includes(value)),
  bufferMin: z.number().int().refine((value) => (BUFFERS as readonly number[]).includes(value)),
});

export type TemplateWindowInput = z.input<typeof windowInput>;
export type SaveTemplateResult = { status: "done"; slots: number } | { status: "overlap" | "invalid" | "failed" };

/**
 * "Сохранить шаблон" (PRD 2.6.1, screens.md /trainer/schedule/template): the whole week at once.
 * save_week_template replaces the windows, drops future unbooked slots of the old week and generates the new ones.
 */
export async function saveWeekTemplate(raw: z.input<typeof templateInput>): Promise<SaveTemplateResult> {
  const parsed = templateInput.safeParse(raw);
  if (!parsed.success) return { status: "invalid" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_week_template", {
    p_items: parsed.data.windows.map((window) => ({
      iso_weekday: window.isoWeekday,
      start_time: window.start,
      end_time: window.end,
      duration_min: window.durationMin,
      mode: window.mode,
      location_id: window.locationId,
      meeting_url: window.meetingUrl || null,
    })),
    p_horizon_weeks: parsed.data.horizonWeeks,
    p_buffer_min: parsed.data.bufferMin,
  });
  if (!error) {
    refresh();
    return { status: "done", slots: data };
  }
  if (error.message === "items_overlap") return { status: "overlap" };
  // 23514: a window check of week_template_items (too short, a link without https).
  if (error.code === "23514" || error.code === "22023" || error.code === "22007") return { status: "invalid" };
  console.error("saving the week template failed", error.code);
  return { status: "failed" };
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export type CloseDaysResult =
  | { status: "done"; sessions: { id: string; startsAt: string; title: string | null }[] }
  | { status: "invalid" | "failed" };

/** "Закрыть дни" (PRD 2.6.1-5): the days lose their free slots; sessions left there come back for the warning. */
export async function closeDays(raw: { from: string; to: string }): Promise<CloseDaysResult> {
  const parsed = z.object({ from: day, to: day }).safeParse(raw);
  if (!parsed.success) return { status: "invalid" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("close_schedule_days", { p_from: parsed.data.from, p_to: parsed.data.to });
  if (!error) {
    refresh();
    return { status: "done", sessions: data.map((session) => ({ id: session.session_id, startsAt: session.starts_at, title: session.title })) };
  }
  if (error.message === "invalid_range") return { status: "invalid" };
  console.error("closing days failed", error.code);
  return { status: "failed" };
}

export type ScheduleResult = { status: "done" | "failed" };

/** "Открыть" on closed days: the template fills them back. */
export async function reopenDays(raw: { slotId: string }): Promise<ScheduleResult> {
  const parsed = z.object({ slotId: z.uuid() }).safeParse(raw);
  if (!parsed.success) return { status: "failed" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reopen_schedule", { p_slot_id: parsed.data.slotId });
  if (error && error.message !== "not_closed") {
    console.error("reopening days failed", error.code);
    return { status: "failed" };
  }
  refresh();
  return { status: "done" };
}

/**
 * Closes one free slot or opens it again (screens.md /trainer/schedule/slots). RLS lets the trainer change
 * only an unbooked slot of their own, between open and closed.
 */
export async function setSlotOpen(raw: { slotId: string; open: boolean }): Promise<ScheduleResult> {
  const parsed = z.object({ slotId: z.uuid(), open: z.boolean() }).safeParse(raw);
  if (!parsed.success) return { status: "failed" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("slots")
    .update({ status: parsed.data.open ? "open" : "closed" })
    .eq("id", parsed.data.slotId)
    .select("id");
  if (error || data.length === 0) {
    if (error) console.error("changing a slot failed", error.code);
    return { status: "failed" };
  }
  refresh();
  return { status: "done" };
}
