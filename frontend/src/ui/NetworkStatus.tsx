import { useEffect, useState } from "react";
import { useLocale } from "~/state/locale";
import { Icon } from "~/ui/Icon";

export function NetworkStatus() {
  const { t } = useLocale();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [showRecovered, setShowRecovered] = useState(false);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const onOffline = () => {
      setOnline(false);
      setShowRecovered(false);
      if (timeout) clearTimeout(timeout);
    };
    const onOnline = () => {
      setOnline(true);
      setShowRecovered(true);
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => setShowRecovered(false), 2600);
    };

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      if (timeout) clearTimeout(timeout);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  if (online && !showRecovered) return null;

  return (
    <div className={`network-status${online ? " network-status--good" : ""}`} role="status" aria-live="polite">
      <Icon name={online ? "check-circle" : "wifi-off"} size={16} />
      <span>{online ? t("backOnline") : t("noConnection")}</span>
      {!online ? <span className="network-status__sub">Your basket and current form stay on this device.</span> : null}
    </div>
  );
}
