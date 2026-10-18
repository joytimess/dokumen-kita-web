import { afterEach, describe, expect, it, vi } from 'vitest'
import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { categoriesApi, type CategoryPageFilters } from '../src/services/categories.service'
import { http } from '../src/services/http'

vi.mock('../src/services/http', async (original) => ({
  ...(await original<typeof import('../src/services/http')>()),
  authMode: 'api',
}))

const originalAdapter = http.defaults.adapter
afterEach(() => {
  http.defaults.adapter = originalAdapter
  vi.unstubAllEnvs()
})

function respondWith(data: unknown) {
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
  const calls: InternalAxiosRequestConfig[] = []
  http.defaults.adapter = async (config) => {
    calls.push(config)
    return { config, status: 200, data, statusText: 'OK', headers: new AxiosHeaders() }
  }
  return calls
}

describe('Category list API compatibility', () => {
  it('requests the first ten newest categories by default and retains pagination metadata', async () => {
    const page = { data: [], meta: { current_page: 1, per_page: 10, total: 12, last_page: 2 }, links: { prev: null, next: '?page=2' } }
    const calls = respondWith(page)
    expect(await categoriesApi.listPage()).toEqual(page)
    expect(calls[0]?.url).toBe('http://localhost:8000/api/v1/categories')
    expect(calls[0]?.params).toEqual({ page: 1, per_page: 10, sort_by: 'created_at', sort_direction: 'desc' })
  })

  it.each<[CategoryPageFilters['sortBy'], CategoryPageFilters['sortDirection']]>([
    ['created_at', 'desc'], ['created_at', 'asc'], ['name', 'asc'], ['name', 'desc'],
    ['documents_count', 'desc'], ['documents_count', 'asc'],
  ])('sends search, pagination and %s %s to the server', async (sortBy, sortDirection) => {
    const calls = respondWith({ data: [] })
    await categoriesApi.listPage({ q: 'Annual 50%_!', page: 2, perPage: 25, sortBy, sortDirection })
    expect(calls[0]?.params).toEqual({
      q: 'Annual 50%_!', page: 2, per_page: 25, sort_by: sortBy, sort_direction: sortDirection,
    })
  })

  it('keeps legacy dropdown callers unpaginated and returns every category', async () => {
    const categories = Array.from({ length: 12 }, (_, index) => ({ guid: String(index), name: `Category ${index}` }))
    const calls = respondWith({ data: categories })
    expect(await categoriesApi.list()).toEqual(categories)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.params).toBeUndefined()
  })
})
