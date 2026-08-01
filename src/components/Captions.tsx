type CaptionsProps = {
  caption: { speaker?: string; text: string } | null
  accent?: string
}

export default function Captions({ caption, accent = '#f59e0b' }: CaptionsProps) {
  if (!caption || !caption.text) return null

  return (
    <div className="pointer-events-none flex w-full justify-center px-6">
      <div className="max-w-2xl rounded-2xl border border-white/10 bg-black/60 px-6 py-4 shadow-2xl backdrop-blur-md">
        {caption.speaker && (
          <div
            className="mb-1 text-xs font-bold uppercase tracking-[0.2em]"
            style={{ color: accent }}
          >
            {caption.speaker}
          </div>
        )}
        <p className="text-lg leading-relaxed text-white sm:text-xl">{caption.text}</p>
      </div>
    </div>
  )
}
