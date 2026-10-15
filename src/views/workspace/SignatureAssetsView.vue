<script setup lang="ts">
import AssetLibrary from '../../components/signatures/AssetLibrary.vue'
</script>
<template>
  <div class="max-w-4xl">
    <p class="mb-3 text-xs font-semibold tracking-widest text-primary">MILIK ANDA</p>
    <h1 class="text-3xl font-semibold">Tanda Tangan Saya</h1>
    <p class="mt-3 mb-8 text-sm text-muted">
      Simpan coretan atau gambar untuk dipakai saat mendapat giliran tanda tangan. Aset hanya dapat
      diakses oleh akun Anda.
    </p>
    <AssetLibrary />
  </div>
</template>
