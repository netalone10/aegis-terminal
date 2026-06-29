interface SectionHeaderProps {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  right?: React.ReactNode
}

export default function SectionHeader({ title, subtitle, icon, right }: SectionHeaderProps) {
  return (
    <div className="flex items-end justify-between mb-6">
      <div>
        <div className="flex items-center gap-3">
          {icon && <div className="text-emerald">{icon}</div>}
          <h2 className="text-2xl font-bold tracking-tight text-text">{title}</h2>
        </div>
        {subtitle && <p className="text-sm text-text-muted mt-1">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}
