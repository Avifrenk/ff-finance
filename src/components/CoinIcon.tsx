interface Props {
  icon: string | null | undefined
  size?: number
  className?: string
}

// Унифицированный рендер иконки монеты:
// - если icon — URL (http/https): <img>
// - если icon — короткий unicode-символ (₿, Ξ, ◎): текст
// - если null: дефолт 🪙
export function CoinIcon({ icon, size = 24, className = '' }: Props) {
  if (icon && /^https?:\/\//.test(icon)) {
    return (
      <img
        src={icon}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className={`rounded-full inline-block ${className}`}
        style={{ width: size, height: size }}
        onError={(e) => {
          ;(e.currentTarget as HTMLImageElement).style.display = 'none'
        }}
      />
    )
  }
  return (
    <span
      aria-hidden
      className={`inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.85, lineHeight: 1 }}
    >
      {icon || '🪙'}
    </span>
  )
}
