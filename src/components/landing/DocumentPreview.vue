<script setup lang="ts">
withDefaults(defineProps<{ stage?: number }>(), { stage: 0 })
const names = ['Andi Pratama', 'Nadia Putri', 'Bima Saputra']
</script>

<template>
  <div class="lp-document-preview">
    <div class="lp-preview-toolbar">
      <span><span class="lp-tiny-dot" aria-hidden="true"></span> RUANG DOKUMEN ANDA</span
      ><span class="lp-preview-state">{{
        ['Draft disimpan', 'Dalam proses', 'Selesai'][stage]
      }}</span>
    </div>
    <div class="lp-preview-title">
      <span class="lp-preview-file material-symbols-outlined" aria-hidden="true">description</span>
      <div><strong>Perjanjian kerja sama</strong><small>Dokumen contoh · Versi 02</small></div>
      <span class="material-symbols-outlined lp-preview-more" aria-hidden="true">more_horiz</span>
    </div>
    <div class="lp-paper">
      <span class="lp-paper-kicker">PERJANJIAN KERJA SAMA</span>
      <p class="lp-paper-heading">Langkah baik dimulai dari kesepakatan.</p>
      <p>
        Dokumen ini menjadi langkah awal untuk bekerja bersama, dengan tujuan dan tanggung jawab
        yang jelas.
      </p>
      <div class="lp-paper-lines" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="lp-paper-signature" :class="{ 'is-signed': stage > 0 }">
        <span>{{ stage ? 'Ditandatangani oleh' : 'Posisi tanda tangan' }}</span>
        <em v-if="stage > 0">Andi Pratama</em>
        <span v-else class="lp-signature-placeholder">+ Tambahkan tanda tangan</span>
        <small>{{ stage ? 'Contoh tanda tangan visual' : 'Siapkan sebelum dikirim' }}</small>
        <span class="lp-signature-seal material-symbols-outlined" aria-hidden="true">{{
          stage ? 'verified' : 'draw'
        }}</span>
      </div>
    </div>
    <div class="lp-recipients-heading">
      <strong>Penerima</strong><span>Berurutan <span aria-hidden="true">→</span></span>
    </div>
    <div
      v-for="(name, index) in names"
      :key="name"
      class="lp-recipient"
      :class="{ 'is-complete': stage === 2 || (stage === 1 && index === 0) }"
    >
      <span class="lp-avatar" aria-hidden="true">{{ ['AP', 'NP', 'BS'][index] }}</span>
      <div>
        <strong>{{ name }}</strong
        ><small>{{ ['Pemilik dokumen', 'Penerima kedua', 'Penerima ketiga'][index] }}</small>
      </div>
      <span class="lp-recipient-status">{{
        stage === 2 || (stage === 1 && index === 0)
          ? '✓ Selesai'
          : stage === 1 && index === 1
            ? 'Giliran berikutnya'
            : stage === 0
              ? 'Draft'
              : 'Menunggu'
      }}</span>
    </div>
    <p class="lp-preview-disclaimer">Ilustrasi produk. Nama dan progres adalah contoh.</p>
  </div>
</template>
