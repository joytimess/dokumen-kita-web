<script setup lang="ts">
import { ref } from 'vue'
const opened = ref<number | null>(0)
const questions = [
  {
    question: 'Apakah penerima harus memiliki akun?',
    answer:
      'Ya. Penerima perlu masuk dengan akun yang sesuai dengan undangan untuk meninjau dan menandatangani dokumen. Satu akun dapat menjadi pemilik maupun penerima dokumen.',
  },
  {
    question: 'Bagaimana jika dokumen perlu direvisi?',
    answer:
      'Penerima dapat mengajukan permintaan revisi beserta alasannya. Pemilik kemudian menyiapkan versi baru untuk ditinjau kembali, sementara riwayat versi sebelumnya tetap tercatat.',
  },
  {
    question: 'Apakah sudah menggunakan PSrE atau e-Materai?',
    answer:
      'Dokumen Kita menggunakan tanda tangan visual yang dikonfirmasi melalui akun. Saat ini belum menyediakan tanda tangan tersertifikasi PSrE, e-Materai, maupun layanan notarial.',
  },
  {
    question: 'Dokumen apa yang dapat diimpor?',
    answer:
      'Anda dapat mengimpor berkas PDF dan DOCX. Periksa kembali hasil impor sebelum mengirim dokumen, karena tampilan dan tata letaknya dapat berbeda dari berkas asli.',
  },
]
</script>

<template>
  <section id="pertanyaan-umum" class="lp-shell lp-section lp-faq">
    <div class="lp-section-heading" data-reveal>
      <p class="lp-eyebrow">PERTANYAAN UMUM</p>
      <h2>Sebelum Anda mulai.</h2>
      <p>Beberapa hal yang perlu Anda ketahui.</p>
    </div>
    <div class="lp-faq-list" data-reveal>
      <article
        v-for="(item, index) in questions"
        :key="item.question"
        class="lp-faq-item"
        :class="{ 'is-open': opened === index }"
      >
        <h3>
          <button
            :id="`faq-question-${index}`"
            type="button"
            :aria-expanded="opened === index"
            :aria-controls="`faq-answer-${index}`"
            @click="opened = opened === index ? null : index"
          >
            {{ item.question }}<span class="lp-faq-plus" aria-hidden="true">+</span>
          </button>
        </h3>
        <div
          :id="`faq-answer-${index}`"
          class="lp-faq-answer"
          :inert="opened !== index"
          :aria-hidden="opened !== index"
          :aria-labelledby="`faq-question-${index}`"
          role="region"
        >
          <div>
            <p>{{ item.answer }}</p>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>
