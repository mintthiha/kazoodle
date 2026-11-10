// What every Fibblash part needs to turn player ids into people on screen.
// Built once per render by the phone or main-screen root and passed down, so
// the parts stay plain data-in, markup-out.
export interface People {
  nameFor: (id: string) => string;
  hueFor: (id: string) => number;
  /** "Ana, Ben and Cleo", in the reader's language. */
  list: (names: readonly string[]) => string;
  /** This phone's player id, or "" on the main screen. */
  selfId: string;
}
