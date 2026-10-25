# Dokumen Kita — Frontend

![Vue](https://img.shields.io/badge/Vue-%5E3.5.42-42b883)
![Node.js](https://img.shields.io/badge/Node.js-%5E22.18.0%20%7C%7C%20%3E%3D24.12.0-339933)

Dokumen Kita membantu pemilik dokumen menyusun draft dan mengatur tanda tangan berurutan dalam satu ruang kerja. Penerima dapat membaca, menandatangani, meminta revisi, atau menolak dokumen sesuai giliran dan izin backend. Repositori ini menyediakan frontend Vue; akun, penyimpanan, otorisasi, pemrosesan PDF, dan pengiriman email ditangani backend Laravel.

Badge mengikuti rentang versi di [package.json](package.json). Paket `dokumen-kita-web` memiliki versi `0.0.0` dan `private: true`; lisensi aplikasi belum dicantumkan.

## 1. Fitur utama

| Modul                   | Fitur dalam kode frontend                                                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autentikasi             | Login, registrasi, redirect Google OAuth, verifikasi email, pemulihan password melalui OTP, logout.                                                 |
| Dokumen                 | Dashboard, pencarian judul, filter status/kategori, pengurutan, pagination, menyembunyikan dan menampilkan kembali dokumen.                         |
| Kategori                | Membuat, mengubah, menghapus, mencari, dan mengurutkan kategori; penetapan kategori dokumen termasuk secara massal.                                 |
| Draft                   | Pembuatan dokumen, impor PDF/DOCX, editor Tiptap, autosave berbasis revisi, tabel, gambar, perataan teks, kop/footer terpisah, preview PDF backend. |
| Pengaturan tanda tangan | Penambahan dan pengurutan penerima; pemilihan, pemindahan, dan perubahan ukuran area tanda tangan pada PDF.                                         |
| Persetujuan             | Viewer PDF, pencarian teks/OCR melalui backend, konfirmasi baca, tanda tangan, permintaan revisi, penolakan, akses PDF final ketika tersedia.       |
| Aset pribadi            | Coretan canvas, unggah gambar, galeri, preview, pagination, penghapusan dengan konfirmasi dan penanganan aset yang digunakan.                       |
| Pemantauan              | Detail, versi, aktivitas dokumen, status email, notifikasi akun, riwayat tanda tangan/revisi dengan filter judul dan tanggal.                       |
| Akun                    | Pengubahan nama, foto, email, password; pilihan bahasa Indonesia/Inggris pada workspace.                                                            |

Ketersediaan OCR, Google OAuth, email, konversi, dan PDF final bergantung pada konfigurasi serta proses backend. Keberadaan UI/service bukan bukti layanan tersebut sudah berhasil dijalankan.

## 2. Role dan hak akses

Frontend tidak mendefinisikan role `admin` atau enum role. [Router](src/router/index.ts) memeriksa sesi dan kondisi verifikasi tertentu; halaman membatasi tindakan berdasarkan identitas, kepemilikan, status versi, serta assignment dari API. Backend menjadi penentu izin akhir.

| Kondisi pengguna             | Akses dan pembatasan frontend                                                                                                                                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pengunjung                   | Beranda, login, registrasi, lupa password, halaman verifikasi/perubahan email, 404. Dalam mode API, akses workspace diarahkan ke login dengan query `redirect`.                                                                   |
| Pengguna login               | Dapat membuka route workspace; data yang dapat diakses tetap ditentukan API. Login/registrasi mengarahkan pengguna yang sudah login ke tujuan setelah autentikasi.                                                                |
| Pengguna belum terverifikasi | Alur setelah login/registrasi mengarah ke verifikasi. Guard secara khusus menghalangi klaim undangan; tidak ada guard verifikasi global untuk seluruh workspace. API dapat menolak tindakan dengan `EMAIL_NOT_VERIFIED`.          |
| Pemilik dokumen              | Editor menerima perubahan untuk draft miliknya yang masih aktif dan tidak terkunci. Pengaturan penerima, area, serta publikasi bergantung pada kesiapan draft/preview. Detail menyediakan kontrol pemilik seperti status email.   |
| Penerima aktif               | Tindakan persetujuan membutuhkan assignment `ready`, sudah diklaim, email terverifikasi, versi aktif, dan dokumen `in_progress`. Tanda tangan juga memerlukan konfirmasi baca dan aset terpilih.                                  |
| Penerima menunggu/selesai    | Assignment `waiting` hanya menampilkan pesan menunggu, tanpa PDF atau tindakan tanda tangan. Status `signed`, `revision_requested`, dan `rejected` dapat membuka viewer sesuai data API tanpa mengaktifkan kembali tindakan lama. |
| Mode prototype               | Guard sesi API dilewati, tetapi layout workspace hanya menampilkan petunjuk aktivasi API; tidak dibuat sesi atau dokumen contoh.                                                                                                  |

### Peta route

URL berikut adalah route browser, bukan endpoint API. Halaman workspace menggunakan [WorkspaceLayout.vue](src/layouts/WorkspaceLayout.vue).

| URL                                                   | File di `src/views/`                                                       |
| ----------------------------------------------------- | -------------------------------------------------------------------------- |
| `/`                                                   | `LandingView.vue`                                                          |
| `/login`, `/register`                                 | `auth/LoginView.vue`, `auth/RegisterView.vue`                              |
| `/forgot-password`                                    | `auth/ForgotPasswordView.vue`                                              |
| `/email/verify`, `/email/verified`                    | `auth/EmailVerificationView.vue`; route kedua memakai prop `result: true`. |
| `/email/changed`                                      | `auth/EmailChangedView.vue`                                                |
| `/dashboard`, `/documents`                            | `workspace/DocumentsView.vue`, masing-masing untuk ringkasan dan daftar.   |
| `/categories`                                         | `workspace/CategoriesView.vue`                                             |
| `/history`                                            | `workspace/SigningHistoryView.vue`                                         |
| `/documents/:documentGuid`                            | `workspace/DocumentDetailView.vue`                                         |
| `/documents/:documentGuid/edit`                       | `workspace/DocumentEditorView.vue`                                         |
| `/documents/:documentGuid/versions/:versionGuid/view` | `workspace/DocumentViewerView.vue`                                         |
| `/signature-assets`                                   | `workspace/SignatureAssetsView.vue`                                        |
| `/profile`                                            | `workspace/ProfileView.vue`                                                |
| `/invitations/claim`                                  | `workspace/InvitationClaimView.vue`; menerima query `token`.               |
| URL lainnya                                           | `NotFoundView.vue`                                                         |

Router membatasi `documentGuid` ke pola 36 karakter heksadesimal/tanda hubung. Contoh bentuk URL berikut memakai ID ilustrasi, bukan data yang tersedia:

```text
/documents/11111111-1111-4111-8111-111111111111/edit
/documents/11111111-1111-4111-8111-111111111111/versions/22222222-2222-4222-8222-222222222222/view
```

Token undangan disimpan sementara dalam `sessionStorage` dan dibersihkan dari query saat diproses router. [authRedirect.ts](src/utils/authRedirect.ts) membatasi redirect setelah login ke tujuan internal.

## 3. Alur penggunaan

1. Buka beranda lalu daftar/login. Mode `prototype` hanya menyimulasikan hasil form dan tidak membuat akun.
2. Dalam mode `api`, selesaikan verifikasi email. Jika datang melalui undangan, gunakan akun dengan email penerima lalu klaim undangan.
3. Sebagai pemilik, buat draft dari dashboard/daftar dokumen. Tulis isi atau impor PDF/DOCX; tunggu konversi backend sebelum meninjau hasilnya.
4. Periksa judul dan isi, tambahkan kop/footer bila diperlukan, lalu tunggu autosave. Buat preview terbaru dari editor; PDF backend menjadi acuan halaman dan posisi akhir.
5. Tambahkan penerima beserta urutannya dan simpan. Atur area tanda tangan pada PDF, simpan seluruh posisi, lalu tandai sudah ditinjau sebelum publikasi.
6. Terbitkan dokumen. Penerima mengklaim undangan dan menunggu giliran sesuai status assignment dari server.
7. Penerima aktif membaca seluruh halaman sampai akhir, mengonfirmasi baca, memilih/membuat aset, lalu menandatangani. Permintaan revisi dan penolakan dengan alasan tersedia sesuai status.
8. Pantau detail, notifikasi, dan riwayat. Jika diminta revisi, pemilik melanjutkan draft sesuai status baru. Setelah semua tanda tangan selesai, tunggu backend menyiapkan PDF final.

Kop/footer adalah gambar draft terpisah dari isi Tiptap. Frontend membatasi PNG/JPEG/WebP maksimal 1200 × 400 piksel dan 2 MB; kontrol saat ini menawarkan semua halaman atau satu nomor halaman. Impor PDF/DOCX dibatasi frontend sebesar 20.480 KB; batas server dapat lebih ketat. Periksa tata letak impor dan tabel pada PDF backend karena tampilan editor tidak menjamin kesamaan hasil render.

## 4. Tech stack

| Bagian           | Teknologi                                                                              |
| ---------------- | -------------------------------------------------------------------------------------- |
| Framework/bahasa | Vue `^3.5.42`, Single File Components, Composition API, TypeScript `~6.0.0`.           |
| Build            | Vite `^8.2.2`, plugin Vue, Vue DevTools, plugin aset PDF lokal.                        |
| State/routing    | Pinia `^4.0.3`, Vue Router `^5.3.1` dengan HTML5 history.                              |
| UI/CSS           | Tailwind CSS `^4.3.3`, CSS khusus, komponen UI internal, Inter dan font dokumen lokal. |
| HTTP             | Axios `^1.20.0`, cookie sesi dan CSRF.                                                 |

Versi di README adalah deklarasi `package.json`, kecuali dinyatakan lain. [package-lock.json](package-lock.json) mengunci versi instalasi; gunakan `npm ci` untuk mengikutinya.

## 5. Library penting

| Kelompok      | Nama                                                                                                                | Versi                             | Fungsi di proyek                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------ |
| UI            | `vue`                                                                                                               | `^3.5.42`                         | Komponen dan reaktivitas.                                    |
| UI            | `tailwindcss`, `@tailwindcss/vite`                                                                                  | `^4.3.3`                          | Utility CSS dan integrasi Vite.                              |
| UI            | `@fontsource-variable/inter`                                                                                        | `^5.3.0`                          | Font antarmuka dari paket lokal.                             |
| UI/editor     | `@tiptap/vue-3`, `@tiptap/starter-kit`, `@tiptap/pm`                                                                | `^3.32.0`                         | Editor dan fondasi ProseMirror.                              |
| UI/editor     | `@tiptap/extension-highlight`, `@tiptap/extension-image`, `@tiptap/extension-table`, `@tiptap/extension-text-align` | `^3.32.0`                         | Highlight, gambar, tabel, perataan teks.                     |
| UI            | `pdfjs-dist`                                                                                                        | `6.4.299`                         | Render PDF dan text layer viewer.                            |
| UI/form       | `flatpickr`                                                                                                         | `^4.6.13`                         | Pemilih rentang tanggal riwayat.                             |
| State         | `pinia`                                                                                                             | `^4.0.3`                          | Identitas pengguna dan pemulihan sesi frontend.              |
| Routing       | `vue-router`                                                                                                        | `^5.3.1`                          | Route, lazy loading halaman, guard navigasi.                 |
| Form/validasi | Tidak ada paket khusus                                                                                              | —                                 | Validasi memakai utilitas TypeScript dan error validasi API. |
| Utilitas      | `axios`                                                                                                             | `^1.20.0`                         | HTTP, upload, cookie, CSRF.                                  |
| Utilitas      | `dompurify`                                                                                                         | `3.4.17`                          | Sanitasi HTML editor.                                        |
| Build         | `vite`, `@vitejs/plugin-vue`                                                                                        | `^8.2.2`, `^6.0.8`                | Dev server dan kompilasi Vue.                                |
| Build         | `typescript`, `vue-tsc`                                                                                             | `~6.0.0`, `^3.3.11`               | Pemeriksaan tipe TypeScript/SFC.                             |
| Build         | `npm-run-all2`                                                                                                      | `^9.0.3`                          | Menjalankan rangkaian script serial/paralel.                 |
| Testing       | `vitest`                                                                                                            | `^5.0.4`                          | Unit test dan pengujian komponen.                            |
| Linting       | `eslint`, `eslint-plugin-vue`, `@vue/eslint-config-typescript`                                                      | `^10.10.0`, `~10.11.0`, `^14.9.0` | Aturan Vue/TypeScript.                                       |
| Linting       | `oxlint`, `eslint-plugin-oxlint`                                                                                    | `~1.82.0`                         | Correctness dan integrasi aturan ESLint.                     |
| Formatting    | `prettier`, `eslint-config-prettier`                                                                                | `3.9.6`, `^10.1.8`                | Format kode dan pencegahan konflik formatting.               |

Tes komponen tertentu memakai `happy-dom`; paket ini ada pada lockfile sebagai optional peer dependency versi `21.0.1`, bukan dependency langsung `package.json`.

## 6. Arsitektur dan struktur folder

```text
src/
├── main.ts                 # Bootstrap Vue, Pinia, router, stylesheet
├── App.vue                 # Shell aplikasi dan host interaksi bersama
├── router/index.ts         # Route, lazy imports, guard, judul halaman
├── stores/auth.ts          # Identitas pengguna dan pemulihan sesi
├── views/
│   ├── auth/               # Login, registrasi, pemulihan, verifikasi
│   ├── workspace/          # Dokumen, kategori, riwayat, aset, profil, undangan
│   ├── LandingView.vue     # Beranda publik
│   └── NotFoundView.vue    # 404
├── layouts/                # AuthLayout dan WorkspaceLayout
├── components/
│   ├── auth/               # Form dan visual autentikasi
│   ├── brand/              # Logo
│   ├── documents/          # Editor, viewer, penerima, posisi, kop/footer
│   ├── landing/            # Hero, demo alur, FAQ, ilustrasi
│   ├── signatures/         # Persetujuan, canvas, galeri tanda tangan
│   ├── ui/                 # Button, field, select, kalender, feedback/dialog
│   └── workspace/          # Header, sidebar, notifikasi
├── composables/            # Autosave, request, impor, dekorasi, auth recovery
├── services/               # HTTP/API, error, feedback, bahasa, mock
├── types/                  # Kontrak tipe auth, dokumen, notifikasi
├── utils/                  # Validasi, editor, tabel, PDF, posisi, redirect
└── styles/                 # Tailwind, CSS auth dan landing
```

Tidak ada folder `src/assets/` atau `src/middleware/` saat ini. Aset statis ada di `public/`, termasuk font; guard ada di router. `tests/` memuat tes, sedangkan [build/pdfAssets.ts](build/pdfAssets.ts) menyajikan/menyalin CMaps, font standar, WASM, dan ICC PDF.js ke `pdfjs/` pada development/build.

Pola utama: **view → composable/service → API**. Komponen menerima props dan mengirim event; composable mengelola alur yang dapat dipakai ulang. Store `auth` menyimpan identitas sementara dan menggabungkan permintaan pemulihan sesi; cookie backend menentukan sesi sebenarnya. Alias `@/` menunjuk ke `src/` pada Vite dan TypeScript.

## 7. Prasyarat

- Node.js sesuai `engines.node`: `^22.18.0 || >=24.12.0`. Untuk development beserta Vitest, gunakan lini Node 22 yang memenuhi rentang itu atau Node 24 mulai 24.12.0; engine Vitest pada lockfile tidak menerima semua versi mayor di atas 24.
- npm dan Git. Repositori menggunakan `package-lock.json`. **TODO: perlu dikonfirmasi** versi npm baku tim karena `packageManager` dan `engines.npm` belum ditentukan.
- Untuk mode API, backend Dokumen Kita harus dapat diakses browser, beserta database, storage, queue worker, scheduler, serta layanan terkait sesuai [README backend](../dokumen-kita-api/README.md). Link relatif ini mengasumsikan checkout frontend dan backend berdampingan.

## 8. Instalasi dan menjalankan

Ambil repositori dan pasang dependency:

```bash
git clone https://github.com/joytimess/dokumen-kita-web.git
cd dokumen-kita-web
npm ci
```

Salin konfigurasi contoh memakai salah satu perintah sesuai shell:

```powershell
Copy-Item .env.example .env
```

```bash
cp .env.example .env
```

Bawaan contoh adalah `prototype`. Untuk backend nyata, isi `.env`:

```env
VITE_AUTH_MODE=api
VITE_API_BASE_URL=http://localhost:8000
```

Jalankan development server:

```bash
npm run dev
```

Buka alamat terminal, biasanya `http://localhost:5173`. Vite meminta port 5173. Axios dan navigasi OAuth selalu memakai `VITE_API_BASE_URL`, termasuk saat development; proxy Vite tidak dipakai untuk menyambungkan sesi OAuth. Pastikan origin frontend aktual diizinkan backend.

Build dan periksa hasilnya secara lokal:

```bash
npm run build
npm run preview
```

`build` menjalankan pemeriksaan tipe dan build secara paralel; output berada di `dist/`. `preview` melayani hasil build untuk pemeriksaan lokal. `.env.local` juga dapat digunakan dan diabaikan Git; periksa file itu jika menimpa nilai `.env`.

## 9. Environment variables

Seluruh variabel pada [.env.example](.env.example):

| Variabel            | Deskripsi                                                                                     | Contoh nilai            |
| ------------------- | --------------------------------------------------------------------------------------------- | ----------------------- |
| `VITE_AUTH_MODE`    | Nilai `api` mengaktifkan backend; nilai lain menjadi `prototype`. Bawaan contoh: `prototype`. | `api`                   |
| `VITE_API_BASE_URL` | Origin HTTP(S) backend tanpa path, query, hash, atau kredensial. Jangan tambahkan `/api/v1`.  | `http://localhost:8000` |

Variabel `VITE_*` masuk bundle browser: jangan menyimpan secret, API key OCR, atau kredensial email di sini. Restart Vite setelah perubahan; pada produksi, build ulang. `import.meta.env.BASE_URL` berasal dari konfigurasi base Vite, bukan variabel tambahan pada `.env.example`.

Untuk Sanctum SPA Authentication, frontend dan API harus berbagi site. Kombinasi `http://localhost:5173` dan `https://api-staging.dokumenkita.online` tidak dapat memakai cookie staging `SameSite=Lax` untuk request Axios. `withCredentials` dan CORS credentials tidak melewati pembatasan cookie browser. Callback Google yang berhasil harus tetap diikuti `/api/v1/me` yang terautentikasi; respons 401 tetap mengarah ke login. Lihat [dokumentasi Sanctum](https://laravel.com/docs/13.x/sanctum#spa-authentication).

Gunakan backend lokal dengan hostname/protokol yang sama untuk pengembangan lokal, atau layani frontend melalui subdomain staging HTTPS, misalnya `https://app-staging.dokumenkita.online`, dengan konfigurasi build:

```env
VITE_AUTH_MODE=api
VITE_API_BASE_URL=https://api-staging.dokumenkita.online
```

Untuk contoh dua subdomain tersebut, konfigurasi backend yang perlu ditinjau oleh pengelola staging:

```env
FRONTEND_URL=https://app-staging.dokumenkita.online
SANCTUM_STATEFUL_DOMAINS=app-staging.dokumenkita.online
CORS_ALLOWED_ORIGINS=https://app-staging.dokumenkita.online
SESSION_DOMAIN=.dokumenkita.online
SESSION_COOKIE=dokumen-kita-staging-session
SESSION_SECURE_COOKIE=true
SESSION_SAME_SITE=lax
```

`SESSION_DOMAIN` bersama memungkinkan SPA membaca cookie `XSRF-TOKEN` untuk header CSRF Axios pada request perubahan data; cookie session tetap HttpOnly. Nama cookie session staging harus terpisah dari produksi. Domain cookie induk juga dibagikan ke subdomain lain, termasuk cookie CSRF, sehingga pastikan tidak berbenturan dengan aplikasi lain pada domain tersebut. CORS backend harus tetap mengaktifkan credentials dan mengizinkan origin secara eksplisit. Tambahkan port ke daftar stateful jika origin frontend memakainya. Contoh ini tidak mengubah konfigurasi staging secara otomatis; pastikan hosting HTTPS dan verifikasi `/api/v1/me`, refresh halaman, login biasa, register, verifikasi email, serta logout di domain tujuan sebelum menyatakan alur selesai.

## 10. Script npm

Semua script berikut berasal dari `package.json`:

| Perintah              | Fungsi                                                    |
| --------------------- | --------------------------------------------------------- |
| `npm test`            | `vitest run`, tes sekali.                                 |
| `npm run dev`         | Vite development server.                                  |
| `npm run build`       | Menjalankan `type-check` dan `build-only` secara paralel. |
| `npm run preview`     | Melayani hasil build melalui Vite preview.                |
| `npm run build-only`  | Build Vite tanpa pemeriksaan tipe terpisah.               |
| `npm run type-check`  | Pemeriksaan tipe dengan `vue-tsc --build`.                |
| `npm run lint`        | Menjalankan semua `lint:*` secara serial.                 |
| `npm run lint:oxlint` | Oxlint dengan `--fix`.                                    |
| `npm run lint:eslint` | ESLint dengan `--fix --cache`.                            |
| `npm run format`      | Prettier menulis ulang format berkas `src/`.              |

## 11. Integrasi backend

### Alamat dan service

[http.ts](src/services/http.ts) memvalidasi origin, lalu service membentuk URL lengkap. Tidak ada `baseURL` Axios atau interceptor request/response global. Contoh origin `http://localhost:8000` menghasilkan endpoint aplikasi `http://localhost:8000/api/v1/...`; CSRF memakai `/sanctum/csrf-cookie`.

| Service                                                           | Cakupan endpoint                                                                                                |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [auth.service.ts](src/services/auth.service.ts)                   | `/api/v1/auth/*`, `/api/v1/me`; login, registrasi, OTP, verifikasi, Google redirect, logout.                    |
| [documents.service.ts](src/services/documents.service.ts)         | Dokumen, versi, impor, dekorasi, preview, penerima, posisi, publikasi, OCR, undangan, baca, tanda tangan, aset. |
| [categories.service.ts](src/services/categories.service.ts)       | `/api/v1/categories`, pengelolaan kategori.                                                                     |
| [history.service.ts](src/services/history.service.ts)             | `/api/v1/me/history`, daftar/detail riwayat.                                                                    |
| [account.service.ts](src/services/account.service.ts)             | `/api/v1/me/profile`, foto, perubahan email/password.                                                           |
| [notifications.service.ts](src/services/notifications.service.ts) | `/api/v1/notifications`, daftar dan penandaan dibaca.                                                           |

### Autentikasi

- Axios memakai `withCredentials: true`, `withXSRFToken: true`, timeout 15 detik, dan `Accept: application/json`.
- Cookie `XSRF-TOKEN` dikirim sebagai header `X-XSRF-TOKEN`. Helper `mutation()` mengambil CSRF sebelum POST/PATCH/PUT dan mengulang sekali setelah HTTP 419. DELETE tertentu mengambil CSRF langsung dan tidak memakai retry helper itu.
- Identitas dipulihkan melalui `/api/v1/me`; tidak ada Bearer token di `localStorage`. Penyimpanan lokal digunakan untuk preferensi sidebar/bahasa; token undangan sementara memakai `sessionStorage`.
- Backend harus mengizinkan origin frontend beserta credential pada CORS, serta domain sesi/Sanctum yang sesuai. Periksa `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, dan `SANCTUM_STATEFUL_DOMAINS` pada backend.

### Respons, error, dan proses asynchronous

Service membaca resource `{ data: ... }`; daftar memakai `data`, `meta`, dan `links`. Error frontend membaca `error.code` dan `error.errors`, misalnya bentuk berikut (kode hanya ilustrasi):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "errors": { "email": ["Pesan validasi dari server"] }
  }
}
```

[auth.errors.ts](src/services/auth.errors.ts) dan [workspace.errors.ts](src/services/workspace.errors.ts) memetakan error menjadi pesan UI. Status yang ditangani mencakup 401, 403, 404, 409, 413, 419, 422, 429, serta kegagalan koneksi/server; `Retry-After` dipakai untuk pembatasan request workspace. Error tanpa respons atau 5xx dapat berarti hasil tindakan belum pasti: periksa status sebelum mengulang.

PDF diambil sebagai data biner dan dicocokkan dengan `X-Document-Content-Hash`; CORS backend perlu mengekspos header ini agar terbaca lintas origin. Preview lama tidak menjadi acuan tanda tangan setelah draft berubah. Konversi, preview, dan finalisasi dipantau melalui polling: respons diterima API tidak berarti pekerjaan sudah selesai. Status email diterima server juga bukan bukti email masuk inbox.

## 12. Testing, linting, dan format kode

```bash
npm test
npm test -- tests/tiptap.test.ts
npm run lint
npm run format
```

Vitest memakai environment default `node`, pola `tests/**/*.test.ts`, dan plugin Vue. Tes komponen tertentu memilih `happy-dom` melalui directive per file. Tes yang ada mencakup autentikasi/verifikasi, routing/sesi workspace, kategori, konversi Tiptap, dekorasi, galeri aset, navigasi tab tanda tangan, dan riwayat. Sejumlah tes memakai mock service; hasilnya tidak membuktikan koneksi backend/provider atau seluruh alur browser.

ESLint memakai Vue essential dan TypeScript recommended dengan integrasi Oxlint. Prettier menetapkan single quote, tanpa semicolon, dan lebar 100 karakter; EditorConfig menetapkan indentasi dua spasi serta LF untuk kode. `lint` dan `format` **mengubah berkas**; tinjau cakupannya sebelum commit. Script `format` hanya menargetkan `src/`.

Tidak ada script E2E atau konfigurasi CI di repo saat dokumentasi ini diperbarui. **TODO: perlu dikonfirmasi** pemeriksaan wajib CI dan target pengujian browser/backend. Bagian ini menjelaskan konfigurasi, bukan laporan hasil tes terbaru.

## 13. Deployment

1. Siapkan environment build: `VITE_AUTH_MODE=api` dan origin backend produksi.
2. Jalankan `npm ci`, lalu `npm run build`.
3. Unggah isi `dist/` ke static hosting, termasuk font publik dan direktori `pdfjs/`.
4. Aktifkan SPA fallback ke `index.html` agar refresh route seperti `/documents/.../edit` tidak menghasilkan 404 hosting.
5. Sesuaikan CORS, domain sesi/Sanctum, HTTPS, dan redirect frontend pada backend; verifikasi login, refresh route, PDF, dan persetujuan di lingkungan tujuan.

Contoh Nginx berikut merupakan template untuk root domain, bukan konfigurasi yang sudah tersedia di repo:

```nginx
server {
    listen 80;
    server_name frontend.example.com;
    root /var/www/dokumen-kita-web/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Atur TLS pada hosting/reverse proxy yang dipakai. Vite belum menetapkan `base` khusus; sebagian aset memakai path root seperti `/fonts/`, sehingga deployment subpath perlu meninjau keduanya. Material Symbols di `index.html` masih dimuat dari Google Fonts; Inter dan aset PDF.js disajikan dari aplikasi.

**TODO: perlu dikonfirmasi** hosting/domain produksi, strategi TLS/cookie lintas domain, root/subpath, dan pipeline build/deploy tim.

## 14. Konvensi pengembangan

- Komponen memakai PascalCase (`PdfViewer.vue`), halaman berakhiran `View.vue`, layout berakhiran `Layout.vue`.
- Composable memakai `useXxx.ts`; service API memakai `*.service.ts`; utilitas/tipe dikelompokkan per domain.
- Ikuti pola Composition API dengan `<script setup lang="ts">`. Tempatkan HTTP pada service, alur bersama pada composable, dan identitas global pada store auth.
- Ikuti [AGENTS.md](AGENTS.md): baca implementasi terkait, buat perubahan terarah, verifikasi perilaku. Pekerjaan editor memiliki ketentuan tambahan tentang kontrak backend dan preview.
- **TODO: perlu dikonfirmasi** format commit dan alur branch resmi; belum ada commitlint, panduan branch, atau template kontribusi yang menetapkannya. Branch lokal saja tidak membuktikan workflow tim.

## 15. Troubleshooting

| Gejala                                           | Pemeriksaan dan solusi                                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace meminta aktivasi API                   | Set `VITE_AUTH_MODE=api`, isi origin backend, restart Vite. Prototype tidak menyediakan data workspace.                                           |
| Error origin API                                 | Gunakan origin HTTP(S), misalnya `http://localhost:8000`; hapus `/api/v1`, path, query, kredensial.                                               |
| Nilai `.env` tidak berubah                       | Periksa `.env.local` dan environment sesuai mode; restart Vite atau build ulang untuk produksi.                                                   |
| CORS, cookie hilang, 401, login tidak bertahan   | Periksa origin aktual, credential CORS, domain/port Sanctum, serta HTTPS/SameSite backend. Gunakan host `localhost`/`127.0.0.1` secara konsisten. |
| HTTP 419                                         | Periksa `/sanctum/csrf-cookie`, cookie `XSRF-TOKEN`, dan header CSRF. Muat ulang/login kembali jika sesi berakhir.                                |
| HTTP 403/tindakan persetujuan tidak muncul       | Periksa verifikasi email, akun penerima, klaim, giliran, status versi. Akses route tidak menjamin izin API.                                       |
| HTTP 409/konflik revisi                          | Tinjau status/draft terbaru; jangan menimpa edit lokal tanpa pemeriksaan. Buat ulang preview setelah perubahan.                                   |
| Konversi, preview, finalisasi, email menunggu    | Periksa error/status, queue worker, dan scheduler backend. Server HTTP saja tidak menjalankan seluruh antrean.                                    |
| PDF gagal/hash tidak cocok                       | Pastikan izin endpoint, preview terbaru, header `X-Document-Content-Hash` terekspos CORS, dan aset `pdfjs/` tersedia.                             |
| PDF scan tidak dapat dicari/diimpor sebagai teks | Periksa konfigurasi OCR backend dan pesan error. UI menyebut batas OCR scan 1 MB/3 halaman; hasilnya bergantung server/provider.                  |
| Aset tidak bisa dihapus                          | `SIGNATURE_ASSET_IN_USE` berarti API menolak penghapusan karena aset sudah digunakan.                                                             |
| Route 404 setelah refresh hosting                | Aktifkan SPA fallback dan pastikan GUID berasal dari backend.                                                                                     |
| Tes gagal karena `happy-dom` tidak ditemukan     | Pastikan instalasi mengikuti lockfile dan optional peer dependency tidak dikecualikan. Environment `node` tidak cukup untuk seluruh tes.          |
| Dependency menolak Node                          | Cocokkan Node dengan engine aplikasi/tool pada lockfile, lalu instal ulang melalui `npm ci`.                                                      |

## 16. Kontribusi dan lisensi

Baca `AGENTS.md`, telusuri route/service terkait, dan buat perubahan sekecil yang menyelesaikan kebutuhan. Sertakan penjelasan serta pemeriksaan yang relevan dalam pull request; bedakan tes otomatis, uji browser, dan verifikasi backend/provider. Jangan commit `.env`, credential, atau artefak `dist/`.

**TODO: perlu dikonfirmasi** kebijakan kontribusi, reviewer, dan aturan pull request resmi.

Tidak ada field `license` pada `package.json` atau lisensi aplikasi di root. `private: true` mencegah publikasi npm secara tidak sengaja, bukan menetapkan lisensi kode. **TODO: perlu dikonfirmasi** lisensi aplikasi dan izin distribusi; pertahankan lisensi font/aset pihak ketiga sesuai berkas masing-masing di `public/fonts/`.
