<script setup lang="ts">
import BrandLogo from '../components/brand/BrandLogo.vue'
</script>
<template>
  <div
    class="mx-auto w-[calc(100%-36px)] max-w-[1200px] sm:w-[calc(100%-48px)] lg:w-[calc(100%-80px)]"
  >
    <header class="py-[30px]"><BrandLogo /></header>
    <main
      id="main"
      class="py-[70px] text-center sm:py-25 [&_h1]:mb-6 [&_h1]:text-[clamp(36px,4.5vw,64px)] [&_h1]:leading-[1.15] [&_p]:mb-[30px] [&_p:last-of-type]:text-muted"
    >
      <p class="mb-6 text-[11px] font-bold tracking-[0.16em] text-primary">
        404 · HALAMAN TIDAK DITEMUKAN
      </p>
      <h1>Sepertinya Anda<br />kehilangan arah.</h1>
      <p>Halaman ini belum tersedia atau alamatnya tidak tepat.</p>
      <RouterLink
        class="inline-flex min-h-12 items-center justify-center gap-5 rounded-[7px] border border-primary bg-primary px-6 py-3 text-center text-sm font-semibold leading-normal text-white! hover:bg-[#174c39] hover:no-underline! disabled:cursor-wait disabled:opacity-65"
        to="/"
        >Kembali ke beranda</RouterLink
      >
    </main>
  </div>
</template>
