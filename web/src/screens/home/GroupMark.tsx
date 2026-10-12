// The hub's one piece of illustration: three dots packed together, three dots
// spread apart, joined by a dotted link. It is the whole product thesis in
// 44 pixels of height — same games whether you're on one couch or three
// continents — so it earns the single animated moment on the page.
//
// Decorative, hence aria-hidden: the tagline next to it says the same thing in
// words, and a screen reader does not need it twice.
export function GroupMark() {
  const together = [14, 27, 40];
  const apart: [number, number][] = [
    [74, 10],
    [100, 24],
    [120, 9],
  ];

  return (
    <svg className="group-mark" viewBox="0 0 128 44" aria-hidden="true" focusable="false">
      <line className="group-link" x1="48" y1="22" x2="66" y2="22" />
      {together.map((x, i) => (
        <circle key={`t${x}`} className="group-dot" style={delay(i)} cx={x} cy={22} r={5.5} />
      ))}
      {apart.map(([x, y], i) => (
        <circle
          key={`a${x}`}
          className="group-dot group-dot-apart"
          style={delay(i + 3)}
          cx={x}
          cy={y}
          r={5.5}
        />
      ))}
    </svg>
  );
}

// Each dot pops in a beat after the one before it. The delay is inline because
// it is data about this dot, not a style worth a class of its own.
function delay(i: number) {
  return { animationDelay: `${160 + i * 70}ms` };
}
