import { ref, shallowRef } from 'vue'
import type { SignaturePayload } from '../types/documents'
export function createSignatureAction(
  submit: (payload: SignaturePayload) => Promise<unknown>,
  key: () => string = () => crypto.randomUUID(),
) {
  const pending = shallowRef<Readonly<SignaturePayload>>()
  const busy = ref(false),
    completed = ref(false),
    blocked = ref(false)
  let active = true
  async function sign(asset: string, hash: string) {
    if (!active || busy.value || completed.value || blocked.value) return
    if (!pending.value)
      pending.value = Object.freeze({
        asset_guid: asset,
        version_content_hash: hash,
        confirmed: true,
        idempotency_key: key(),
      })
    if (pending.value.asset_guid !== asset || pending.value.version_content_hash !== hash)
      throw new Error('PAYLOAD_CHANGED')
    busy.value = true
    try {
      const result = await submit({ ...pending.value })
      if (active) completed.value = true
      return result
    } finally {
      if (active) busy.value = false
    }
  }
  return {
    pending,
    busy,
    completed,
    blocked,
    sign,
    dispose() {
      active = false
      pending.value = undefined
      blocked.value = true
    },
  }
}
