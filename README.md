# dokumen-kita-web

Frontend Dokumen Kita mencakup landing/autentikasi existing dan workspace sesuai `PRD-Frontend-Dokumen-Kita-v2.md`: ringkasan owner, dokumen, editor draft, penerima, posisi tanda tangan, viewer PDF, klaim undangan, dan aset tanda tangan. Stack: Vue 3, TypeScript, Vite, Vue Router, Pinia, Axios, Tailwind CSS, Editor.js, PDF.js, dan DOMPurify dari npm. Kemampuan preview/publish/signature tetap bersyarat pada snapshot dan izin backend.

## Menjalankan aplikasi

Gunakan Node 22.22.2+ atau 24.15.0+ untuk kompatibilitas seluruh tool development. Salin `.env.example` ke `.env.local`, jalankan `npm ci`, lalu `npm run dev`. Default Vite: http://localhost:5173.

## Konfigurasi autentikasi

`VITE_AUTH_MODE=prototype` adalah default. Validasi form bekerja tanpa request API, sesi palsu, akun lokal, atau email terkirim. Google menampilkan penjelasan integrasi belum aktif. Password dan identitas tidak disimpan di localStorage.

Adapter API disiapkan terpisah di `src/services/`. Untuk pengujian integrasi, set `VITE_AUTH_MODE=api` dan `VITE_API_BASE_URL=http://localhost:8000` atau origin API deployment tanpa suffix `/api/v1`. Restart Vite/build setelah mengubah environment. Nilai VITE_* bersifat publik, jangan isi secret.

Adapter memakai cookie Sanctum, credentials, `Accept: application/json`, CSRF `/sanctum/csrf-cookie`, dan header X-XSRF-TOKEN. Mutation dengan 419 memulihkan CSRF dan retry maksimal sekali. Login/register menggunakan user dari respons backend tanpa `/me` tambahan. Akun belum terverifikasi diarahkan ke `/email/verify`; akun terverifikasi melanjutkan ke tujuan internal yang valid atau `/dashboard`. Tujuan undangan dipertahankan selama login/verifikasi/Google melalui pending token sementara pada sessionStorage. OAuth dimulai melalui navigasi browser ke backend. Error 422 login bersifat generik dan validasi register membaca `error.errors`.

**Status integrasi:** pengguna menyatakan autentikasi existing telah diuji sendiri. Integrasi workspace baru belum diuji end-to-end dengan backend dan provider nyata dalam pekerjaan v2. Konfigurasikan backend `CORS_ALLOWED_ORIGINS`, `SANCTUM_STATEFUL_DOMAINS` (termasuk port lokal), `FRONTEND_URL`, `SESSION_DOMAIN`, `SESSION_SECURE_COOKIE`, dan `SESSION_SAME_SITE` sesuai lingkungan. Lokal MAIL_MAILER=log tidak mengirim email ke inbox. Workspace membutuhkan `VITE_AUTH_MODE=api`; mode prototype tidak membuat data workspace palsu.

## Workspace v2

Sesi valid pada `/`, `/login`, dan `/register` diarahkan ke dashboard atau tujuan undangan. Recovery dan verifikasi tetap memiliki alur sendiri. Kegagalan jaringan saat restore menampilkan retry; tidak diperlakukan sebagai logout. Sidebar memuat Ringkasan, Dokumen Saya, dan Tanda Tangan Saya; pada mobile menggunakan drawer.

Route baru: `/dashboard`, `/documents`, `/documents/new`, `/documents/:documentGuid`, `/documents/:documentGuid/edit`, `/documents/:documentGuid/versions/:versionGuid/view`, `/invitations/claim`, dan `/signature-assets`. Refresh deep-link route tersebut tetap memerlukan fallback SPA Apache di bawah.

Editor memakai Editor.js 2.31.7 dengan Header 2.8.8, List 2.0.9, Table 2.4.6, dan Image 2.10.3. Header 3 tidak digunakan karena memakai SDK berbeda. DOMPurify 3.4.17 membersihkan markup inline sebelum data dirender/disimpan. Skema list dinormalisasi antara format tool dan sanitizer backend; gambar hanya data PNG/JPEG/WebP inline. Tidak ada URL gambar remote atau konversi sumber impor ke editor.

Autosave debounce 1.000 ms, satu request aktif, dan antrean snapshot lokal. Simpan manual/keluar tahap melakukan flush; kegagalan tidak membuang isi atau retry terus-menerus. Navigasi dan logout memeriksa pekerjaan yang belum tersimpan. Isi dokumen tidak disimpan di localStorage. Konflik backend menghentikan pengiriman dan mempertahankan perubahan di halaman untuk ditinjau.

PDF.js 6.4.299 dimuat pada route terkait; worker, CMaps, font standar, WASM decoder, dan profil warna disajikan lokal bersama build oleh `build/pdfAssets.ts`. Viewer merender satu halaman aktif, memiliki navigasi/zoom/pencarian multi-halaman bertahap, serta gerbang baca. Tanpa text layer, OCR tidak dijanjikan. Semua halaman harus berhasil dikunjungi sebelum akhir dokumen dapat memenuhi gerbang; checkbox persetujuan tetap eksplisit. Signature retry menggunakan aset, hash, dan idempotency key yang sama setelah hasil ambigu.

### Prasyarat snapshot dan contract gap

- Draft baru, termasuk yang memiliki sumber PDF, belum otomatis memperoleh snapshot. Backend saat ini tidak menyediakan endpoint/job renderer preview. Posisi dan publish dikunci tanpa preview `ready`, hash, page count, dan assignment tersimpan.
- Uji posisi/publish/read/signature memerlukan snapshot backend yang valid: PDF privat, hash yang cocok, jumlah halaman, metadata preview siap, dan assignment yang sesuai. Siapkan melalui fixture backend yang ditinjau tim backend; frontend tidak mengunggah PDF melalui endpoint buatan untuk melewati prasyarat.
- Respons klaim hanya memuat assignment dan `version_guid`, tanpa `document_guid`, judul, atau nomor versi. Klaim ready dapat membaca snapshot memakai versi dan hash resmi dari header PDF; label generik dokumen undangan bukan judul dari server. Persetujuan dari entry klaim diblokir tanpa metadata lengkap; alur signature tersedia melalui viewer detail dokumen berizin. Navigasi ke detail dan tombol status waiting setelah token dibersihkan belum dapat dihubungkan. Setelah refresh, buka ulang tautan asli; konteks privat hasil klaim tidak disimpan persisten. Tidak ada endpoint detail assignment/versi untuk menutup gap tersebut.
- URL viewer dengan versi historis yang berbeda dari `current_version` diblokir karena API detail hanya menyediakan metadata versi terkini; tidak memakai metadata versi lain untuk mengotorisasi PDF historis.
- Persetujuan terakhir menghasilkan `finalizing`. UI tidak menjanjikan job final otomatis atau PDF final bertanda tangan. Status `completed` hanya ditampilkan jika benar-benar dikembalikan backend.
- Pencarian judul dibatasi pada halaman data yang dimuat; pagination/status mengikuti API aktual. Tidak ada statistik total dari satu halaman, inbox penerima, audit, revisi, hidden, notifikasi, atau endpoint preview buatan.

Rincian kontrak, hasil pemeriksaan, dan pekerjaan bersyarat: [handoff frontend v2](docs/frontend-v2-handoff.md).

## Verifikasi email

`/email/verify` menunggu pemulihan sesi, menampilkan email dari user API, dan menyediakan kirim ulang, pemeriksaan status, beranda, serta logout. Membuka halaman tidak mengirim email otomatis. Resend memakai `POST /api/v1/auth/email/resend` tanpa alamat email pada body. Respons 202 berarti permintaan diterima, bukan email sudah masuk inbox. Cooldown 60 detik disimpan sebagai timestamp per guid di sessionStorage; 429 memakai `Retry-After` detik/tanggal atau fallback 60 detik. Kegagalan tidak mengulang resend otomatis.

`/email/verified` adalah route publik. Halaman mengambil ulang `/api/v1/me` dan hanya menampilkan sukses jika user aktif terverifikasi. Tanpa sesi, halaman menawarkan login; akun berbeda yang belum terverifikasi diarahkan untuk memverifikasi akun aktif. Parameter URL tidak digunakan untuk menentukan email atau status. Request identitas yang sedang berjalan dibagi oleh pemulihan sesi dan halaman. Tombol **Saya sudah verifikasi** dan kembali ke tab (dibatasi 5 detik, tanpa polling) memperbarui Pinia; banner beranda hilang setelah status terverifikasi.

Mode prototype hanya menjelaskan bahwa API diperlukan; tidak membuat sesi atau status verifikasi palsu. Link dari email tetap dibuka lengkap melalui browser menuju backend, termasuk signature dan expiry. Frontend tidak menyusun link verifikasi atau memanggil endpoint link melalui AJAX.

Route `/email/verification-failed` belum diimplementasikan karena kontrak redirect kegagalan backend belum tersedia, sesuai bagian 8 PRD. Backend saat ini tetap menangani link invalid/kedaluwarsa/429 pada URL API.

QA integrasi yang masih perlu dilakukan dengan backend dan inbox nyata:

- Aktifkan queue worker sesuai `QUEUE_CONNECTION`, SMTP, dan `FRONTEND_URL`; daftar akun baru, pastikan notifikasi awal dijadwalkan dan redirect menuju permintaan verifikasi.
- Klik resend sekali, pastikan satu POST, lalu refresh saat cooldown berjalan. Periksa 401, 419 berulang, 429, network, dan 5xx.
- Buka link asli dengan sesi, tanpa sesi, serta sesi akun lain. Buka `/email/verified` manual; sukses hanya boleh berdasarkan `/me`.
- Verifikasi di tab/perangkat lain, kembali ke tab atau klik pemeriksaan; pastikan status store/banner berubah tanpa request ganda.
- Periksa keyboard, fokus, status loading, reduced motion, serta overflow pada viewport 320/375/768/1280. Browser sesi kerja tidak tersedia, sehingga pemeriksaan visual belum dilakukan.

## Styling Tailwind CSS

Untuk sementara, `/login` menampilkan tombol **Logout** saat sesi aktif. Tombol memanggil `POST /api/v1/auth/logout` dengan CSRF, menerima 204 tanpa membaca resource JSON, lalu mengosongkan state akun dan menampilkan form masuk. Kegagalan request mempertahankan state sesi; 401 dianggap sesi sudah berakhir. Mode prototype tidak membuat sesi palsu atau menampilkan logout tanpa akun.

`tailwindcss` dan `@tailwindcss/vite` dipasang dari npm. Plugin terdaftar di `vite.config.ts`; entry `src/styles/tailwind.css` hanya mengimpor Tailwind dan mendefinisikan token `@theme`. Semua layout, breakpoint, input, error, focus, dan animasi memakai utility Tailwind di template Vue. CSS native sebelumnya sudah dihapus. Dokumentasi integrasi: https://tailwindcss.com/docs/installation/using-vite.

## Pemeriksaan

`npm run build` menjalankan typecheck dan build ke `dist/`. `npm run lint` memeriksa Oxlint dan ESLint; `npm test` menguji validasi dan kontrak adapter dengan respons terkendali. Ini tidak menggantikan integrasi backend nyata atau QA visual browser.

Referensi prototype belum berhasil diakses dari lingkungan kerja dan tidak tersedia browser terhubung. Implementasi visual mengikuti token/layout PRD. QA visual, keyboard, overflow pada viewport 320/375/768/1280, dan back/forward perlu diverifikasi di browser; tidak dinyatakan sudah lolos secara visual.

## Deployment cPanel / Apache

Upload **isi** `dist/` ke document root frontend, termasuk `.htaccess` (file tersembunyi). Aturan fallback mengarahkan path nonfile ke `index.html` dan mengecualikan `/api` serta `/sanctum`; endpoint backend tetap memerlukan konfigurasi hosting Laravel tersendiri. Jangan menimpa aturan document root API dengan fallback frontend.

Refresh URL `/login`, `/register`, `/forgot-password`, `/email/verify`, `/email/verified`, dan trailing slash harus dilayani `index.html`. Aset nyata tetap dilayani langsung; path tidak dikenal tampil sebagai halaman 404 Vue. Uji URL langsung setelah deployment karena keberhasilan build tidak memverifikasi konfigurasi Apache.

Baseline hosting di root domain. Untuk subfolder, set `base` Vite (misalnya `/dokumen/`) saat build; router sudah menggunakan `import.meta.env.BASE_URL`. Sesuaikan lokasi fallback `.htaccess` dengan subfolder. Gunakan konfigurasi API/OAuth terpisah untuk staging dan production.

## Hasil pemeriksaan implementasi

14 Oktober 2026: implementasi verifikasi email diperiksa dengan build + typecheck, ESLint, Oxlint, dan 32 tes frontend. Tes meliputi redirect internal, user respons login/register tanpa request identitas tambahan, deduplikasi `/me`, cooldown per akun/refresh, Retry-After, klik ganda, CSRF retry terbatas, sesi berakhir, dan kegagalan server/network. Pengiriman inbox, link asli, dan QA tampilan browser belum diverifikasi.

13 Oktober 2026: build + typecheck berhasil, Oxlint + ESLint lolos, dan 15 tes validasi/adapter lolos. Bundle CSS Tailwind dihasilkan melalui plugin Vite; `.htaccess` ikut disalin ke `dist/`. Tidak ada stylesheet native, `<style>` komponen, atau inline style pada implementasi UI. QA visual browser dan autentikasi backend nyata belum diverifikasi.
