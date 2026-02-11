import Link from 'next/link'

export function MarkdocLink({
  href,
  title,
  children,
}: {
  href: string
  title?: string
  children: React.ReactNode
}) {
  if (href.startsWith('/') || href.startsWith('#')) {
    return (
      <Link href={href} title={title}>
        {children}
      </Link>
    )
  }

  return (
    <a href={href} title={title}>
      {children}
    </a>
  )
}
