"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Page transition for the student portal — the subtle fade-and-rise from the
 * reference design, done with the app's existing `tg-page-enter` keyframe.
 *
 * The `key` is what makes it work: changing it on navigation remounts the
 * wrapper, which restarts the CSS animation. Without it the animation would
 * only ever play once, on first load, because the layout itself never
 * remounts between sibling routes.
 *
 * No exit animation on purpose — Next's app router swaps the tree on
 * navigation, and holding the outgoing page mounted to animate it out means
 * two screens' worth of data on a phone at once. Fast in, nothing out, reads
 * quicker.
 */
export function PortalTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="tg-page-enter">
      {children}
    </div>
  );
}
