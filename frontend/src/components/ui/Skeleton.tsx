import type { CSSProperties, ReactNode } from "react";

interface SkeletonProps {
  /** While true, the real children are rendered invisibly (for sizing) and a
   * shimmer overlay covers them at the exact same size. While false, this is
   * a transparent passthrough — `children` render normally. */
  loading: boolean;
  children: ReactNode;
  /** Matches the wrapped content's own corner radius so the shimmer doesn't
   * look squared-off against a rounded card/button underneath. */
  rounded?: "sm" | "md" | "lg" | "xl" | "full";
  className?: string;
}

const ROUNDED_CLASSES: Record<NonNullable<SkeletonProps["rounded"]>, string> = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  full: "rounded-full",
};

/**
 * Auto-sizing skeleton — wraps real content and, while loading, overlays a
 * shimmer block sized to match it exactly. Because it measures the actual
 * children rather than a hand-built stand-in shape, it never drifts out of
 * sync with what it's covering: change the wrapped component's layout and
 * the skeleton follows automatically, on every screen size, with no second
 * shape to maintain.
 *
 * For places nothing is mounted yet (a table before row count is known, a
 * page's very first paint), build a bespoke loading shape from SkeletonLine /
 * SkeletonCircle / SkeletonBlock / SkeletonRow instead — this wrapper needs
 * real children to size against.
 *
 * @example
 * <Skeleton loading={isLoading}>
 *   <StatCard label="Active students" value={data?.count ?? 0} />
 * </Skeleton>
 */
export function Skeleton({ loading, children, rounded = "lg", className = "" }: SkeletonProps) {
  if (!loading) return <>{children}</>;

  return (
    <div className={`relative block ${className}`} aria-busy="true">
      <div aria-hidden="true" className="invisible">
        {children}
      </div>
      <div aria-hidden="true" className={`tg-skeleton absolute inset-0 ${ROUNDED_CLASSES[rounded]}`} />
    </div>
  );
}

interface ShapeProps {
  className?: string;
  style?: CSSProperties;
}

/** A single line of placeholder text — defaults to a natural reading-line
 * height and a slightly-less-than-full width so a block of these doesn't
 * look like a perfect gray rectangle. */
export function SkeletonLine({ className = "", style }: ShapeProps) {
  return <span className={`tg-skeleton block h-3.5 w-[85%] rounded-md ${className}`} style={style} />;
}

/** An avatar/icon placeholder — square by default via the caller's h-/w-. */
export function SkeletonCircle({ className = "h-9 w-9", style }: ShapeProps) {
  return <span className={`tg-skeleton block rounded-full ${className}`} style={style} />;
}

/** A generic rectangular placeholder — a chart, an image, a stat card body.
 * Caller sets size via className (h-/w-) or style. */
export function SkeletonBlock({ className = "h-24 w-full", style }: ShapeProps) {
  return <span className={`tg-skeleton block rounded-xl ${className}`} style={style} />;
}

/** One table/list row: an optional leading circle (avatar/icon) plus 2–4
 * text lines of decreasing width, spaced like a real data row. When looping
 * this for a table skeleton, render a small fixed count (5–8) rather than
 * the eventual real row count — each row is its own animation instance, and
 * nothing past the fold is visible anyway. */
export function SkeletonRow({ avatar = false, lines = 2 }: { avatar?: boolean; lines?: number }) {
  const widths = ["w-1/3", "w-1/2", "w-1/4", "w-2/5"];
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {avatar && <SkeletonCircle />}
      <div className="flex-1 space-y-2">
        {Array.from({ length: lines }, (_, i) => (
          <span key={i} className={`tg-skeleton block h-3 rounded-md ${widths[i % widths.length]}`} />
        ))}
      </div>
    </div>
  );
}
