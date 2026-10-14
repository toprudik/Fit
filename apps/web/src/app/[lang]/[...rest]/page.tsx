import { notFound } from "next/navigation";

/** Any unknown path under a locale renders [lang]/not-found.tsx inside the app's layout. */
export default function UnknownPage() {
  notFound();
}
