/**
 * Soft drifting light, a faint grid and film grain behind the interface.
 * `still` pauses the drift (inside tools, so the page stays calm and no frames
 * are spent on decoration while documents are being processed).
 */
export function AmbientBackground({ still = false }: { still?: boolean }) {
  return (
    <div className={still ? 'ambient is-still' : 'ambient'} aria-hidden>
      <div className="ambient-blob a" />
      <div className="ambient-blob b" />
      <div className="ambient-blob c" />
      <div className="ambient-grid" />
      <div className="ambient-noise" />
    </div>
  );
}
