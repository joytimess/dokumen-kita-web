<script setup lang="ts">
import DocumentPreview from './DocumentPreview.vue'
</script>
<template>
  <section
    class="grid items-center gap-9 py-11 sm:grid-cols-2 sm:gap-7 sm:py-15 lg:gap-[72px] lg:pt-[84px] lg:pb-[66px] mx-auto w-[calc(100%-36px)] max-w-[1200px] sm:w-[calc(100%-48px)] lg:w-[calc(100%-80px)]"
  >
    <div
      class="min-w-0 [&_h1]:mb-[26px] [&_h1]:text-[clamp(38px,9vw,52px)] [&_h1]:leading-[1.07] sm:[&_h1]:text-[45px] lg:[&_h1]:text-[clamp(36px,4.5vw,64px)] [&_em]:text-primary"
    >
      <p class="mb-6 text-[11px] font-bold tracking-[0.16em] text-primary">
        DOKUMEN RAPI. PROSES TERARAH.
      </p>
      <h1>Dari draft sampai<br /><em>sepakat.</em><br />Dalam satu tempat.</h1>
      <p class="max-w-[425px] text-[15px] leading-[1.8] text-muted sm:text-sm lg:text-base">
        Siapkan dokumen, atur giliran tanda tangan, dan ikuti setiap langkahnya. Lebih jelas bagi
        Anda dan semua yang terlibat.
      </p>
      <div class="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2.5 lg:gap-[26px]">
        <RouterLink
          class="inline-flex min-h-12 items-center justify-center gap-5 rounded-[7px] border border-primary bg-primary px-6 py-3 text-center text-sm font-semibold leading-normal text-white! hover:bg-[#174c39] hover:no-underline! disabled:cursor-wait disabled:opacity-65"
          to="/register"
          >Mulai buat dokumen <span aria-hidden="true">↗</span></RouterLink
        ><RouterLink
          class="inline-flex min-h-11 items-center gap-4 text-sm font-semibold text-primary hover:underline"
          to="/#cara-kerja"
          >Lihat cara kerja <span aria-hidden="true">↓</span></RouterLink
        >
      </div>
      <p class="mt-5 text-[10px] text-muted sm:text-[11px]">
        Dari dokumen pertama, menuju kesepakatan bersama.
      </p>
    </div>
    <div class="relative rounded-[18px] bg-sage p-6 max-[360px]:p-3 sm:p-3.5 lg:p-8">
      <DocumentPreview :stage="1" />
      <div class="flex items-center justify-center gap-2.5 pt-4 text-xs [&_span]:text-primary">
        <span aria-hidden="true">✓</span> Setiap langkah punya arah.
      </div>
    </div>
  </section>
</template>
