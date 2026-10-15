<script setup lang="ts">
import { ref } from 'vue'
import BrandLogo from '../components/brand/BrandLogo.vue'
import HeroSection from '../components/landing/HeroSection.vue'
import WorkflowDemo from '../components/landing/WorkflowDemo.vue'
import FaqSection from '../components/landing/FaqSection.vue'
import { useAuthStore } from '../stores/auth'
import EmailVerificationActions from '../components/auth/EmailVerificationActions.vue'
const menuOpen = ref(false)
const auth = useAuthStore()
const features = [
  {
    icon: '▤',
    title: 'Mulai dari dokumen Anda.',
    text: 'Buat dari awal atau impor PDF dan DOCX. Satu tempat untuk menyiapkan isi sebelum melangkah lebih jauh.',
  },
  {
    icon: '⇄',
    title: 'Atur alur kesepakatan.',
    text: 'Tentukan penerima, posisi, dan urutan tanda tangan. Setiap orang tahu kapan gilirannya.',
  },
  {
    icon: '✓',
    title: 'Ikuti setiap langkahnya.',
    text: 'Gambaran status dan riwayat versi membantu proses tetap jelas, dari draft hingga tujuan PDF final.',
  },
]
</script>
<template>
  <header class="sticky top-0 z-20 border-b border-[#edf0ea] bg-white/95">
    <nav
      class="mx-auto w-[calc(100%-36px)] max-w-[1200px] sm:w-[calc(100%-48px)] lg:w-[calc(100%-80px)] flex min-h-20 flex-wrap items-center justify-between gap-3 py-4 md:min-h-[88px] md:flex-nowrap md:gap-7 md:py-0"
      aria-label="Navigasi utama"
    >
      <BrandLogo /><button
        class="ml-auto block min-h-11 rounded-[7px] border border-line bg-white px-3.5 py-2 text-primary md:hidden"
        type="button"
        :aria-expanded="menuOpen"
        aria-controls="main-navigation"
        @click="menuOpen = !menuOpen"
      >
        {{ menuOpen ? 'Tutup' : 'Menu' }}
      </button>
      <div
        id="main-navigation"
        class="order-3 w-full flex-wrap items-center gap-x-6 gap-y-3 py-2 text-[13px] text-muted [&_a]:py-2 md:order-none md:flex md:w-auto md:gap-7 md:py-0"
        :class="menuOpen ? 'flex' : 'hidden'"
        @click="menuOpen = false"
      >
        <RouterLink to="/#fitur">Fitur</RouterLink
        ><RouterLink to="/#cara-kerja">Cara kerja</RouterLink
        ><RouterLink to="/#pertanyaan-umum">Pertanyaan umum</RouterLink>
      </div>
      <div
        class="order-4 flex w-full items-center justify-between gap-4 pt-1 text-[13px] [&_a:first-child]:flex [&_a:first-child]:min-h-11 [&_a:first-child]:items-center sm:order-none sm:w-auto sm:justify-start sm:pt-0 md:gap-[22px]"
      >
        <RouterLink
          v-if="auth.user"
          class="inline-flex min-h-11 items-center justify-center rounded-[7px] border border-primary bg-primary px-[18px] py-2.5 text-center text-sm font-semibold text-white! hover:bg-[#174c39] hover:no-underline!"
          to="/dashboard"
          >Dashboard</RouterLink
        ><RouterLink v-if="!auth.user" to="/login">Masuk</RouterLink
        ><RouterLink
          v-if="!auth.user"
          class="inline-flex min-h-12 items-center justify-center gap-5 rounded-[7px] border border-primary bg-primary px-6 py-3 text-center text-sm font-semibold leading-normal text-white! hover:bg-[#174c39] hover:no-underline! disabled:cursor-wait disabled:opacity-65 min-h-11! px-[18px]! py-2.5!"
          to="/register"
          >Mulai sekarang <span aria-hidden="true">↗</span></RouterLink
        >
      </div>
    </nav>
  </header>
  <main id="main">
    <div
      v-if="auth.user"
      class="py-4 text-xs mx-auto w-[calc(100%-36px)] max-w-[1200px] sm:w-[calc(100%-48px)] lg:w-[calc(100%-80px)]"
      role="status"
    >
      Sesi aktif sebagai {{ auth.user.name }}.
      {{ auth.user.email_verified ? '' : 'Email Anda belum terverifikasi.' }}
    </div>
    <section
      v-if="auth.user && !auth.user.email_verified"
      aria-label="Pengingat verifikasi email"
      class="mx-auto my-4 w-[calc(100%-36px)] max-w-[1200px] rounded-lg border border-line bg-sage p-5 text-sm"
    >
      <p>Email kamu belum terverifikasi. Verifikasi email untuk melengkapi akunmu.</p>
      <RouterLink
        to="/email/verify"
        class="inline-flex min-h-11 items-center font-semibold text-primary underline"
        >Verifikasi email</RouterLink
      >
      <EmailVerificationActions />
    </section>
    <HeroSection />
    <div
      class="grid grid-cols-2 gap-x-2 gap-y-[18px] border-y border-line py-5 text-[10px] md:grid-cols-4 md:gap-5 md:py-[25px] md:text-xs [&_span]:flex [&_span]:items-center [&_span]:gap-1.5 md:[&_span]:justify-center md:[&_span]:gap-2.5 [&_i]:text-primary [&_i]:not-italic mx-auto w-[calc(100%-36px)] max-w-[1200px] sm:w-[calc(100%-48px)] lg:w-[calc(100%-80px)]"
    >
      <span
        v-for="benefit in [
          'Penerima sesuai akun',
          'Tanda tangan berurutan',
          'Riwayat setiap versi',
          'Tujuan PDF final',
        ]"
        :key="benefit"
        ><i aria-hidden="true">✓</i>{{ benefit }}</span
      >
    </div>
    <section
      id="fitur"
      class="py-16 sm:py-25 mx-auto w-[calc(100%-36px)] max-w-[1200px] sm:w-[calc(100%-48px)] lg:w-[calc(100%-80px)]"
    >
      <div
        class="mb-9 text-center sm:mb-[50px] [&_h2]:mb-5 [&_h2]:text-[clamp(30px,3.3vw,44px)] [&_h2]:leading-[1.15] [&_p:last-child]:text-muted [&_p:last-child]:text-[13px] sm:[&_p:last-child]:text-[15px]"
      >
        <p class="mb-6 text-[11px] font-bold tracking-[0.16em] text-primary">
          LEBIH RAPI, LEBIH JELAS
        </p>
        <h2>Ruang untuk dokumen.<br />Arah untuk prosesnya.</h2>
        <p>Gambaran fitur yang dirancang untuk setiap kesepakatan.</p>
      </div>
      <div
        class="grid gap-[34px] sm:grid-cols-3 sm:gap-[18px] lg:gap-[42px] [&_article]:px-2 sm:[&_article]:p-0 lg:[&_article]:px-3.5 lg:[&_article]:py-2.5 [&_h3]:mb-4 [&_h3]:text-[21px] [&_h3]:leading-[1.15] sm:[&_h3]:text-[19px] lg:[&_h3]:text-[21px] [&_p]:text-sm [&_p]:leading-[1.9] [&_p]:text-muted"
      >
        <article v-for="feature in features" :key="feature.title">
          <span
            class="mb-[17px] grid size-12 place-items-center rounded-[10px] bg-sage text-[23px] sm:mb-[25px]"
            aria-hidden="true"
            >{{ feature.icon }}</span
          >
          <h3>{{ feature.title }}</h3>
          <p>{{ feature.text }}</p>
        </article>
      </div>
    </section>
    <WorkflowDemo /><FaqSection />
    <section
      class="rounded-[14px] bg-sage px-6 py-[30px] sm:flex sm:items-center sm:justify-between sm:gap-10 sm:p-[35px] lg:px-14 lg:py-12 [&_h2]:mb-[18px] [&_h2]:text-[30px] [&_h2]:leading-[1.15] sm:[&_h2]:text-[32px] lg:[&_h2]:text-[38px] [&_p:last-child]:text-sm [&_p:last-child]:text-muted [&>a]:mt-[25px] sm:[&>a]:mt-0 [&>a]:shrink-0 mx-auto w-[calc(100%-36px)] max-w-[1200px] sm:w-[calc(100%-48px)] lg:w-[calc(100%-80px)]"
    >
      <div>
        <p class="mb-6 text-[11px] font-bold tracking-[0.16em] text-primary">
          MULAI DARI SATU DOKUMEN
        </p>
        <h2>Langkah pertama menuju<br /><em>sepakat.</em></h2>
        <p>Siapkan akun Anda untuk proses dokumen yang lebih terarah.</p>
      </div>
      <RouterLink
        to="/register"
        class="inline-flex min-h-12 items-center justify-center gap-5 rounded-[7px] border border-primary bg-primary px-6 py-3 text-center text-sm font-semibold leading-normal text-white! hover:bg-[#174c39] hover:no-underline! disabled:cursor-wait disabled:opacity-65"
        >Mulai sekarang <span aria-hidden="true">↗</span></RouterLink
      >
    </section>
  </main>
  <footer
    class="flex flex-wrap items-center justify-between gap-6 py-[35px] sm:py-11 [&_p]:hidden md:[&_p]:block [&_p]:text-[11px] [&_p]:text-muted [&_small]:text-[10px] sm:[&_small]:text-[11px] [&_small]:text-muted [&_a]:text-[19px] mx-auto w-[calc(100%-36px)] max-w-[1200px] sm:w-[calc(100%-48px)] lg:w-[calc(100%-80px)]"
  >
    <BrandLogo />
    <p>Dokumen rapi. Proses terarah.</p>
    <small>© {{ new Date().getFullYear() }} Dokumen Kita.</small>
  </footer>
</template>
