"use client";

import { useLinkStatus } from "next/link";
import { Spinner } from "./spinner";

/**
 * A Link's label that turns into a spinner while the link's page loads, for a Button or IconButton
 * rendered as a Link: a dynamic page can take a second, and a press with no answer reads as a miss.
 * Must sit inside the Link. Without children it sits over an IconButton's glyph; hide the glyph with
 * `has-data-pending:[&>svg]:opacity-0` on the IconButton.
 */
export function LinkPending({ children }: { children?: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <>
      {children === undefined ? null : <span className={pending ? "opacity-0" : undefined}>{children}</span>}
      {pending ? (
        <span data-pending className="absolute inset-0 grid place-items-center">
          <Spinner />
        </span>
      ) : null}
    </>
  );
}
