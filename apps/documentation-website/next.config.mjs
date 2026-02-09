import withMarkdoc from '@markdoc/next.js'

import withSearch from './src/markdoc/search.mjs'

const isGitHubPages = process.env.GITHUB_PAGES === 'true'

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['js', 'jsx', 'md', 'ts', 'tsx'],
  ...(isGitHubPages && {
    output: 'export',
    basePath: '/safe',
    images: { unoptimized: true },
  }),
}

export default withSearch(
  withMarkdoc({ schemaPath: './src/markdoc' })(nextConfig),
)
