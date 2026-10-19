<script setup lang="ts">
import BrandLogo from '../brand/BrandLogo.vue'
import AnimatedBubbles from './AnimatedBubbles.vue'
import type { AuthKind } from '../../types/auth'
defineProps<{ kind: AuthKind }>()
const steps = [
  { number: '01', title: 'Unggah Draft', detail: 'DOCX & PDF' },
  { number: '02', title: 'Atur Alur', detail: 'Giliran yang jelas' },
  { number: '✓', title: 'Sepakat', detail: 'Unduh PDF akhir' },
]
</script>

<template>
  <aside class="auth-showcase">
    <AnimatedBubbles />
    <div class="auth-showcase-content">
      <div class="auth-showcase-brand"><BrandLogo /></div>
      <div class="auth-showcase-body">
        <p class="auth-showcase-eyebrow">
          {{ kind === 'login' ? 'KEMBALI KE RUANG KERJA ANDA.' : 'MEMULAI LANGKAH BARU.' }}
        </p>
        <h2 v-if="kind === 'login'">Satu klik untuk<br /><em>melanjutkan</em> progres.</h2>
        <h2 v-else>Dari draft pertama<br />hingga <em>sepakat.</em></h2>
        <p class="auth-showcase-description">
          {{
            kind === 'login'
              ? 'Pantau dokumen yang menunggu tanda tangan Anda, tinjau revisi, dan jaga ritme kesepakatan tetap berjalan lancar.'
              : 'Siapkan draft, kelola urutan tanda tangan, dan ikuti setiap langkah menuju kesepakatan dalam satu tempat.'
          }}
        </p>

        <div
          v-if="kind === 'login'"
          class="auth-activity-cards"
          aria-label="Ilustrasi aktivitas dokumen"
        >
          <article class="auth-info-card">
            <span
              class="auth-info-icon auth-info-warning material-symbols-outlined"
              aria-hidden="true"
              >edit_document</span
            >
            <div>
              <p>PERLU TINDAKAN</p>
              <strong>1 Dokumen Menunggu Tanda Tangan</strong>
            </div>
            <span class="auth-info-badge auth-badge-warning"
              ><i aria-hidden="true"></i>Hari ini</span
            >
          </article>
          <article class="auth-info-card">
            <span
              class="auth-info-icon auth-info-success material-symbols-outlined"
              aria-hidden="true"
              >task_alt</span
            >
            <div>
              <p>AKTIVITAS TERKINI</p>
              <strong>Kontrak Kerjasama Vendor telah disetujui</strong>
            </div>
            <span class="auth-info-badge">12m lalu</span>
          </article>
          <p class="auth-illustration-note">Ilustrasi aktivitas, bukan data akun Anda.</p>
        </div>
        <ol v-else class="auth-step-cards" aria-label="Alur dokumen">
          <li
            v-for="(step, index) in steps"
            :key="step.title"
            :class="{ 'is-highlighted': index === 2 }"
          >
            <span class="auth-step-marker" aria-hidden="true">{{ step.number }}</span
            ><strong>{{ step.title }}</strong
            ><small>{{ step.detail }}</small>
          </li>
        </ol>

        <div class="auth-benefit-badges">
          <span v-if="kind === 'login'" class="auth-benefit-badge"
            ><span class="material-symbols-outlined" aria-hidden="true">route</span>Tanda tangan
            berurutan. Progres tercatat.</span
          >
          <template v-else>
            <span class="auth-benefit-badge"
              ><span class="material-symbols-outlined" aria-hidden="true">route</span>Tanda tangan
              berurutan</span
            >
            <span class="auth-benefit-badge"
              ><span class="material-symbols-outlined" aria-hidden="true">history</span>Riwayat
              versi</span
            >
            <span class="auth-benefit-badge"
              ><span class="material-symbols-outlined" aria-hidden="true">description</span>PDF
              akhir</span
            >
          </template>
        </div>
        <blockquote class="auth-quote">
          <p>
            {{
              kind === 'login'
                ? '“Kecepatan eksekusi dokumen menentukan langkah bisnis Anda berikutnya.”'
                : '“Untuk dokumen yang berarti, dan kolaborasi yang terarah.”'
            }}
          </p>
          <footer v-if="kind === 'register'">DOKUMEN RAPI. PROSES TERARAH.</footer>
        </blockquote>
      </div>
      <small class="auth-showcase-footer"
        >© {{ new Date().getFullYear() }} Dokumen Kita. Hak Cipta Dilindungi.</small
      >
    </div>
  </aside>
</template>
