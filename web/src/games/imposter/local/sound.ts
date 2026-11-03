// The one sound in one-phone mode: a short beep when the clock ends a turn, because
// in auto mode the phone is on the table and nobody is watching it.
//
// It is generated rather than played from a file, so there is nothing extra to
// download, or to go missing when the phone has no signal. Sound is never worth
// breaking the game over, so everything here fails silently.

const BEEP_HZ = 880;
const BEEP_SECONDS = 0.18;
const VOLUME = 0.25;

let context: AudioContext | null = null;

/** Gets sound ready. Browsers keep an audio context silent until the page has been
 * tapped, so this has to run from a tap for playTurnEnd to be heard later. */
export function unlockSound(): void {
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
  } catch {
    context = null;
  }
}

/** One beep, plus a short buzz where the phone supports that. */
export function playTurnEnd(): void {
  try {
    navigator.vibrate?.(80);
    if (!context) return;

    const osc = context.createOscillator();
    const gain = context.createGain();
    const end = context.currentTime + BEEP_SECONDS;
    osc.frequency.value = BEEP_HZ;
    // Fades out rather than stopping dead, which would make an audible click.
    gain.gain.setValueAtTime(VOLUME, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, end);
    osc.connect(gain).connect(context.destination);
    osc.start();
    osc.stop(end);
  } catch {
    // No sound, then. The screen has already moved on to the next player.
  }
}
