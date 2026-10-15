/** Is the hold timer (a timed set) open? A leaf module: the sheet sets it, the idle check reads it. */
let open = false;

export function noteHoldTimer(isOpen: boolean): void {
  open = isOpen;
}

export function holdTimerOpen(): boolean {
  return open;
}
