<script setup lang="ts">
import DocumentPreview from './DocumentPreview.vue'
defineProps<{ startRoute: string }>()
</script>

<template>
  <section class="lp-shell lp-hero" aria-labelledby="hero-title">
    <div class="lp-hero-copy">
      <p class="lp-eyebrow lp-hero-badge">DOKUMEN HIDUP, PROSES TERTATA</p>
      <h1 id="hero-title">
        Tanda tangan dokumen online.<br /><em>Dari draft sampai sepakat.</em>
      </h1>
      <p class="lp-hero-description">
        Siapkan PDF atau DOCX, atur giliran tanda tangan, dan ikuti setiap langkahnya sampai kesepakatan.
        Semua orang tahu di mana prosesnya berada.
      </p>
      <div class="lp-hero-actions">
        <RouterLink :to="startRoute" class="lp-button"
          >Mulai buat dokumen <span aria-hidden="true">↗</span></RouterLink
        >
        <RouterLink to="/#cara-kerja" class="lp-button lp-button-secondary"
          >Lihat cara kerja <span aria-hidden="true">+</span></RouterLink
        >
      </div>
      <p class="lp-hero-note">Dari dokumen pertama, menuju kesepakatan bersama.</p>
    </div>
    <div class="lp-hero-visual">
      <div class="lp-mockup-frame">
        <DocumentPreview :stage="1" />
        <p class="lp-mockup-caption">
          <span class="material-symbols-outlined" aria-hidden="true">check_circle</span> Setiap
          langkah punya arah.
        </p>
      </div>
    </div>
  </section>
</template>
