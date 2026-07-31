import { useState } from "react";
import { Icon } from "./Icon";

/**
 * A photograph that cannot leave a hole in the page.
 *
 * Menu and gallery images can point anywhere the owner pastes a URL, including
 * hosts that later go away or that a customer's network blocks. A plain <img>
 * in that case draws an empty box with no explanation. This falls back to the
 * flame mark, which at least reads as intentional.
 */
export function Photo({
  src,
  alt,
  className,
  eager,
}: {
  src: string | null;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span className={[className, "photo--blank"].filter(Boolean).join(" ")} aria-hidden="true">
        <Icon name="flame" size={24} />
      </span>
    );
  }

  return (
    <img
      className={className}
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
