// Turns a simulation run into one self-contained page for stepping through it
// afterwards. Everything is inlined, screenshots included, so the file can be opened
// or sent anywhere. It uses the game's own look: true black, one yellow, flat.

export interface Shot {
  name: string;
  /** "imposter" or "crew", when the run knows. Shown on the phone's frame. */
  tag?: string;
  image: string;
  /** A main screen rather than a phone: it gets a row of its own. */
  wide?: boolean;
}

export interface Beat {
  act: string;
  title: string;
  caption: string;
  shots: Shot[];
}

const STYLE = `
/* A control room: the current step's caption above a row of phones, with every step
   of the run laid out below as a clickable list. One dark look, like the game. */
:root {
  color-scheme: dark;
  --ground: #000000;
  --surface: #161616;
  --raised: #262626;
  --text: #f5f5f5;
  --muted: #a3a3a3;
  --accent: #ffd60a;
  --negative: #e5484d;
  --on-colour: #000000;
  --display: "Bricolage Grotesque", system-ui, sans-serif;
  --body: Inter, system-ui, sans-serif;
}
body {
  background: var(--ground);
  color: var(--text);
  font: 400 1rem/1.45 var(--body);
  padding-left: max(16px, env(safe-area-inset-left, 0px));
  padding-right: max(16px, env(safe-area-inset-right, 0px));
  padding-block: 20px 48px;
}
.page { display: flex; flex-direction: column; gap: 20px; max-width: 94rem; margin: 0 auto; }
.top { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 16px; }
h1 { margin: 0; font: 800 1.75rem/1.1 var(--display); letter-spacing: -0.02em; }
.run { margin: 0; color: var(--muted); font-size: 0.875rem; font-variant-numeric: tabular-nums; }

.now { display: flex; flex-direction: column; gap: 6px; min-height: 8.5rem; }
.act { margin: 0; color: var(--accent); font-size: 0.8125rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
h2 { margin: 0; font: 800 clamp(1.5rem, 4vw, 2.25rem)/1.1 var(--display); letter-spacing: -0.02em; text-wrap: balance; }
.caption { margin: 0; max-width: 46rem; color: var(--muted); }

.controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
button {
  min-height: 44px; padding: 0 18px; border: 0; border-radius: 12px;
  background: var(--raised); color: var(--text);
  font: 600 1rem var(--body); cursor: pointer;
}
button:hover { background: var(--muted); color: var(--on-colour); }
button:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
button.play { background: var(--accent); color: var(--on-colour); }
.count { margin-left: 4px; color: var(--muted); font-variant-numeric: tabular-nums; }

.phones { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 11.5rem), 1fr)); gap: 12px; align-items: start; }
.phone { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.label { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-weight: 600; font-size: 0.9375rem; }
.pill { padding: 1px 8px; border-radius: 999px; font-size: 0.75rem; font-weight: 600; }
.pill[data-tag="imposter"] { background: var(--negative); color: var(--on-colour); }
.pill[data-tag="crew"] { background: var(--raised); color: var(--muted); }
/* Any other tag, e.g. a phone's role in another game. */
.pill { background: var(--raised); color: var(--muted); }
.frame { max-height: 72vh; overflow-y: auto; border-radius: 14px; background: var(--surface); box-shadow: inset 0 0 0 1px var(--raised); }
.frame img { display: block; width: 100%; height: auto; }
.phone.wide { grid-column: 1 / -1; }
.phone.wide .frame { max-width: 56rem; }

.steps { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr)); gap: 4px 16px; margin: 0; padding: 0; list-style: none; }
.steps-act { grid-column: 1 / -1; margin: 12px 0 2px; color: var(--muted); font-size: 0.8125rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
.step {
  display: flex; align-items: center; gap: 0.25em;
  width: 100%; min-height: 36px; padding: 4px 10px; border-radius: 8px;
  background: transparent; color: var(--muted);
  font: 400 0.875rem/1.3 var(--body); text-align: left;
}
.step[aria-current="step"] { background: var(--accent); color: var(--on-colour); font-weight: 600; }
.step .n { flex: none; min-width: 1.75em; font-variant-numeric: tabular-nums; }
`;

const SCRIPT = `
const stage = document.getElementById("stage");
const stepsEl = document.getElementById("steps");
const playBtn = document.getElementById("play");
const countEl = document.getElementById("count");
const SECONDS = 4;
let at = 0;
let timer = null;

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function stopPlaying() {
  clearInterval(timer);
  timer = null;
  playBtn.textContent = "Play";
}

function show(i) {
  at = Math.max(0, Math.min(BEATS.length - 1, i));
  const beat = BEATS[at];
  document.getElementById("act").textContent = beat.act;
  document.getElementById("title").textContent = beat.title;
  document.getElementById("caption").textContent = beat.caption;
  countEl.textContent = (at + 1) + " of " + BEATS.length;

  stage.replaceChildren(...beat.shots.map((s) => {
    const phone = el("figure", "phone");
    if (s.wide) phone.classList.add("wide");
    phone.style.margin = "0";
    const label = el("figcaption", "label", s.name);
    if (s.tag) {
      const pill = el("span", "pill", s.tag);
      pill.dataset.tag = s.tag;
      label.append(pill);
    }
    const frame = el("div", "frame");
    const img = el("img");
    img.src = "data:image/jpeg;base64," + IMAGES[s.image];
    img.alt = s.name + "'s screen";
    frame.append(img);
    phone.append(label, frame);
    return phone;
  }));

  for (const button of stepsEl.querySelectorAll(".step")) {
    if (Number(button.dataset.i) === at) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  }
}

let lastAct = null;
BEATS.forEach((beat, i) => {
  if (beat.act !== lastAct) {
    stepsEl.append(el("li", "steps-act", beat.act));
    lastAct = beat.act;
  }
  const li = el("li");
  const button = el("button", "step");
  button.dataset.i = i;
  button.append(el("span", "n", String(i + 1)), beat.title);
  button.addEventListener("click", () => { stopPlaying(); show(i); });
  li.append(button);
  stepsEl.append(li);
});

document.getElementById("prev").addEventListener("click", () => { stopPlaying(); show(at - 1); });
document.getElementById("next").addEventListener("click", () => { stopPlaying(); show(at + 1); });
playBtn.addEventListener("click", () => {
  if (timer) { stopPlaying(); return; }
  if (at === BEATS.length - 1) show(0);
  playBtn.textContent = "Pause";
  timer = setInterval(() => {
    if (at === BEATS.length - 1) { stopPlaying(); return; }
    show(at + 1);
  }, SECONDS * 1000);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") { stopPlaying(); show(at + 1); }
  if (e.key === "ArrowLeft") { stopPlaying(); show(at - 1); }
});

show(0);
`;

/** JSON that is safe to put inside a script tag. */
function inline(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/** What the page calls itself, and the line under the title saying what was run. */
export interface ReplayLabels {
  title: string;
  source: string;
}

const IMPOSTER_LABELS: ReplayLabels = {
  title: "Imposter Party Replay",
  source: "Real browsers against the real server",
};

export function buildReplay(
  beats: Beat[],
  images: Map<string, string>,
  when: Date,
  labels: ReplayLabels = IMPOSTER_LABELS,
): string {
  // Only the images this run's steps still refer to.
  const used = new Set(beats.flatMap((b) => b.shots.map((s) => s.image)));
  const table = Object.fromEntries([...images].filter(([id]) => used.has(id)));
  const date = when.toISOString().slice(0, 16).replace("T", " ");

  return `<meta charset="utf-8">
<title>${labels.title}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,800&family=Inter:wght@400;600&display=swap">
<style>${STYLE}</style>
<div class="page">
  <header class="top">
    <h1>${labels.title}</h1>
    <p class="run">${labels.source} ·${beats.length} checked steps · run ${date} UTC</p>
  </header>
  <section class="now" aria-live="polite">
    <p class="act" id="act"></p>
    <h2 id="title"></h2>
    <p class="caption" id="caption"></p>
  </section>
  <div class="controls">
    <button class="play" id="play" type="button">Play</button>
    <button id="prev" type="button">Back</button>
    <button id="next" type="button">Next</button>
    <span class="count" id="count"></span>
  </div>
  <div class="phones" id="stage"></div>
  <ol class="steps" id="steps"></ol>
</div>
<script>
const BEATS = ${inline(beats)};
const IMAGES = ${inline(table)};
${SCRIPT}
</script>
`;
}
