# dokumen-kita-web

Frontend tahap pertama sesuai `dokumen-kita-frontend-prd.md`: landing, login, register, forgot password, dan 404. Stack: Vue 3, TypeScript, Vite, Vue Router, Pinia, Axios, dan Tailwind CSS dari npm.

## Menjalankan aplikasi

Gunakan Node 22.22.2+ atau 24.15.0+ untuk kompatibilitas seluruh tool development. Salin `.env.example` ke `.env.local`, jalankan `npm ci`, lalu `npm run dev`. Default Vite: http://localhost:5173.

## Konfigurasi autentikasi

`VITE_AUTH_MODE=prototype` adalah default. Validasi form bekerja tanpa request API, sesi palsu, akun lokal, atau email terkirim. Google menampilkan penjelasan integrasi belum aktif. Password dan identitas tidak disimpan di localStorage.

Adapter API disiapkan terpisah di `src/services/`. Untuk pengujian integrasi, set `VITE_AUTH_MODE=api` dan `VITE_API_BASE_URL=http://localhost:8000` atau origin API deployment tanpa suffix `/api/v1`. Restart Vite/build setelah mengubah environment. Nilai VITE_* bersifat publik, jangan isi secret.

Adapter memakai cookie Sanctum, credentials, `Accept: application/json`, CSRF `/sanctum/csrf-cookie`, dan header X-XSRF-TOKEN. Mutation dengan 419 memulihkan CSRF dan retry maksimal sekali. Login/register memastikan identitas lewat `/api/v1/me`; OAuth dimulai melalui navigasi browser ke backend dengan tujuan `/`. Register mempertahankan sesi akun yang belum terverifikasi di halaman yang tersedia. Error 422 login bersifat generik, validasi register membaca `error.errors`, dan 429 tidak menggunakan countdown.

**Status integrasi:** belum diverifikasi dengan backend nyata dari lingkungan frontend. Pertahankan mode prototype pada deployment publik sampai cookie, CSRF, CORS, OAuth, dan mailer diperiksa. Konfigurasikan backend `CORS_ALLOWED_ORIGINS`, `SANCTUM_STATEFUL_DOMAINS` (termasuk port lokal), `FRONTEND_URL`, `SESSION_DOMAIN`, `SESSION_SECURE_COOKIE`, dan `SESSION_SAME_SITE` sesuai lingkungan. Lokal MAIL_MAILER=log tidak mengirim email ke inbox. `/email/verified`, `/reset-password`, dashboard, editor, dan tanda tangan adalah fase lanjutan; alur verifikasi/reset belum lengkap end-to-end.

## Styling Tailwind CSS

Untuk sementara, `/login` menampilkan tombol **Logout** saat sesi aktif. Tombol memanggil `POST /api/v1/auth/logout` dengan CSRF, menerima 204 tanpa membaca resource JSON, lalu mengosongkan state akun dan menampilkan form masuk. Kegagalan request mempertahankan state sesi; 401 dianggap sesi sudah berakhir. Mode prototype tidak membuat sesi palsu atau menampilkan logout tanpa akun.

`tailwindcss` dan `@tailwindcss/vite` dipasang dari npm. Plugin terdaftar di `vite.config.ts`; entry `src/styles/tailwind.css` hanya mengimpor Tailwind dan mendefinisikan token `@theme`. Semua layout, breakpoint, input, error, focus, dan animasi memakai utility Tailwind di template Vue. CSS native sebelumnya sudah dihapus. Dokumentasi integrasi: https://tailwindcss.com/docs/installation/using-vite.

## Pemeriksaan

`npm run build` menjalankan typecheck dan build ke `dist/`. `npm run lint` memeriksa Oxlint dan ESLint; `npm test` menguji validasi dan kontrak adapter dengan respons terkendali. Ini tidak menggantikan integrasi backend nyata atau QA visual browser.

Referensi prototype belum berhasil diakses dari lingkungan kerja dan tidak tersedia browser terhubung. Implementasi visual mengikuti token/layout PRD. QA visual, keyboard, overflow pada viewport 320/375/768/1280, dan back/forward perlu diverifikasi di browser; tidak dinyatakan sudah lolos secara visual.

## Deployment cPanel / Apache

Upload **isi** `dist/` ke document root frontend, termasuk `.htaccess` (file tersembunyi). Aturan fallback mengarahkan path nonfile ke `index.html` dan mengecualikan `/api` serta `/sanctum`; endpoint backend tetap memerlukan konfigurasi hosting Laravel tersendiri. Jangan menimpa aturan document root API dengan fallback frontend.

Refresh URL `/login`, `/register`, `/forgot-password`, dan trailing slash harus dilayani `index.html`. Aset nyata tetap dilayani langsung; path tidak dikenal tampil sebagai halaman 404 Vue. Uji URL langsung setelah deployment karena keberhasilan build tidak memverifikasi konfigurasi Apache.

Baseline hosting di root domain. Untuk subfolder, set `base` Vite (misalnya `/dokumen/`) saat build; router sudah menggunakan `import.meta.env.BASE_URL`. Sesuaikan lokasi fallback `.htaccess` dengan subfolder. Gunakan konfigurasi API/OAuth terpisah untuk staging dan production.

## Hasil pemeriksaan implementasi

13 Oktober 2026: build + typecheck berhasil, Oxlint + ESLint lolos, dan 15 tes validasi/adapter lolos. Bundle CSS Tailwind dihasilkan melalui plugin Vite; `.htaccess` ikut disalin ke `dist/`. Tidak ada stylesheet native, `<style>` komponen, atau inline style pada implementasi UI. QA visual browser dan autentikasi backend nyata belum diverifikasi.
