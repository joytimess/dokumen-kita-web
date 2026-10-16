# Dokumen Kita

Dokumen Kita adalah aplikasi untuk menyiapkan dokumen dan mengelola proses persetujuannya dalam satu tempat. Pengguna dapat membuat dan menyunting draft, mengatur penerima serta urutan tanda tangan, membaca dokumen, lalu mengikuti status prosesnya. Proyek ini adalah **bagian frontend**: tampilan yang dibuka pengguna di browser. Data akun, dokumen, dan proses tanda tangan berasal dari backend Dokumen Kita melalui API.

## Gambaran arsitektur

Frontend dibuat sebagai aplikasi Vue yang berpindah halaman tanpa memuat ulang seluruh situs. Halaman seperti beranda, masuk, daftar, daftar dokumen, editor, dan pembaca PDF berada di proyek ini. Saat membutuhkan data atau menyimpan perubahan, frontend mengirim permintaan ke backend Laravel melalui API. Backend menangani akun, penyimpanan dokumen, dan aturan proses persetujuan.

Secara sederhana, alurnya adalah **browser → frontend Vue → API Laravel**. Sesi masuk memakai cookie dari Laravel Sanctum. Frontend menyimpan informasi pengguna yang sedang aktif sementara di Pinia, sedangkan sesi yang berlaku tetap ditentukan oleh backend.

## Peta route dan berkas

Daftar URL frontend di bawah mengikuti [src/router/index.ts](src/router/index.ts). [src/main.ts](src/main.ts) membuat aplikasi Vue dan memasang Pinia serta router; [src/App.vue](src/App.vue) menampilkan halaman yang dipilih router. Semua route workspace memakai [WorkspaceLayout.vue](src/layouts/WorkspaceLayout.vue) untuk navigasi dan sesi akun. URL di tabel ini adalah URL browser, bukan endpoint `/api/v1` milik backend.

| URL frontend | File halaman | Berkas utama yang dipakai halaman |
| --- | --- | --- |
| `/` | [LandingView.vue](src/views/LandingView.vue) | `src/components/landing/` untuk bagian beranda. |
| `/login`, `/register` | [LoginView.vue](src/views/auth/LoginView.vue), [RegisterView.vue](src/views/auth/RegisterView.vue) | [AuthLayout.vue](src/layouts/AuthLayout.vue), [AuthForm.vue](src/components/auth/AuthForm.vue). |
| `/forgot-password` | [ForgotPasswordView.vue](src/views/auth/ForgotPasswordView.vue) | [PasswordRecoveryForm.vue](src/components/auth/PasswordRecoveryForm.vue). |
| `/email/verify`, `/email/verified` | [EmailVerificationView.vue](src/views/auth/EmailVerificationView.vue) | [EmailVerificationActions.vue](src/components/auth/EmailVerificationActions.vue); `/email/verified` memakai halaman yang sama dengan prop `result: true`. |
| `/dashboard`, `/documents` | [DocumentsView.vue](src/views/workspace/DocumentsView.vue) | [documents.service.ts](src/services/documents.service.ts); `/dashboard` menampilkan ringkasan, `/documents` daftar dokumen. |
| `/documents/new` | [NewDocumentView.vue](src/views/workspace/NewDocumentView.vue) | [documents.service.ts](src/services/documents.service.ts) untuk membuat dokumen. |
| `/documents/:documentGuid` | [DocumentDetailView.vue](src/views/workspace/DocumentDetailView.vue) | [documents.service.ts](src/services/documents.service.ts) untuk detail, status, dan tindakan dokumen. |
| `/documents/:documentGuid/edit` | [DocumentEditorView.vue](src/views/workspace/DocumentEditorView.vue) | [NativeEditor.vue](src/components/documents/NativeEditor.vue), [PdfViewer.vue](src/components/documents/PdfViewer.vue), serta komponen penerima, posisi tanda tangan, sumber berkas, dan dekorasi di `src/components/documents/`. |
| `/documents/:documentGuid/versions/:versionGuid/view` | [DocumentViewerView.vue](src/views/workspace/DocumentViewerView.vue) | [SigningSession.vue](src/components/signatures/SigningSession.vue) memakai [PdfViewer.vue](src/components/documents/PdfViewer.vue) dan [AssetLibrary.vue](src/components/signatures/AssetLibrary.vue) saat penerima berhak menandatangani. |
| `/signature-assets` | [SignatureAssetsView.vue](src/views/workspace/SignatureAssetsView.vue) | [AssetLibrary.vue](src/components/signatures/AssetLibrary.vue) untuk aset tanda tangan akun. |
| `/invitations/claim` | [InvitationClaimView.vue](src/views/workspace/InvitationClaimView.vue) | [documents.service.ts](src/services/documents.service.ts) untuk klaim undangan; tautan undangan dapat membawa query `token`. |
| URL lainnya | [NotFoundView.vue](src/views/NotFoundView.vue) | Halaman 404. |

`documentGuid` dan `versionGuid` adalah ID dari backend. Contoh **bentuk URL** untuk satu dokumen dan versinya (ID ini hanya contoh, bukan data yang tersedia):

```text
/documents/11111111-1111-4111-8111-111111111111
/documents/11111111-1111-4111-8111-111111111111/edit
/documents/11111111-1111-4111-8111-111111111111/versions/22222222-2222-4222-8222-222222222222/view
```

Instans dan modul yang dipakai bersama oleh halaman-halaman tersebut:

| Berkas | Peran |
| --- | --- |
| [src/router/index.ts](src/router/index.ts) | Instans router, daftar route, dan penjaga navigasi untuk sesi serta undangan. |
| [src/stores/auth.ts](src/stores/auth.ts) | Store Pinia untuk identitas akun yang sedang aktif; dipakai router, layout, dan halaman. |
| [src/services/http.ts](src/services/http.ts) | Instans Axios `http`, origin API, cookie sesi, dan CSRF. |
| [src/services/auth.service.ts](src/services/auth.service.ts), [src/services/documents.service.ts](src/services/documents.service.ts) | Objek `authApi` dan `documentsApi` yang dipakai halaman untuk memanggil backend. |
| `src/components/`, `src/composables/`, `src/utils/`, `src/types/` | Komponen tampilan, alur state yang dapat dipakai ulang, fungsi bantu, dan tipe data. |

Di mode `api`, route workspace membutuhkan akun yang sudah masuk. Di mode `prototype`, layout workspace menampilkan petunjuk untuk mengaktifkan API, tanpa membuat dokumen contoh.

## Teknologi dan library utama

| Teknologi | Digunakan untuk |
| --- | --- |
| Vue 3 dan TypeScript | Membangun tampilan dan membantu menjaga struktur kode. |
| Vite | Menjalankan server pengembangan dan membuat hasil build. |
| Vue Router | Mengatur perpindahan halaman. |
| Pinia | Menyimpan keadaan aplikasi, termasuk informasi pengguna aktif. |
| Axios | Mengirim permintaan HTTP ke API backend. |
| Tailwind CSS | Mengatur tampilan dan tata letak. |
| Tiptap | Menyunting isi draft dokumen. |
| PDF.js | Menampilkan dan membaca PDF di browser. |
| DOMPurify | Membersihkan konten HTML dari editor sebelum digunakan. |

## Koneksi ke API

Koneksi API menggunakan **Axios**. Alamat backend diatur melalui `VITE_API_BASE_URL`, misalnya `http://localhost:8000`. Isi dengan alamat dasar backend saja, tanpa tambahan `/api/v1`. Untuk masuk dan menyimpan data, frontend menggunakan cookie sesi serta perlindungan CSRF Laravel Sanctum.

Ada dua mode yang dapat dipilih melalui `VITE_AUTH_MODE`:

- `prototype` adalah mode awal. Tampilan dan validasi form dapat dicoba tanpa backend, tetapi tidak membuat akun atau dokumen sungguhan.
- `api` menghubungkan frontend ke backend. Gunakan mode ini untuk mencoba login, dokumen, dan fitur lain yang membutuhkan data nyata.

Backend harus berjalan dan mengizinkan alamat frontend sebagai origin agar mode `api` dapat dipakai. Beberapa langkah dokumen, seperti preview sebelum publikasi atau tanda tangan, juga memerlukan data PDF yang sudah disiapkan backend.

## Menjalankan proyek di komputer lokal

Siapkan **Node.js 22.22.2+ atau 24.15.0+** dan npm. Setelah membuka terminal di folder proyek ini, lakukan langkah berikut:

1. Salin contoh konfigurasi ke file lokal:

   ```powershell
   Copy-Item .env.example .env.local
   ```

2. Pasang library proyek:

   ```powershell
   npm ci
   ```

3. Jalankan frontend:

   ```powershell
   npm run dev
   ```

4. Buka alamat yang ditampilkan Vite di terminal, biasanya <http://localhost:5173>.

Konfigurasi bawaan memakai mode `prototype`. Jika ingin terhubung ke backend, ubah `.env.local` menjadi seperti ini, lalu mulai ulang `npm run dev`:

```dotenv
VITE_AUTH_MODE=api
VITE_API_BASE_URL=http://localhost:8000
```

Jalankan backend Dokumen Kita secara terpisah sesuai petunjuk di proyek backend. Pastikan alamat `VITE_API_BASE_URL` sesuai dengan alamat backend yang sedang berjalan.

Untuk membuat versi siap dipasang, jalankan `npm run build`. Hasilnya berada di folder `dist/`.
