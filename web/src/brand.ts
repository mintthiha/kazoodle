// The one place the brand name lives. Package names, module paths and env vars
// stay generic (party-games / pg-*) on purpose: renaming a web app is cheap,
// renaming a shipped bundle identifier is not. If the name changes, it changes
// here and in the i18n catalogue, nowhere else.
export const BRAND = {
  /** Display name, shown on the hub's wordmark. */
  name: "Kazoodle",
};
