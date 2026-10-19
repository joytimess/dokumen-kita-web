<script setup lang="ts">
import AssetLibrary from '../../components/signatures/AssetLibrary.vue'
import { t } from '../../services/workspace-language'
</script>
<template>
  <div class="max-w-6xl">
    <header class="mb-6">
      <p class="mb-3 text-xs font-semibold tracking-widest text-primary">{{ t('Milik Anda') }}</p>
      <h1 class="text-3xl font-semibold">{{ t('Tanda Tangan Saya') }}</h1>
      <p class="mt-3 max-w-2xl text-sm text-muted">
        {{
          t(
            'Simpan coretan atau gambar untuk dipakai saat mendapat giliran tanda tangan. Aset hanya dapat diakses oleh akun Anda.',
          )
        }}
      </p>
    </header>
    <AssetLibrary standalone />
  </div>
</template>
