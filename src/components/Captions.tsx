// VN-style dialogue card (Yam / Love-and-Deepspace chrome): white card, angled
// violet name banner, beat-progress pips, location label.
type CaptionsProps = {
  caption: { speaker?: string; text: string } | null
  progress?: { i: number; total: number } | null
  location?: string
}

const VIOLET = '#6d5bd0'

export default function Captions({ caption, progress, location = 'THE VILLA' }: CaptionsProps) {
  if (!caption || !caption.text) return null

  return (
    <div className="pointer-events-none flex w-full justify-center px-4">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white/95 px-6 pb-3 pt-7 shadow-2xl">
        {caption.speaker && (
          <div
            className="absolute -top-4 left-0 px-5 py-1.5"
            style={{
              background: 'linear-gradient(90deg, #4c3a9e, #6d5bd0)',
              clipPath: 'polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%)',
            }}
          >
            <span className="text-sm font-bold tracking-wide text-white">{caption.speaker}</span>
          </div>
        )}
        <p className="text-lg leading-relaxed text-zinc-800 sm:text-xl">{caption.text}</p>
        <div className="mt-3 flex items-center justify-between text-xs" style={{ color: VIOLET }}>
          <div className="flex items-center gap-2">
            {progress && (
              <>
                <div className="flex gap-1">
                  {Array.from({ length: progress.total }, (_, k) => (
                    <span
                      key={k}
                      className="h-2 w-1.5"
                      style={{ background: k < progress.i ? VIOLET : `${VIOLET}33` }}
                    />
                  ))}
                </div>
                <span className="font-mono">
                  {progress.i} / {progress.total}
                </span>
              </>
            )}
          </div>
          <span className="flex items-center gap-3 font-semibold tracking-[0.3em]">
            {location}
            <span className="text-sm">▾</span>
          </span>
        </div>
      </div>
    </div>
  )
}
