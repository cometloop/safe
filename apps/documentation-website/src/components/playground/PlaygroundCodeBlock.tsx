'use client'

import { Fragment } from 'react'
import { Highlight } from 'prism-react-renderer'

export function PlaygroundCodeBlock({
  code,
  language = 'typescript',
}: {
  code: string
  language?: string
}) {
  return (
    <Highlight
      code={code.trimEnd()}
      language={language || 'typescript'}
      theme={{ plain: {}, styles: [] }}
    >
      {({ className, style, tokens, getTokenProps }) => (
        <pre
          className={className}
          style={{
            ...style,
            margin: 0,
            fontSize: '0.75rem',
            lineHeight: '1.5',
            padding: '1rem',
            overflow: 'auto',
          }}
        >
          <code>
            {tokens.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {line
                  .filter((token) => !token.empty)
                  .map((token, tokenIndex) => (
                    <span key={tokenIndex} {...getTokenProps({ token })} />
                  ))}
                {'\n'}
              </Fragment>
            ))}
          </code>
        </pre>
      )}
    </Highlight>
  )
}
