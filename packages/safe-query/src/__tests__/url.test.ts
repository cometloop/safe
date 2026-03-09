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

  it('throws when path has unreplaced params', () => {
    expect(() => buildUrl('https://api.example.com', '/users/:id')).toThrow(
      'Missing URL params: id'
    )
  })

  it('throws when params object is missing required params', () => {
    expect(() => buildUrl('https://api.example.com', '/users/:id', {})).toThrow(
      'Missing URL params: id'
    )
  })

  it('throws when some path params are missing', () => {
    expect(() =>
      buildUrl('https://api.example.com', '/users/:userId/posts/:postId', {
        userId: '1',
      })
    ).toThrow('Missing URL params: postId')
  })

  describe('search params', () => {
    it('appends search params as query string', () => {
      expect(
        buildUrl('https://api.example.com', '/users', undefined, {
          search: 'foo',
          page: 2,
        })
      ).toBe('https://api.example.com/users?page=2&search=foo')
    })

    it('handles boolean search params', () => {
      expect(
        buildUrl('https://api.example.com', '/users', undefined, {
          active: true,
        })
      ).toBe('https://api.example.com/users?active=true')
    })

    it('handles array search params by repeating keys', () => {
      expect(
        buildUrl('https://api.example.com', '/users', undefined, {
          tag: ['a', 'b', 'c'],
        })
      ).toBe('https://api.example.com/users?tag=a&tag=b&tag=c')
    })

    it('encodes search param values', () => {
      expect(
        buildUrl('https://api.example.com', '/users', undefined, {
          q: 'hello world',
        })
      ).toBe('https://api.example.com/users?q=hello%20world')
    })

    it('encodes search param keys', () => {
      expect(
        buildUrl('https://api.example.com', '/users', undefined, {
          'my key': 'value',
        })
      ).toBe('https://api.example.com/users?my%20key=value')
    })

    it('combines path params and search params', () => {
      expect(
        buildUrl('https://api.example.com', '/users/:id', { id: '123' }, {
          page: 1,
        })
      ).toBe('https://api.example.com/users/123?page=1')
    })

    it('sorts search params alphabetically', () => {
      expect(
        buildUrl('https://api.example.com', '/users', undefined, {
          z: '1',
          a: '2',
          m: '3',
        })
      ).toBe('https://api.example.com/users?a=2&m=3&z=1')
    })

    it('handles empty search params object', () => {
      expect(
        buildUrl('https://api.example.com', '/users', undefined, {})
      ).toBe('https://api.example.com/users')
    })

    it('handles empty array in search params', () => {
      expect(
        buildUrl('https://api.example.com', '/users', undefined, {
          tags: [],
        })
      ).toBe('https://api.example.com/users')
    })
  })
})
