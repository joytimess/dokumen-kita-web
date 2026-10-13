<script setup lang="ts">
const questions = [
  {
    question: 'Apakah penerima harus memiliki akun?',
    answer:
      'Ya. Penerima perlu memiliki akun dan masuk untuk meninjau serta mengonfirmasi tanda tangan visual. Satu akun dapat menjadi pemilik maupun penerima dokumen.',
  },
  {
    question: 'Bagaimana jika dokumen perlu direvisi?',
    answer:
      'Target produk mencakup permintaan revisi dan riwayat versi agar perubahan dapat ditinjau sebelum kesepakatan. Alur revisi belum tersedia pada tahap frontend ini.',
  },
  {
    question: 'Apakah sudah menggunakan PSrE atau e-Materai?',
    answer:
      'MVP menggunakan tanda tangan visual yang dikonfirmasi oleh akun terautentikasi. Dokumen Kita tidak mengklaim sertifikasi PSrE, e-Materai, atau verifikasi identitas tersertifikasi.',
  },
  {
    question: 'Dokumen apa yang dapat diimpor?',
    answer:
      'Format yang disepakati adalah PDF dan DOCX. Detail pengolahan PDF masih disesuaikan; hasil impor tidak dijanjikan memiliki layout yang sama persis dengan berkas asli.',
  },
]
</script>
<template>
  <section
    id="pertanyaan-umum"
    class="grid gap-0 py-15 md:grid-cols-[0.9fr_1.1fr] md:gap-[90px] md:py-25 md:[&>div:first-child]:text-left mx-auto w-[calc(100%-36px)] max-w-[1200px] sm:w-[calc(100%-48px)] lg:w-[calc(100%-80px)]"
  >
    <div
      class="mb-9 text-center sm:mb-[50px] [&_h2]:mb-5 [&_h2]:text-[clamp(30px,3.3vw,44px)] [&_h2]:leading-[1.15] [&_p:last-child]:text-muted [&_p:last-child]:text-[13px] sm:[&_p:last-child]:text-[15px]"
    >
      <p class="mb-6 text-[11px] font-bold tracking-[0.16em] text-primary">PERTANYAAN UMUM</p>
      <h2>Sebelum Anda mulai.</h2>
      <p>Beberapa hal yang perlu Anda ketahui.</p>
    </div>
    <div
      class="[&_details]:border-b [&_details]:border-line [&_details:first-child]:border-t [&_summary]:flex [&_summary]:cursor-pointer [&_summary]:list-none [&_summary]:items-center [&_summary]:justify-between [&_summary]:gap-5 [&_summary]:py-[21px] [&_summary]:text-sm [&_summary]:font-semibold [&_summary::-webkit-details-marker]:hidden [&_summary_span]:text-[23px] [&_summary_span]:font-normal [&_summary_span]:text-primary [&_details[open]_summary_span]:rotate-45 [&_p]:mb-6 [&_p]:pr-5 [&_p]:text-sm [&_p]:leading-[1.9] [&_p]:text-muted"
    >
      <details v-for="item in questions" :key="item.question">
        <summary>{{ item.question }}<span aria-hidden="true">+</span></summary>
        <p>{{ item.answer }}</p>
      </details>
    </div>
  </section>
</template>
