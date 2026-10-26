function safePdfFilename(value: string): string | undefined {
  const name = value.trim()
  if (!name || name.startsWith('.') || !/\.pdf$/i.test(name) ||
    /[/\\<>:"|?*\p{Cc}\p{Cf}]/u.test(name) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ||
    new TextEncoder().encode(name).length > 255) return
  return name
}

export function pdfDownloadFilename(contentDisposition: string): string {
  if (/[\r\n]/.test(contentDisposition)) return 'dokumen.pdf'
  let filename: string | undefined
  let extendedFilename: string | undefined
  const parameters = /(?:^|;)\s*(filename\*?)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^";\s][^";]*))\s*(?=;|$)/gi
  for (const match of contentDisposition.matchAll(parameters)) {
    const quoted = match[2]
    const value = quoted === undefined ? (match[3] ?? '').trim() : quoted.replace(/\\(.)/g, '$1')
    if (match[1]?.toLowerCase() === 'filename*') {
      // Only UTF-8 extended values are part of the download contract.
      const encoded = /^UTF-8'[a-z\d-]*'([\w!#$&+.^`|~%*-]+)$/i.exec(value)
      if (quoted !== undefined || !encoded?.[1]) continue
      try {
        extendedFilename ??= safePdfFilename(decodeURIComponent(encoded[1]))
      } catch {
        // A malformed extended value may still have a valid ASCII fallback.
      }
    } else {
      filename ??= safePdfFilename(value)
    }
  }
  return extendedFilename ?? filename ?? 'dokumen.pdf'
}
