<script setup lang="ts">
import { ref } from 'vue'
import DocumentPreview from './DocumentPreview.vue'
const active = ref(0)
const steps = [
  {
    name: 'Siapkan',
    title: 'Mulai dengan dokumen Anda.',
    description:
      'Buat dokumen atau impor PDF dan DOCX. Lengkapi isinya, lalu siapkan tempat untuk tanda tangan yang dibutuhkan.',
    tip: 'PDF atau DOCX? Pilih berkas Anda, lalu periksa kembali hasil impor sebelum melanjutkan.',
  },
  {
    name: 'Kirim',
    title: 'Orang yang tepat. Giliran yang jelas.',
    description:
      'Tambahkan penerima dan atur urutan tanda tangan. Bagikan undangan agar setiap orang dapat meninjau dokumen saat gilirannya.',
    tip: 'Penerima masuk dengan akun yang sesuai undangan untuk melanjutkan proses dokumen.',
  },
  {
    name: 'Tanda',
    title: 'Sampai di satu kesepakatan.',
    description:
      'Penerima menandatangani sesuai urutan. Ikuti progresnya hingga semua selesai dan PDF akhir tersedia untuk diunduh.',
    tip: 'Ada yang perlu diubah? Permintaan revisi menjaga perubahan dalam riwayat versi dokumen.',
  },
]
function moveStep(event: KeyboardEvent) {
  if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  active.value =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? steps.length - 1
        : (active.value + (event.key === 'ArrowRight' ? 1 : -1) + steps.length) % steps.length
  const tabs = event.currentTarget as HTMLElement
  tabs.querySelectorAll<HTMLButtonElement>('[role="tab"]')[active.value]?.focus()
}
</script>

<template>
  <section id="cara-kerja" class="lp-workflow lp-section">
    <div class="lp-shell">
      <div class="lp-section-heading" data-reveal>
        <p class="lp-eyebrow">CARA KERJA</p>
        <h2>Tiga langkah.<br />Satu tujuan bersama.</h2>
        <p>Dari satu dokumen, menjadi satu kesepakatan.</p>
      </div>
      <div class="lp-workflow-grid" data-reveal>
        <div class="lp-workflow-copy">
          <div
            class="lp-steps"
            role="tablist"
            aria-label="Langkah proses dokumen"
            @keydown="moveStep"
          >
            <button
              v-for="(step, index) in steps"
              :id="`workflow-tab-${index}`"
              :key="step.name"
              type="button"
              role="tab"
              :aria-selected="active === index"
              :tabindex="active === index ? 0 : -1"
              :aria-controls="`workflow-panel-${index}`"
              :class="{ 'is-active': active === index }"
              @click="active = index"
            >
              <span class="lp-step-number">{{ index + 1 }}</span
              >{{ step.name }}
            </button>
          </div>
          <Transition name="lp-fade" mode="out-in">
            <div
              :id="`workflow-panel-${active}`"
              :key="active"
              class="lp-step-copy"
              role="tabpanel"
              :aria-labelledby="`workflow-tab-${active}`"
              tabindex="0"
            >
              <p class="lp-eyebrow">LANGKAH 0{{ active + 1 }}</p>
              <h3>{{ steps[active]?.title }}</h3>
              <p>{{ steps[active]?.description }}</p>
              <aside class="lp-step-tip">{{ steps[active]?.tip }}</aside>
            </div>
          </Transition>
        </div>
        <div class="lp-workflow-visual">
          <Transition name="lp-fade" mode="out-in"
            ><DocumentPreview :key="active" :stage="active"
          /></Transition>
        </div>
      </div>
    </div>
  </section>
</template>
