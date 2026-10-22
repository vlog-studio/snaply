// There is no native splash on web to hand over from, so there is nothing to
// mirror or fade; the native variant's `ready` gate has nothing to hold.
export function AnimatedSplashOverlay(_props: { ready: boolean }) {
  return null;
}
