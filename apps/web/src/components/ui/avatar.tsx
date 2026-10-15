import type { LucideIcon } from "lucide-react";
import { Avatar as AvatarPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

/*
 * No "use client" here: the Radix parts are client components already, and this module also
 * exports `initials()` and `PersonAvatar`, which Server Components use (a Lucide icon prop can't
 * cross into a Client Component).
 */

function Avatar({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn("relative inline-flex size-10 shrink-0 overflow-hidden rounded-full bg-surface-3 select-none", className)}
      {...props}
    />
  );
}

function AvatarImage({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return <AvatarPrimitive.Image data-slot="avatar-image" className={cn("size-full object-cover", className)} {...props} />;
}

function AvatarFallback({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn("flex size-full items-center justify-center rounded-full bg-surface-3 leading-none font-semibold text-ink", className)}
      {...props}
    />
  );
}

/** First letter (or digit) of the first two words, uppercased: "Анна Смирнова" → "АС". Words without letters are skipped. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word.match(/[\p{L}\p{N}]/u)?.[0] ?? "")
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// Font size is round(size × 0.38), as in the reference Avatar.
const SIZE_CLASSES = {
  28: "size-7 text-[11px]",
  32: "size-8 text-[12px]",
  36: "size-9 text-[14px]",
  40: "size-10 text-[15px]",
  64: "size-16 text-[24px]",
  96: "size-24 text-[36px]",
} as const;

type PersonAvatarProps = {
  /** Full name: gives the initials and the screen reader label. */
  name: string;
  /** Telegram photo. Until it loads, or if it fails, the initials show. */
  src?: string | null;
  size?: keyof typeof SIZE_CLASSES;
  /** Hide from screen readers when the name is already said next to it (a list row, a labelled button). */
  decorative?: boolean;
  /** Shown instead of initials when there is no name, e.g. a signed-out person. */
  fallbackIcon?: LucideIcon;
  className?: string;
};

/**
 * A person's avatar: Telegram photo or two initials on `surface-3` (docs/design/components/Avatar).
 * No colored backgrounds by name: data colors aren't spent on people.
 */
function PersonAvatar({ name, src, size = 40, decorative = false, fallbackIcon: FallbackIcon, className }: PersonAvatarProps) {
  const letters = initials(name);
  // An image with an empty name would be an unlabelled image; without a name the avatar is decoration.
  const labelled = !decorative && name.trim() !== "";
  return (
    <Avatar
      className={cn(SIZE_CLASSES[size], className)}
      role={labelled ? "img" : undefined}
      aria-label={labelled ? name : undefined}
      aria-hidden={labelled ? undefined : true}
    >
      {src ? <AvatarImage src={src} alt="" /> : null}
      <AvatarFallback>
        {letters || (FallbackIcon ? <FallbackIcon aria-hidden className="size-1/2 text-ink-2" strokeWidth={1.75} /> : null)}
      </AvatarFallback>
    </Avatar>
  );
}

export { Avatar, AvatarImage, AvatarFallback, PersonAvatar, initials };
