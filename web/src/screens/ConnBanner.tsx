import type { ConnState } from "../net/connection";
import { useT } from "../i18n";

// A thin status strip shown on every screen while the socket is anything other
// than "open". The connection dropping is the normal case, not an error state.
export function ConnBanner({ state }: { state: ConnState }) {
  const { t } = useT();
  if (state === "open") return null;

  const label =
    state === "reconnecting"
      ? t("conn.reconnecting")
      : state === "closed"
        ? t("conn.closed")
        : t("conn.connecting");

  return (
    <div className="conn-banner" role="status" data-state={state}>
      {label}
    </div>
  );
}
