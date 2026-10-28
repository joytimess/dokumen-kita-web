<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import BrandLogo from '../components/brand/BrandLogo.vue'
import HeroSection from '../components/landing/HeroSection.vue'
import DocumentPreview from '../components/landing/DocumentPreview.vue'
import WorkflowDemo from '../components/landing/WorkflowDemo.vue'
import FaqSection from '../components/landing/FaqSection.vue'
import EmailVerificationActions from '../components/auth/EmailVerificationActions.vue'
import { useAuthStore } from '../stores/auth'
import '../styles/landing.css'

const menuOpen = ref(false)
const page = ref<HTMLElement>()
const auth = useAuthStore()
const startRoute = computed(() => (auth.user ? '/dashboard' : '/register'))
const benefits = [
  { icon: 'verified_user', label: 'Penerima sesuai akun' },
  { icon: 'route', label: 'Tanda tangan berurutan' },
  { icon: 'history', label: 'Riwayat setiap versi' },
  { icon: 'description', label: 'Impor PDF & DOCX' },
]
let observer: IntersectionObserver | undefined

onMounted(() => {
  if (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    !('IntersectionObserver' in window)
  )
    return
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.remove('lp-reveal-pending')
        observer?.unobserve(entry.target)
      }
    },
    { threshold: 0.08 },
  )
  page.value?.querySelectorAll('[data-reveal]').forEach((element) => {
    element.classList.add('lp-reveal-pending')
    observer?.observe(element)
  })
})
onUnmounted(() => observer?.disconnect())
</script>

<template>
  <div ref="page" class="landing-page">
    <header class="lp-header">
      <nav class="lp-shell lp-nav" aria-label="Navigasi utama" @keydown.esc="menuOpen = false">
        <div class="lp-brand"><BrandLogo /></div>
        <div
          id="main-navigation"
          class="lp-nav-links"
          :class="{ 'is-open': menuOpen }"
          @click="menuOpen = false"
        >
          <RouterLink to="/#fitur">Fitur</RouterLink>
          <RouterLink to="/#cara-kerja">Cara kerja</RouterLink>
          <RouterLink to="/#pertanyaan-umum">Pertanyaan umum</RouterLink>
          <RouterLink v-if="!auth.user" to="/login" class="lp-mobile-login">Masuk</RouterLink>
        </div>
        <div class="lp-nav-actions">
          <RouterLink v-if="!auth.user" to="/login" class="lp-login">Masuk</RouterLink>
          <RouterLink :to="startRoute" class="lp-button lp-button-small">
            {{ auth.user ? 'Dashboard' : 'Mulai Gratis' }}<span aria-hidden="true">↗</span>
          </RouterLink>
        </div>
        <button
          type="button"
          class="lp-menu-button"
          :aria-expanded="menuOpen"
          aria-controls="main-navigation"
          :aria-label="menuOpen ? 'Tutup navigasi' : 'Buka navigasi'"
          @click="menuOpen = !menuOpen"
        >
          <span class="material-symbols-outlined" aria-hidden="true">{{
            menuOpen ? 'close' : 'menu'
          }}</span>
        </button>
      </nav>
    </header>

    <main id="main">
      <section
        v-if="auth.user && !auth.user.email_verified"
        class="lp-shell lp-verification"
        aria-label="Pengingat verifikasi email"
      >
        <p>Email Anda belum terverifikasi. Verifikasi email untuk melengkapi akun Anda.</p>
        <RouterLink to="/email/verify">Verifikasi email</RouterLink>
        <EmailVerificationActions />
      </section>
      <HeroSection :start-route="startRoute" />
      <div class="lp-trust">
        <ul class="lp-shell lp-trust-grid" aria-label="Alur dokumen yang tertata">
          <li v-for="benefit in benefits" :key="benefit.label">
            <span class="material-symbols-outlined" aria-hidden="true">{{ benefit.icon }}</span
            >{{ benefit.label }}
          </li>
        </ul>
      </div>

      <section id="fitur" class="lp-shell lp-section">
        <div class="lp-section-heading lp-feature-heading" data-reveal>
          <p class="lp-eyebrow">LEBIH RAPI, LEBIH JELAS</p>
          <h2>Ruang untuk dokumen.<br /><em>Arah untuk prosesnya.</em></h2>
          <p>Semua yang Anda butuhkan untuk satu kesepakatan.</p>
        </div>
        <div class="lp-bento">
          <article class="lp-feature-card" data-reveal>
            <div class="lp-card-top">
              <span class="lp-icon-box material-symbols-outlined" aria-hidden="true">note_add</span>
              <div class="lp-format-chips" aria-label="Format impor">
                <span>PDF</span><span>DOCX</span>
              </div>
            </div>
            <h3>Mulai dari dokumen Anda.</h3>
            <p>
              Tulis dari awal atau unggah PDF dan DOCX. Satu ruang untuk menyiapkan isi sebelum
              melangkah lebih jauh.
            </p>
            <div class="lp-file-strip">
              <span class="material-symbols-outlined" aria-hidden="true">description</span
              ><span>Draft · Kontrak · Proposal</span
              ><span class="lp-file-plus" aria-hidden="true">+</span>
            </div>
            <div class="lp-feature-document" aria-hidden="true"><DocumentPreview :stage="0" /></div>
          </article>
          <article class="lp-feature-card" data-reveal>
            <div class="lp-card-top">
              <span class="lp-icon-box material-symbols-outlined" aria-hidden="true"
                >account_tree</span
              >
            </div>
            <h3>Atur alur kesepakatan.</h3>
            <p>
              Tentukan penerima, posisi, dan urutan tanda tangan. Setiap orang tahu kapan
              gilirannya.
            </p>
            <div class="lp-flow" aria-label="Urutan proses">
              <span><i aria-hidden="true">1</i> Siapkan</span><b aria-hidden="true">→</b
              ><span><i aria-hidden="true">2</i> Tinjau</span><b aria-hidden="true">→</b
              ><span><i aria-hidden="true">✓</i> Sepakat</span>
            </div>
          </article>
          <article class="lp-feature-card lp-feature-wide" data-reveal>
            <div>
              <span class="lp-icon-box material-symbols-outlined" aria-hidden="true">timeline</span>
              <h3>Ikuti setiap langkahnya.</h3>
              <p>
                Lihat siapa yang sudah selesai dan siapa yang mendapat giliran. Riwayat versi
                menjaga setiap perubahan tetap tercatat.
              </p>
            </div>
            <div class="lp-activity-preview" aria-label="Contoh riwayat dokumen">
              <div class="lp-activity-heading">
                <span>RIWAYAT DOKUMEN</span><span>Versi 02</span>
              </div>
              <p>
                <span><i class="lp-dot" aria-hidden="true"></i> Versi diperbarui</span
                ><small>10.24 WIB</small>
              </p>
              <p>
                <span><i class="lp-dot lp-dot-muted" aria-hidden="true"></i> Draft disimpan</span
                ><small>09.12 WIB</small>
              </p>
              <span class="lp-example-label">Ilustrasi aktivitas</span>
            </div>
          </article>
        </div>
      </section>

      <WorkflowDemo />
      <FaqSection />
      <section class="lp-cta-section lp-shell">
        <div class="lp-cta" data-reveal>
          <div>
            <p class="lp-eyebrow">MULAI DARI SATU DOKUMEN</p>
            <h2>Langkah pertama menuju <em>sepakat.</em></h2>
            <p>Satu tempat untuk dokumen Anda, dan semua yang terlibat.</p>
          </div>
          <RouterLink :to="startRoute" class="lp-button"
            >Mulai sekarang <span aria-hidden="true">↗</span></RouterLink
          >
        </div>
      </section>
    </main>
    <footer class="lp-footer">
      <div class="lp-shell lp-footer-inner">
        <div class="lp-brand"><BrandLogo /></div>
        <p>Dokumen rapi. Proses terarah.</p>
        <small>© {{ new Date().getFullYear() }} Dokumen Kita.</small>
      </div>
    </footer>
  </div>
</template>
