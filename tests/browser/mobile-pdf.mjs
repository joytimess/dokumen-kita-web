// Run with PLAYWRIGHT_MODULE pointing to an installed playwright package and Vite on port 5173.
// All API traffic is mocked; this checks the real signing UI and PDF.js, not Laravel acceptance.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.PDF_TEST_ORIGIN || 'http://localhost:5173'
const baseline = process.argv.includes('--baseline')
const documentGuid = '11111111-1111-4111-8111-111111111111'
const versionGuid = '22222222-2222-4222-8222-222222222222'
const assignmentGuid = '33333333-3333-4333-8333-333333333333'
const assetGuid = '44444444-4444-4444-8444-444444444444'
const hash = 'a'.repeat(64)
const url = `${origin}/documents/${documentGuid}/versions/${versionGuid}/view`

function pdf(sizes) {
  const objects = [null, '<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  const pages = []
  for (const [width, height] of sizes) {
    const page = objects.length, content = page + 1
    const stream = `0.1 0.3 0.2 rg 20 20 ${width - 40} 20 re f\nBT /F1 20 Tf 30 ${height - 50} Td (Signing PDF page ${pages.length + 1}) Tj ET\n`
    pages.push(`${page} 0 R`)
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${content} 0 R >>`, `<< /Length ${stream.length} >>\nstream\n${stream}endstream`)
  }
  objects[2] = `<< /Type /Pages /Kids [${pages.join(' ')}] /Count ${pages.length} >>`
  let result = '%PDF-1.4\n', offsets = [0]
  for (let i = 1; i < objects.length; i++) { offsets.push(result.length); result += `${i} 0 obj\n${objects[i]}\nendobj\n` }
  const xref = result.length
  result += `xref\n0 ${objects.length}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1)) result += `${String(offset).padStart(10, '0')} 00000 n \n`
  return Buffer.from(`${result}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const reports = []
await mkdir('test-results/mobile-pdf', { recursive: true })
async function setup(width, sizes, { missingApi = false, failRequest = false, failRender = false, delay = 0 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: width < 500 ? 3 : 1, isMobile: width < 500, hasTouch: width < 500 })
  const page = await context.newPage(), writes = [], exceptions = [], pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  if (missingApi) await page.addInitScript(() => {
    delete Map.prototype.getOrInsertComputed
  })
  if (failRender) await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext
    window.failPdfRender = true
    HTMLCanvasElement.prototype.getContext = function (...args) {
      if (window.failPdfRender && this.closest('[aria-label="Pembaca PDF"]')) throw new Error('Injected canvas failure')
      return getContext.apply(this, args)
    }
  })
  const cdp = await context.newCDPSession(page)
  await cdp.send('Debugger.enable')
  await cdp.send('Debugger.setPauseOnExceptions', { state: baseline ? 'all' : 'none' })
  cdp.on('Debugger.paused', async (event) => {
    const description = event.data?.description || ''
    if (/getOrInsert|Promise.try|toBase64/.test(description)) exceptions.push(description)
    await cdp.send('Debugger.resume').catch(() => {})
  })
  let requests = 0, signed = false
  await page.route('**/sanctum/csrf-cookie', route => route.fulfill({ status: 204 }))
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    const json = data => route.fulfill({ json: data })
    if (path === '/api/v1/me') return json({ data: { guid: 'user', name: 'PDF Test', email: 'signer@example.test', email_verified: true } })
    if (path === `/api/v1/versions/${versionGuid}`) return json({ data: {
      guid: versionGuid, document_guid: documentGuid, document_title: 'Mobile signing test', version_number: 1,
      status: 'in_progress', preview_status: 'ready', content_hash: hash, is_current: true,
      assignments: [{ guid: assignmentGuid, version_guid: versionGuid, status: signed ? 'signed' : 'ready', claimed_at: '2026-10-26T00:00:00Z', recipient_email: 'signer@example.test', sequence_number: 1,
        placeholders: [{ page_number: 1, x: 0.2, y: 0.3, width: 0.25, height: 0.1 }] }],
    } })
    if (path.endsWith('/pdf')) {
      requests++
      if (delay) await new Promise(resolve => setTimeout(resolve, delay))
      if (failRequest && requests === 1) return route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE' } } })
      return route.fulfill({ contentType: 'application/pdf', headers: { 'x-document-content-hash': hash }, body: pdf(sizes) })
    }
    if (path.endsWith('/ocr')) return json({ data: { processing_status: 'unavailable', page_counts: { total: sizes.length, completed: 0, failed: 0 }, ocr_page_counts: { total: 0, recognized: 0 }, failed_pages: [], matches: [] } })
    if (path === '/api/v1/signature-assets') return json({ data: [{ guid: assetGuid, source_type: 'drawn', mime_type: 'image/png', width: 100, height: 40, size_bytes: 100, created_at: '2026-10-26T00:00:00Z' }], meta: { total: 1, current_page: 1, last_page: 1, per_page: 15 }, links: {} })
    if (path.endsWith('/image')) return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') })
    if (path.endsWith('/read-confirmation') || path.endsWith('/signatures')) {
      writes.push({ path, payload: request.postDataJSON() })
      if (path.endsWith('/signatures')) signed = true
      return json({ data: {} })
    }
    if (path === '/api/v1/notifications') return json({ data: [], meta: { total: 0, unread_count: 0, current_page: 1, last_page: 1 }, links: {} })
    throw new Error(`Unexpected API call: ${path}`)
  })
  await page.goto(url)
  return { context, page, writes, exceptions, pageErrors, requests: () => requests }
}
async function rendered(page, text = 'Signing PDF page') {
  await page.waitForFunction(text => {
    const canvas = document.querySelector('[aria-label="Pembaca PDF"] canvas')
    return canvas && !canvas.classList.contains('invisible') && document.querySelector('.textLayer')?.textContent.includes(text)
  }, text, { timeout: 15000 })
}
async function geometry(page) {
  return page.locator('[aria-label="Pembaca PDF"] canvas').evaluate(canvas => {
    const sheet = canvas.parentElement, scroller = sheet.parentElement
    const rect = sheet.getBoundingClientRect(), overlay = sheet.querySelector('[data-overlay]')?.getBoundingClientRect()
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    let ink = 0
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 200 && pixels[i + 3]) ink++
    return { width: rect.width, height: rect.height, canvasWidth: canvas.width, canvasHeight: canvas.height, ink,
      overflow: scroller.scrollWidth - scroller.clientWidth, bodyOverflow: document.documentElement.scrollWidth - innerWidth,
      overlay: overlay && { x: (overlay.left - rect.left) / rect.width, y: (overlay.top - rect.top) / rect.height, width: overlay.width / rect.width, height: overlay.height / rect.height } }
  })
}
try {
  if (baseline) {
    for (const missingApi of [false, true]) {
      const test = await setup(390, [[595, 842]], { missingApi })
      try { await rendered(test.page); reports.push({ missingApi, rendered: true, geometry: await geometry(test.page) }) }
      catch { reports.push({ missingApi, rendered: false, error: await test.page.getByText('Halaman PDF belum dapat dimuat. Coba muat halaman lagi.', { exact: true }).count(), exceptions: test.exceptions }) }
      await test.context.close()
    }
  } else {
    for (const width of [360, 375, 390, 430, 1440]) {
      for (const sizes of [[[595, 842]], [[842, 595]], [[595, 842], [842, 595], [595, 842]]]) {
        const test = await setup(width, sizes, { missingApi: true })
        try {
          await rendered(test.page)
          const checkbox = test.page.getByRole('checkbox')
          const first = await geometry(test.page)
          assert(first.ink > 100, 'Canvas must contain PDF content')
          assert(first.overflow <= 1 && first.bodyOverflow <= 1, 'Fit width must not overflow')
          for (const [key, value] of Object.entries({ x: 0.2, y: 0.3, width: 0.25, height: 0.1 })) assert(Math.abs(first.overlay[key] - value) < 0.001)
          if (sizes.length > 1) {
            assert(await checkbox.isDisabled(), 'Cannot sign without visiting all pages')
            await test.page.getByLabel('Ke halaman', { exact: true }).fill(String(sizes.length))
            await test.page.getByRole('button', { name: 'Buka', exact: true }).click()
            await rendered(test.page, `Signing PDF page ${sizes.length}`)
            assert(await checkbox.isDisabled(), 'Jump to last page cannot bypass read gate')
            for (let p = 1; p <= sizes.length; p++) {
              await test.page.getByLabel('Ke halaman', { exact: true }).fill(String(p))
              await test.page.getByRole('button', { name: 'Buka', exact: true }).click()
              await rendered(test.page, `Signing PDF page ${p}`)
              await test.page.locator('[aria-label="Pembaca PDF"] canvas').evaluate(canvas => {
                const scroller = canvas.parentElement.parentElement
                scroller.scrollTop = scroller.scrollHeight
              })
            }
          }
          await test.page.locator('[aria-label="Pembaca PDF"] canvas').evaluate(canvas => {
            const scroller = canvas.parentElement.parentElement
            scroller.scrollTop = scroller.scrollHeight
          })
          await checkbox.waitFor({ state: 'visible' })
          await test.page.waitForFunction(() => !document.querySelector('input[type="checkbox"]').disabled)
          await checkbox.check()
          await test.page.getByRole('button', { name: /Pilih tanda tangan ini/ }).click()
          await test.page.getByRole('button', { name: 'Konfirmasi baca dan tanda tangani', exact: true }).click()
          await test.page.getByRole('dialog').getByRole('button', { name: 'Tandatangani', exact: true }).click()
          await test.page.getByText('Tanda tangan telah diterima. Tindakan baru tidak tersedia untuk persetujuan ini.', { exact: true }).waitFor()
          assert.deepEqual(test.writes.map(write => write.path), [`/api/v1/assignments/${assignmentGuid}/read-confirmation`, `/api/v1/assignments/${assignmentGuid}/signatures`])
          assert.deepEqual(test.writes[0].payload, { confirmed: true, version_content_hash: hash })
          assert.equal(test.writes[1].payload.asset_guid, assetGuid)
          assert.equal(test.writes[1].payload.version_content_hash, hash)
          assert.equal(test.writes[1].payload.confirmed, true)
          assert(test.writes[1].payload.idempotency_key)
          reports.push({ width, pages: sizes.length, sizes, geometry: first, signing: 'passed (mock API)' })
          if (width === 390 && sizes.length === 3) await test.page.screenshot({ path: 'test-results/mobile-pdf/mobile-390.png', fullPage: true })
          console.log(`PASS ${width}px / ${sizes.length} pages / ${sizes[0].join('x')}`)
        } finally { await test.context.close() }
      }
    }
    for (const failure of ['request', 'render']) {
      const test = await setup(375, [[595, 842]], { failRequest: failure === 'request', failRender: failure === 'render' })
      try {
        await test.page.getByRole('button', { name: 'Coba muat lagi', exact: true }).waitFor()
        assert(await test.page.getByRole('checkbox').isDisabled())
        if (failure === 'render') await test.page.evaluate(() => { window.failPdfRender = false })
        await test.page.getByRole('button', { name: 'Coba muat lagi', exact: true }).click()
        await rendered(test.page)
        assert.equal(test.requests(), failure === 'request' ? 2 : 1)
        assert.equal(await test.page.getByRole('button', { name: 'Coba muat lagi', exact: true }).count(), 0)
        reports.push({ failure, retry: 'passed' })
      } finally { await test.context.close() }
    }
    const test = await setup(390, [[595, 6000]], { delay: 500 })
    try {
      await test.page.waitForRequest('**/pdf')
      await test.page.reload()
      await rendered(test.page)
      let before = await geometry(test.page)
      assert(before.canvasHeight <= 4096 && before.canvasWidth * before.canvasHeight <= 5_242_880)
      for (const width of [430, 360, 390]) {
        await test.page.setViewportSize({ width, height: 844 })
        await test.page.waitForFunction(() => {
          const canvas = document.querySelector('[aria-label="Pembaca PDF"] canvas')
          return canvas && !canvas.classList.contains('invisible') && Math.abs(canvas.getBoundingClientRect().width - (canvas.parentElement.parentElement.clientWidth - 24)) <= 1
        })
        before = await geometry(test.page)
        assert(before.canvasHeight <= 4096 && before.canvasWidth * before.canvasHeight <= 5_242_880)
        assert(before.overflow <= 1 && before.bodyOverflow <= 1)
        assert(Math.abs(before.overlay.x - 0.2) < 0.001)
      }
      assert(await test.page.getByRole('checkbox').isDisabled(), 'Tall document must be scrolled to the end')
      await test.page.locator('[aria-label="Pembaca PDF"] canvas').evaluate(canvas => { const scroller = canvas.parentElement.parentElement; scroller.scrollTop = scroller.scrollHeight })
      await test.page.waitForFunction(() => !document.querySelector('input[type="checkbox"]').disabled)
      await test.page.getByRole('combobox', { name: 'Zoom', exact: true }).click()
      await test.page.getByRole('option', { name: '200%', exact: true }).click()
      await rendered(test.page)
      const zoomed = await geometry(test.page)
      assert(zoomed.canvasHeight <= 4096 && zoomed.canvasWidth * zoomed.canvasHeight <= 5_242_880)
      assert(Math.abs(zoomed.overlay.x - 0.2) < 0.001)
      reports.push({ reloadResizeScrollZoom: 'passed', geometry: zoomed })
    } finally { await test.context.close() }
    for (const width of [390, 1440]) {
      const test = await setup(width, [[595, 842]])
      try {
        await rendered(test.page)
        await test.page.evaluate(async ({ versionGuid, hash }) => {
          const { createApp, h, ref } = await import('/node_modules/.vite/deps/vue.js')
          const { default: PdfViewer } = await import('/src/components/documents/PdfViewer.vue')
          document.querySelector('#app').remove()
          const host = document.createElement('div'); document.body.append(host)
          const areas = ref([])
          window.placement = { x: 0, y: 0 }
          window.placementApp = createApp({ render: () => h(PdfViewer, {
            versionGuid, expectedHash: hash, editable: true, overlays: areas.value, selectedOverlay: 0,
            onPlace: (page, x, y) => { window.placement = { x, y }; areas.value = [{ page_number: page, x, y, width: 0.25, height: 0.1 }] },
            onMoved: (index, x, y) => { areas.value[index] = { ...areas.value[index], x, y } },
          }) })
          window.placementApp.mount(host)
        }, { versionGuid, hash })
        await rendered(test.page)
        const canvas = test.page.locator('[aria-label="Pembaca PDF"] canvas')
        let box = await canvas.boundingBox()
        if (width < 500) await test.page.touchscreen.tap(box.x + box.width * 0.2, box.y + box.height * 0.3)
        else await canvas.click({ position: { x: box.width * 0.2, y: box.height * 0.3 } })
        const point = await test.page.evaluate(() => window.placement)
        assert(Math.abs(point.x - 0.2) < 0.001 && Math.abs(point.y - 0.3) < 0.001)
        const overlay = test.page.locator('[data-overlay]')
        await overlay.scrollIntoViewIfNeeded()
        box = await canvas.boundingBox()
        const area = await overlay.boundingBox()
        const startX = area.x + area.width / 2, startY = area.y + area.height / 2
        await test.page.mouse.move(startX, startY)
        await test.page.mouse.down()
        await test.page.mouse.move(startX + box.width * 0.1, startY + box.height * 0.1, { steps: 4 })
        await test.page.mouse.up()
        const moved = await geometry(test.page)
        assert(Math.abs(moved.overlay.x - 0.3) < 0.001 && Math.abs(moved.overlay.y - 0.4) < 0.001)
        await test.page.evaluate(() => window.placementApp.unmount())
        assert.deepEqual(test.pageErrors, [])
        reports.push({ width, placementAndDrag: 'passed (emulated tap/click and mouse drag)' })
      } finally { await test.context.close() }
    }
  }
} finally {
  await mkdir('test-results/mobile-pdf', { recursive: true })
  await writeFile(`test-results/mobile-pdf/${baseline ? 'baseline' : 'results'}.json`, JSON.stringify(reports, null, 2))
  console.log(`${reports.length} scenarios recorded in test-results/mobile-pdf/${baseline ? 'baseline' : 'results'}.json`)
  await browser.close()
}
