<script setup lang="ts">
import BrandLogo from '../components/brand/BrandLogo.vue'
import AuthShowcase from '../components/auth/AuthShowcase.vue'
import type { AuthKind } from '../types/auth'
import '../styles/auth.css'
defineProps<{ compact?: boolean; kind?: AuthKind }>()
</script>
<template>
  <div v-if="kind" class="auth-redesign" :class="`auth-${kind}`">
    <AuthShowcase :kind="kind" />
    <section class="auth-form-panel">
      <div class="auth-mobile-brand"><BrandLogo /></div>
      <RouterLink to="/" class="auth-back-link"
        ><span aria-hidden="true">←</span> Kembali ke beranda</RouterLink
      >
      <main id="main" class="auth-form-content" tabindex="-1"><slot /></main>
      <p class="auth-form-footer">Dokumen rapi. Proses terarah.</p>
    </section>
  </div>
  <div v-else class="min-h-dvh sm:grid sm:grid-cols-[46%_54%]">
    <aside
      :class="
        compact
          ? 'sm:py-5! sm:[&>div]:py-6! sm:[&_h2]:mb-5! sm:[&_h2]:text-[clamp(36px,4vw,56px)]!'
          : undefined
      "
      class="relative hidden flex-col justify-between bg-sage px-[9%] py-[38px] sm:flex lg:px-[10%] lg:py-12 [&>small]:text-[10px] [&>small]:text-muted"
    >
      <BrandLogo />
      <div
        class="py-20 [&_h2]:mb-7 [&_h2]:text-[clamp(39px,4.3vw,62px)] [&_h2]:leading-[1.08] [&>p:not(:first-child)]:text-muted [&>p]:text-sm [&>p]:leading-[1.9] [&>p:first-child]:text-[10px]"
      >
        <p class="mb-6 text-[11px] font-bold tracking-[0.16em] text-primary">
          SATU TEMPAT, SATU KESEPAKATAN.
        </p>
        <h2>Dari draft<br />sampai <em>sepakat.</em></h2>
        <p>
          Dokumen yang rapi. Proses yang terarah.<br />Setiap langkah menuju kesepakatan, lebih
          jelas.
        </p>
        <div
          class="mt-[54px] flex items-center justify-between gap-[7px] lg:gap-3 [&_div]:grid [&_div]:justify-items-center [&_div]:gap-3 [&_div]:text-[11px] [&_span]:grid [&_span]:h-[58px] [&_span]:w-[42px] lg:[&_span]:w-[52px] [&_span]:place-items-center [&_span]:rounded-lg [&_span]:border [&_span]:border-[#d4dfca] [&_span]:bg-white/65 [&_span]:text-lg [&_i]:-mt-[27px] [&_i]:text-[#8ea588] [&_i]:not-italic"
          aria-label="Alur produk: Siapkan, Tinjau, Sepakat"
        >
          <div><span>01</span>Siapkan</div>
          <i aria-hidden="true">→</i>
          <div><span>02</span>Tinjau</div>
          <i aria-hidden="true">→</i>
          <div><span>✓</span>Sepakat</div>
        </div>
        <p class="mt-[45px] font-serif text-[17px]! text-[#788d70]! italic">
          Untuk dokumen yang berarti,<br />dan orang-orang di baliknya.
        </p>
      </div>
      <small>© {{ new Date().getFullYear() }} Dokumen Kita.</small>
    </aside>
    <section
      :class="compact ? 'sm:py-3!' : undefined"
      class="flex min-h-dvh min-w-0 flex-col px-6 py-[27px] max-[360px]:px-[18px] sm:px-[7%] sm:py-[30px] md:px-[9%] md:py-8 lg:px-[12%] lg:py-11"
    >
      <div class="mb-[18px] block sm:hidden"><BrandLogo /></div>
      <RouterLink
        to="/"
        class="inline-flex min-h-11 items-center self-start text-xs text-primary hover:underline"
        >← Kembali ke beranda</RouterLink
      >
      <main
        id="main"
        :class="
          compact
            ? 'sm:py-2! sm:[&_h1]:mb-2! sm:[&_h1]:text-[28px]! sm:[&>p:first-child]:mb-2!'
            : undefined
        "
        class="m-auto w-full max-w-[390px] py-[30px] sm:py-[46px] [&_h1]:mb-3.5 [&_h1]:text-[30px] sm:[&_h1]:text-[28px] lg:[&_h1]:text-[32px] [&_h1]:leading-[1.2] [&>p:first-child]:mb-[18px] [&>p:first-child]:text-[9px]"
        tabindex="-1"
      >
        <slot />
      </main>
      <p class="pt-[15px] text-center text-[10px] text-muted sm:pt-0">
        Dokumen rapi. Proses terarah.
      </p>
    </section>
  </div>
</template>
