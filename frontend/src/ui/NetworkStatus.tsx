import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { useCopy } from "~/state/locale";

/**
 * The bar that says the connection went.
 *
 * Worth having on this site specifically. A mobile connection in Buea drops, and
 * when it does every request fails at once: without a word from the interface,
 * the site reads as broken rather than as offline, and the reasonable response
 * to a broken site is to close it.
 *
 * "Back online" is shown briefly and then goes, because a permanent green bar
 * saying everything is fine is noise. `navigator.onLine` is not a promise that
 * the internet works, only that the device thinks it has a network, so this is
 * treated as a hint and never as a gate on anything.
 */
export function NetworkStatus() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [showRecovered, setShowRecovered] = useState(false);
  const { c } = useCopy();

  useEffect(() => {
    const goOffline = () => {
      setOnline(false);
      setShowRecovered(false);
    };
    const goOnline = () => {
      setOnline(true);
      setShowRecovered(true);
    };

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  useEffect(() => {
    if (!showRecovered) return;
    const timer = setTimeout(() => setShowRecovered(false), 2600);
    return () => clearTimeout(timer);
  }, [showRecovered]);

  if (online && !showRecovered) return null;

  return (
    <div className="netbar" data-state={online ? "back" : "gone"} role="status" aria-live="polite">
      <Icon name={online ? "check-circle" : "wifi-off"} size={15} />
      {online ? c.common.backOnline : c.common.offline}
    </div>
  );
}
