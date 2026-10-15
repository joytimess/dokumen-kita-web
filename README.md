# Dokumen Kita

Dokumen Kita adalah aplikasi untuk menyiapkan dokumen dan mengelola proses persetujuannya dalam satu tempat. Pengguna dapat membuat dan menyunting draft, mengatur penerima serta urutan tanda tangan, membaca dokumen, lalu mengikuti status prosesnya. Proyek ini adalah **bagian frontend**: tampilan yang dibuka pengguna di browser. Data akun, dokumen, dan proses tanda tangan berasal dari backend Dokumen Kita melalui API.

## Gambaran arsitektur

Frontend dibuat sebagai aplikasi Vue yang berpindah halaman tanpa memuat ulang seluruh situs. Halaman seperti beranda, masuk, daftar, daftar dokumen, editor, dan pembaca PDF berada di proyek ini. Saat membutuhkan data atau menyimpan perubahan, frontend mengirim permintaan ke backend Laravel melalui API. Backend menangani akun, penyimpanan dokumen, dan aturan proses persetujuan.

Secara sederhana, alurnya adalah **browser → frontend Vue → API Laravel**. Sesi masuk memakai cookie dari Laravel Sanctum. Frontend menyimpan informasi pengguna yang sedang aktif sementara di Pinia, sedangkan sesi yang berlaku tetap ditentukan oleh backend.

## Teknologi dan library utama

| Teknologi | Digunakan untuk |
| --- | --- |
| Vue 3 dan TypeScript | Membangun tampilan dan membantu menjaga struktur kode. |
| Vite | Menjalankan server pengembangan dan membuat hasil build. |
| Vue Router | Mengatur perpindahan halaman. |
| Pinia | Menyimpan keadaan aplikasi, termasuk informasi pengguna aktif. |
| Axios | Mengirim permintaan HTTP ke API backend. |
| Tailwind CSS | Mengatur tampilan dan tata letak. |
| Editor.js | Menyunting isi draft dokumen. |
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
