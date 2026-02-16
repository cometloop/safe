import { describe, it, expect } from 'vitest'
import { buildUrl } from '../url'

describe('buildUrl', () => {
  it('builds a simple URL without params', () => {
    expect(buildUrl('https://api.example.com', '/users')).toBe(
      'https://api.example.com/users'
    )
  })

  it('substitutes path params', () => {
    expect(
      buildUrl('https://api.example.com', '/users/:id', { id: '123' })
    ).toBe('https://api.example.com/users/123')
  })

  it('substitutes multiple path params', () => {
    expect(
      buildUrl('https://api.example.com', '/users/:userId/posts/:postId', {
        userId: '1',
        postId: '42',
      })
    ).toBe('https://api.example.com/users/1/posts/42')
  })

  it('encodes param values', () => {
    expect(
      buildUrl('https://api.example.com', '/search/:query', {
        query: 'hello world',
      })
    ).toBe('https://api.example.com/search/hello%20world')
  })

  it('handles trailing slash on baseUrl', () => {
    expect(buildUrl('https://api.example.com/', '/users')).toBe(
      'https://api.example.com/users'
    )
  })

  it('handles path without leading slash', () => {
    expect(buildUrl('https://api.example.com', 'users')).toBe(
      'https://api.example.com/users'
    )
  })

  it('handles no params argument', () => {
    expect(buildUrl('https://api.example.com', '/users/:id')).toBe(
      'https://api.example.com/users/:id'
    )
  })
})
