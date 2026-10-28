<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import DocumentPreview from './DocumentPreview.vue'

const section = ref<HTMLElement>()
const active = ref(0)
const progress = ref(0)
const steps = [
  { name: 'Siapkan', title: 'Mulai dengan dokumen Anda.', description: 'Buat dokumen atau impor PDF dan DOCX. Lengkapi isinya, lalu siapkan tempat untuk tanda tangan yang dibutuhkan.', tip: 'PDF atau DOCX? Pilih berkas Anda, lalu periksa kembali hasil impor sebelum melanjutkan.' },
  { name: 'Kirim', title: 'Orang yang tepat. Giliran yang jelas.', description: 'Tambahkan penerima dan atur urutan tanda tangan. Bagikan undangan agar setiap orang dapat meninjau dokumen saat gilirannya.', tip: 'Penerima masuk dengan akun yang sesuai undangan untuk melanjutkan proses dokumen.' },
  { name: 'Tanda', title: 'Sampai di satu kesepakatan.', description: 'Penerima menandatangani sesuai urutan. Ikuti progresnya hingga semua selesai dan PDF akhir tersedia untuk diunduh.', tip: 'Ada yang perlu diubah? Permintaan revisi menjaga perubahan dalam riwayat versi dokumen.' },
]
let frame = 0
function updateProgress() {
  frame = 0
  if (!section.value || window.matchMedia('(max-width: 690px), (prefers-reduced-motion: reduce)').matches) return
  const rect = section.value.getBoundingClientRect()
  const distance = section.value.offsetHeight - window.innerHeight
  if (distance <= 0) return
  progress.value = Math.max(0, Math.min(1, -rect.top / distance))
  active.value = Math.min(steps.length - 1, Math.floor(progress.value * steps.length))
}
function scheduleProgress() {
  if (!frame) frame = requestAnimationFrame(updateProgress)
}
function goToStep(index: number) {
  if (!section.value) return
  const top = window.scrollY + section.value.getBoundingClientRect().top
  const distance = section.value.offsetHeight - window.innerHeight
  window.scrollTo({ top: top + distance * ((index + 0.5) / steps.length), behavior: 'smooth' })
}
onMounted(() => {
  window.addEventListener('scroll', scheduleProgress, { passive: true })
  window.addEventListener('resize', scheduleProgress)
  updateProgress()
})
onUnmounted(() => {
  window.removeEventListener('scroll', scheduleProgress)
  window.removeEventListener('resize', scheduleProgress)
  if (frame) cancelAnimationFrame(frame)
})
</script>

<template>
  <section id="cara-kerja" ref="section" class="lp-workflow" aria-labelledby="workflow-title">
    <div class="lp-workflow-sticky">
      <div class="lp-shell lp-workflow-layout">
        <div class="lp-workflow-copy">
          <div class="lp-section-heading">
            <p class="lp-eyebrow">CARA KERJA</p>
            <h2 id="workflow-title">Tiga langkah.<br /><em>Satu tujuan bersama.</em></h2>
            <p>Dari satu dokumen, menjadi satu kesepakatan.</p>
          </div>
          <div class="lp-journey-nav" aria-label="Langkah proses dokumen">
            <span class="lp-journey-progress" :style="{ transform: `scaleY(${progress})` }" aria-hidden="true"></span>
            <button v-for="(step, index) in steps" :key="step.name" type="button" :class="{ 'is-active': active === index }" :aria-current="active === index ? 'step' : undefined" @click="goToStep(index)">
              <span class="lp-journey-number">{{ index + 1 }}</span><span>{{ step.name }}<small>{{ step.title }}</small></span>
            </button>
          </div>
          <p class="lp-journey-count">{{ active + 1 }} / {{ steps.length }} — IKUTI ALURNYA</p>
        </div>
        <div class="lp-journey-view">
          <div class="lp-journey-panel">
            <div class="lp-journey-toolbar"><span>ALUR DOKUMEN KITA</span><span>{{ steps[active]?.name }}</span></div>
            <div class="lp-journey-content">
              <Transition name="lp-fade" mode="out-in">
                <div :key="active" class="lp-journey-scene">
                  <div class="lp-step-copy"><p class="lp-eyebrow">LANGKAH {{ active + 1 }}</p><h3>{{ steps[active]?.title }}</h3><p>{{ steps[active]?.description }}</p><aside class="lp-step-tip">{{ steps[active]?.tip }}</aside></div>
                  <DocumentPreview :stage="active" />
                </div>
              </Transition>
            </div>
            <div class="lp-journey-bottom">PROSES TERPANTAU, DI SETIAP TAHAP <span>{{ active + 1 }} / {{ steps.length }}</span></div>
          </div>
        </div>
        <div class="lp-mobile-steps">
          <article v-for="(step, index) in steps" :key="step.name" class="lp-mobile-step">
            <div class="lp-mobile-step-label"><span class="lp-journey-number">{{ index + 1 }}</span>{{ step.name }}</div>
            <h3>{{ step.title }}</h3><p>{{ step.description }}</p><p class="lp-mobile-tip">{{ step.tip }}</p>
            <DocumentPreview :stage="index" />
          </article>
        </div>
      </div>
    </div>
  </section>
</template>
