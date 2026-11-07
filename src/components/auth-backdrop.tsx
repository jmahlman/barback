/**
 * The photograph behind the signed-out pages.
 *
 * Two scrims sit over it: a vertical gradient so the top and bottom edges
 * stay dark, and a flat wash that guarantees contrast wherever the form
 * lands. Text legibility has to hold regardless of what is behind it, so the
 * wash is not decorative — removing it drops body text below a readable
 * ratio against the brighter bottles.
 */
export function AuthBackdrop({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-12">
      <div
        aria-hidden
        className="absolute inset-0 bg-bar-950 bg-cover bg-center"
        style={{ backgroundImage: "url('/images/bar.jpg')" }}
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-bar-950/85 via-bar-950/35 to-bar-950/90"
      />
      <div aria-hidden className="absolute inset-0 bg-bar-950/25" />

      <div className="relative w-full max-w-md">{children}</div>

      <p className="absolute bottom-3 right-4 text-[11px] text-bar-200/55">
        Photo by{" "}
        <a
          href="https://unsplash.com/@echaparro"
          target="_blank"
          rel="noreferrer noopener"
          className="underline-offset-2 hover:text-bar-200 hover:underline"
        >
          Edgar Chaparro
        </a>{" "}
        on{" "}
        <a
          href="https://unsplash.com/photos/brown-wooden-shelf-with-bottles-Lwx-q6OdGAc"
          target="_blank"
          rel="noreferrer noopener"
          className="underline-offset-2 hover:text-bar-200 hover:underline"
        >
          Unsplash
        </a>
      </p>
    </div>
  );
}
