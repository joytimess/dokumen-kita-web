<script setup lang="ts">
import { ref } from 'vue'
import DocumentPreview from './DocumentPreview.vue'
const active = ref(0)
const steps = [
  {
    name: 'Siapkan',
    title: 'Mulai dengan dokumen Anda.',
    description:
      'Buat dokumen atau impor PDF dan DOCX. Siapkan isinya sebelum dibagikan kepada penerima.',
    tag: 'PDF & DOCX',
  },
  {
    name: 'Kirim',
    title: 'Orang yang tepat, urutan yang jelas.',
    description:
      'Tentukan penerima, posisi tanda tangan, dan giliran masing-masing. Penerima menggunakan akun untuk mengikuti proses.',
    tag: 'Tanda tangan berurutan',
  },
  {
    name: 'Pantau',
    title: 'Ketahui langkah berikutnya.',
    description:
      'Konsep tampilan status membantu Anda melihat siapa yang sudah selesai dan siapa yang mendapat giliran berikutnya.',
    tag: 'Status setiap penerima',
  },
]
</script>
<template>
  <section id="cara-kerja" class="bg-soft py-15 sm:py-[88px]">
    <div
      class="mx-auto w-[calc(100%-36px)] max-w-[1200px] sm:w-[calc(100%-48px)] lg:w-[calc(100%-80px)]"
    >
      <div
        class="mb-9 text-center sm:mb-[50px] [&_h2]:mb-5 [&_h2]:text-[clamp(30px,3.3vw,44px)] [&_h2]:leading-[1.15] [&_p:last-child]:text-muted [&_p:last-child]:text-[13px] sm:[&_p:last-child]:text-[15px]"
      >
        <p class="mb-6 text-[11px] font-bold tracking-[0.16em] text-primary">CARA KERJA</p>
        <h2>Tiga langkah.<br />Satu tujuan bersama.</h2>
        <p>Gambaran proses dari persiapan hingga kesepakatan.</p>
      </div>
      <div
        class="mx-auto grid max-w-[950px] items-center gap-[26px] sm:grid-cols-2 sm:gap-10 lg:gap-[90px]"
      >
        <div>
          <div
            class="mb-[25px] flex gap-2 sm:mb-[35px] [&_button]:flex [&_button]:min-h-[50px] [&_button]:flex-1 [&_button]:items-center [&_button]:justify-center [&_button]:gap-[9px] [&_button]:rounded-[7px] [&_button]:border [&_button]:p-2.5 [&_button]:text-[13px] max-[360px]:[&_button]:gap-1.5 max-[360px]:[&_button]:px-1.5 max-[360px]:[&_button]:text-xs [&_span]:text-[10px] [&_span]:opacity-70"
            aria-label="Pilihan langkah demo"
          >
            <button
              v-for="(step, index) in steps"
              :key="step.name"
              :aria-pressed="active === index"
              :class="
                active === index
                  ? 'border-primary bg-primary text-white'
                  : 'border-line bg-white text-muted'
              "
              @click="active = index"
            >
              <span>0{{ index + 1 }}</span
              >{{ step.name }}
            </button>
          </div>
          <div
            class="min-h-[175px] sm:min-h-[215px] [&_h3]:my-[18px] [&_h3]:text-[28px] sm:[&_h3]:text-[32px] [&_h3]:leading-[1.2] [&_p]:text-sm [&_p]:leading-[1.9] [&_p]:text-muted"
            aria-live="polite"
            aria-atomic="true"
          >
            <span
              class="inline-block rounded-full bg-sage px-[9px] py-1 text-[10px] leading-normal text-primary"
              >{{ steps[active]?.tag }}</span
            >
            <h3>{{ steps[active]?.title }}</h3>
            <p>{{ steps[active]?.description }}</p>
          </div>
          <p class="border-t border-line pt-[18px] text-[11px] text-muted">
            Demo konsep produk. Alur dokumen, revisi, dan PDF final belum tersedia sebagai fungsi
            aplikasi pada tahap ini.
          </p>
        </div>
        <DocumentPreview :stage="active" />
      </div>
    </div>
  </section>
</template>
