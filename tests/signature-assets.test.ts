// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import AssetLibrary from '../src/components/signatures/AssetLibrary.vue'
import type { SignatureAsset, Page } from '../src/types/documents'

const mocks = vi.hoisted(() => ({
  assets: vi.fn(),
  deleteAsset: vi.fn(),
  confirmAction: vi.fn(),
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}))

vi.mock('../src/services/documents.service', () => ({
  documentsApi: { assets: mocks.assets, deleteAsset: mocks.deleteAsset },
}))
vi.mock('../src/services/feedback', () => ({
  confirmAction: mocks.confirmAction,
  notify: { success: mocks.notifySuccess, error: mocks.notifyError },
}))
vi.mock('../src/composables/useWorkspaceRequest', async () => {
  const { ref } = await import('vue')
  return {
    useWorkspaceRequest: () => {
      const busy = ref(false)
      const error = ref('')
      const fields = ref<Record<string, string>>({})
      return {
        busy,
        error,
        fields,
        async run<T>(action: () => Promise<T>) {
          busy.value = true
          error.value = ''
          try {
            return await action()
          } catch {
            error.value = 'Gagal menghapus tanda tangan.'
            mocks.notifyError(error.value)
          } finally {
            busy.value = false
          }
        },
      }
    },
  }
})
vi.mock('../src/components/signatures/AssetImage.vue', async () => {
  const { h } = await import('vue')
  return {
    default: {
      props: ['guid', 'imageClass'],
      setup(props: { guid: string; imageClass?: string }) {
        return () =>
          h('img', { src: `/assets/${props.guid}`, class: props.imageClass, alt: 'Tanda tangan' })
      },
    },
  }
})
vi.mock('../src/components/signatures/SignatureCanvas.vue', () => ({
  default: { setup: () => () => null },
}))
vi.mock('../src/components/ui/BaseButton.vue', async () => {
  const { h } = await import('vue')
  return {
    default: {
      setup(_: unknown, { slots }: { slots: Record<string, (() => unknown) | undefined> }) {
        return () => h('button', slots.default?.())
      },
    },
  }
})
vi.mock('../src/components/ui/FeedbackMessage.vue', async () => {
  const { h } = await import('vue')
  return {
    default: {
      props: ['message'],
      setup(props: { message: string }) {
        return () => (props.message ? h('p', props.message) : null)
      },
    },
  }
})

const first: SignatureAsset = {
  guid: 'asset-1',
  source_type: 'drawn',
  mime_type: 'image/png',
  width: 800,
  height: 300,
  size_bytes: 12000,
  image_url: '/assets/asset-1',
  created_at: '2026-10-19T00:00:00Z',
}
const second: SignatureAsset = { ...first, guid: 'asset-2', source_type: 'upload' }
let savedAssets: SignatureAsset[]
const mounted: Array<{ unmount: () => void; host: HTMLDivElement }> = []

function response(page = 1, perPage = 6): Page<SignatureAsset> {
  const start = (page - 1) * perPage
  const lastPage = Math.max(1, Math.ceil(savedAssets.length / perPage))
  return {
    data: savedAssets.slice(start, start + perPage),
    meta: {
      current_page: page,
      last_page: lastPage,
      total: savedAssets.length,
      per_page: perPage,
    },
    links: {
      prev: page > 1 ? '/assets?page=1' : null,
      next: page < lastPage ? '/assets?page=2' : null,
    },
  }
}

async function settle() {
  for (let index = 0; index < 5; index++) {
    await Promise.resolve()
    await nextTick()
  }
}

function mountGallery() {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(AssetLibrary, { standalone: true })
  app.mount(host)
  const item = { unmount: () => app.unmount(), host }
  mounted.push(item)
  return host
}

function button(host: HTMLElement, label: string) {
  const result = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!result) throw new Error(`Button not found: ${label}`)
  return result
}

beforeEach(() => {
  savedAssets = [first, second]
  vi.clearAllMocks()
  mocks.assets.mockImplementation(async (page = 1, perPage = 6) => response(page, perPage))
  mocks.deleteAsset.mockImplementation(async (guid: string) => {
    savedAssets = savedAssets.filter((asset) => asset.guid !== guid)
  })
  mocks.confirmAction.mockResolvedValue(true)
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '')
    }
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open')
    }
  }
})

afterEach(() => {
  for (const item of mounted.splice(0)) {
    item.unmount()
    item.host.remove()
  }
})

describe('galeri aset tanda tangan', () => {
  it('menampilkan enam aset per halaman dengan kontrol pagination standar', async () => {
    savedAssets = Array.from({ length: 7 }, (_, index) => ({
      ...first,
      guid: `asset-${index + 1}`,
    }))
    const host = mountGallery()
    await settle()

    expect(mocks.assets).toHaveBeenCalledWith(1, 6)
    expect(host.querySelectorAll('article')).toHaveLength(6)
    expect(host.textContent).toContain('Menampilkan 1–6 dari 7')
    expect(button(host, 'Sebelumnya').disabled).toBe(true)

    button(host, 'Berikutnya').click()
    await settle()

    expect(mocks.assets).toHaveBeenLastCalledWith(2, 6)
    expect(host.querySelectorAll('article')).toHaveLength(1)
    expect(host.textContent).toContain('Menampilkan 7–7 dari 7')
    expect(button(host, 'Sebelumnya').disabled).toBe(false)
    expect(button(host, 'Berikutnya').disabled).toBe(true)
  })

  it('membuka preview gambar dengan rasio contain dan menutupnya melalui tombol X', async () => {
    const host = mountGallery()
    await settle()

    button(host, 'Pratinjau tanda tangan').click()
    await settle()
    const dialog = host.querySelector<HTMLDialogElement>('dialog')
    expect(dialog?.open).toBe(true)
    expect(dialog?.querySelector('img')?.className).toContain('object-contain')

    button(host, 'Tutup').click()
    await settle()
    expect(host.querySelector('dialog')).toBeNull()
  })

  it('menutup preview saat Escape atau backdrop ditekan', async () => {
    const host = mountGallery()
    await settle()

    button(host, 'Pratinjau tanda tangan').click()
    await settle()
    host
      .querySelector('dialog')
      ?.dispatchEvent(new Event('cancel', { bubbles: false, cancelable: true }))
    await settle()
    expect(host.querySelector('dialog')).toBeNull()

    button(host, 'Pratinjau tanda tangan').click()
    await settle()
    host.querySelector('dialog')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await settle()
    expect(host.querySelector('dialog')).toBeNull()
  })

  it('membatalkan penghapusan tanpa membuka preview atau memanggil API', async () => {
    mocks.confirmAction.mockResolvedValue(false)
    const host = mountGallery()
    await settle()

    button(host, 'Hapus tanda tangan').click()
    await settle()

    expect(mocks.confirmAction).toHaveBeenCalledOnce()
    expect(mocks.deleteAsset).not.toHaveBeenCalled()
    expect(host.querySelector('dialog')).toBeNull()
    expect(host.querySelectorAll('article')).toHaveLength(2)
  })

  it('menghapus dari daftar hanya setelah API berhasil dan tidak membuka preview dari ikon hapus', async () => {
    const host = mountGallery()
    await settle()

    button(host, 'Hapus tanda tangan').click()
    await settle()

    expect(mocks.deleteAsset).toHaveBeenCalledWith('asset-1')
    expect(host.querySelector('dialog')).toBeNull()
    expect(host.querySelectorAll('article')).toHaveLength(1)
    expect(mocks.notifySuccess).toHaveBeenCalledWith('Tanda tangan berhasil dihapus.')
  })

  it('mempertahankan aset dan menampilkan error jika penghapusan gagal', async () => {
    mocks.deleteAsset.mockRejectedValue(new Error('conflict'))
    const host = mountGallery()
    await settle()

    button(host, 'Hapus tanda tangan').click()
    await settle()

    expect(host.querySelectorAll('article')).toHaveLength(2)
    expect(mocks.assets).toHaveBeenCalledOnce()
    expect(mocks.notifyError).toHaveBeenCalledWith('Gagal menghapus tanda tangan.')
  })
})
