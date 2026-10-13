<script setup lang="ts">
withDefaults(defineProps<{ stage?: number }>(), { stage: 0 })
</script>
<template>
  <div
    class="min-w-0 rounded-[10px] border border-line bg-white p-5 shadow-[0_14px_40px_#173d350a] max-[360px]:p-3.5"
  >
    <span class="mb-3.5 inline-block text-[9px] font-bold tracking-[0.14em] text-primary"
      >CONTOH TAMPILAN</span
    >
    <div
      class="flex flex-wrap items-center gap-2.5 border-b border-line pb-[17px] [&_strong]:block [&_strong]:text-xs [&_small]:block [&_small]:text-[10px] [&_small]:text-muted [&>span:last-child]:ml-auto [&>span:last-child]:whitespace-nowrap max-[360px]:[&>span:last-child]:ml-0 lg:flex-nowrap"
    >
      <span class="text-[25px] leading-none text-primary" aria-hidden="true">▤</span>
      <div><strong>Perjanjian kerja sama</strong><small>Dokumen contoh · versi 02</small></div>
      <span
        class="inline-block rounded-full bg-sage px-[9px] py-1 text-[10px] leading-normal text-primary"
        >{{ ['Draft', 'Dalam proses', 'Menunggu giliran'][stage] }}</span
      >
    </div>
    <div
      class="mx-3 my-5 rounded-[3px] border border-[#e9ece4] px-5 py-[25px] max-[360px]:mx-0.5 max-[360px]:my-4 max-[360px]:px-3.5 [&_h3]:mt-3 [&_h3]:mb-[18px] [&_h3]:font-serif [&_h3]:text-[19px] [&_h3]:font-normal! [&_h3]:leading-[1.35]"
    >
      <span class="text-[7px] tracking-[0.13em] text-muted">DOKUMEN KESEPAKATAN</span>
      <h3>Langkah baik dimulai<br />dari kesepakatan.</h3>
      <div
        class="grid gap-[7px] [&_i]:h-1 [&_i]:rounded-[2px] [&_i]:bg-[#eef0ea] [&_i:last-child]:w-[65%]"
        aria-hidden="true"
      >
        <i></i><i></i><i></i><i></i>
      </div>
      <div
        class="mt-6 ml-auto grid w-fit gap-[3px] rounded border border-dashed border-[#b0c2a7] px-3.5 py-2.5 [&_span]:text-[8px] [&_span]:text-muted [&_small]:text-[8px] [&_small]:text-muted [&_em]:text-[19px]"
      >
        <span>Posisi tanda tangan</span><em>Andi Pratama</em
        ><small>Contoh tanda tangan visual</small>
      </div>
    </div>
    <div class="min-w-0">
      <div class="mb-[7px] flex justify-between text-[10px] [&_span]:text-muted">
        <strong>Penerima</strong><span>Berurutan</span>
      </div>
      <div
        v-for="(name, i) in ['Andi Pratama', 'Nadia Putri', 'Bima Saputra']"
        :key="name"
        class="flex items-center gap-[9px] border-t border-[#eff1ec] py-[9px] [&_strong]:block [&_strong]:text-[10px] [&_small]:block [&_small]:text-[9px] [&_small]:text-muted"
      >
        <span class="grid size-7 shrink-0 place-items-center rounded-full bg-sage text-[9px]">{{
          ['AP', 'NP', 'BS'][i]
        }}</span>
        <div>
          <strong>{{ name }}</strong
          ><small>{{ ['Pemilik dokumen', 'Penerima kedua', 'Penerima ketiga'][i] }}</small>
        </div>
        <span
          class="ml-auto text-right text-[9px] text-primary max-[360px]:max-w-20 max-[360px]:text-[8px]"
          >{{
            i === 0 && stage > 0
              ? '✓ Selesai'
              : i === 1 && stage > 0
                ? 'Giliran berikutnya'
                : 'Menunggu'
          }}</span
        >
      </div>
    </div>
    <p class="mt-2 text-[9px] text-muted">Data, nama, dan progres adalah contoh.</p>
  </div>
</template>
