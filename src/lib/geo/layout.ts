/** Keep in sync with the `desk` / `short` / `tiny` screens in tailwind.config.ts. */
export const DESK_MIN_WIDTH = 1024;
export const DESK_MIN_HEIGHT = 540;
export const TINY_MAX_HEIGHT = 379;

/** True for the side-panel desktop layout (wide enough and tall enough). */
export function isDeskSize(width: number, height: number): boolean {
  return width >= DESK_MIN_WIDTH && height >= DESK_MIN_HEIGHT;
}

export function isDeskViewport(): boolean {
  return typeof window !== "undefined" && isDeskSize(window.innerWidth, window.innerHeight);
}
