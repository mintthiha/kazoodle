interface Option<T> {
  value: T;
  label: string;
}

interface Props<T> {
  /** Groups the radios; must be unique on the screen. */
  name: string;
  legend: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  /** Let the options wrap as chips, for lists too long for one line. */
  wrap?: boolean;
}

// A pick-one control with every option in plain sight, for the lobby's match
// setup: a native select hides its choices behind a tap, which is the wrong trade
// for a setting with three options.
//
// Real radio inputs under the styling, not buttons pretending, so arrow keys and
// screen readers already know what this is. The input is hidden visually in CSS
// and the <span> after it is what gets drawn.
export function Segmented<T extends string | number>({
  name,
  legend,
  value,
  options,
  onChange,
  wrap = false,
}: Props<T>) {
  return (
    <fieldset className="choice">
      <legend>{legend}</legend>
      <div className={wrap ? "choice-chips" : "choice-track"}>
        {options.map((o) => (
          <label key={String(o.value)} className="choice-option">
            <input
              type="radio"
              className="visually-hidden"
              name={name}
              checked={o.value === value}
              onChange={() => onChange(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
