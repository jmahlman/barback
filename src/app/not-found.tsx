import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="font-display text-5xl text-brass-300">86&apos;d</p>
      <p className="max-w-sm text-sm text-bar-400">
        We are out of whatever you asked for. That page does not exist.
      </p>
      <Link href="/" className="btn-primary">
        Back to the bar
      </Link>
    </div>
  );
}
