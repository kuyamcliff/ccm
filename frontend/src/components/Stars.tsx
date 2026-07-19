export function Stars({ value }: { value: number }) {
  return (
    <span className="stars" role="img" aria-label={`${value} out of 5 stars`}>
      {"★".repeat(value)}
      <span className="stars-empty">{"★".repeat(5 - value)}</span>
    </span>
  );
}
