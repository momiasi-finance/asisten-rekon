# Asisten Rekon Bank (Accurate Online)

Bookmark untuk halaman **Kas & Bank › Rekonsiliasi Bank** di Accurate Online. Asisten mencocokkan
file mutasi bank dengan kartu jurnal di layar, mewarnai kartu, dan mencentang "Ada di Rekening Koran"
untuk pasangan yang pasti setelah disetujui pengguna.

Halaman pemasangan untuk tim: https://momiasi-finance.github.io/asisten-rekon/

## Isi repository

| File | Fungsi |
|---|---|
| `asisten-rekon.js` | Versi **resmi** yang dimuat bookmark tim. |
| `asisten-rekon-beta.js` | Versi **uji** (fitur baru dicoba di sini dulu). Dimuat bookmark beta milik penanggung jawab. |
| `index.html` | Halaman pemasangan + SOP singkat untuk tim. |
| `arsip/` | Versi lama, untuk dikembalikan bila ada masalah. |

## Cara kerja singkat

- Bookmark tim berisi pemuat pendek yang mengambil `asisten-rekon.js` dari alamat GitHub Pages ini setiap kali diklik.
- Asisten membaca kartu jurnal yang tampil di layar Accurate dan file mutasi yang dipilih pengguna. Semua diproses di browser; tidak ada data yang dikirim ke server mana pun.
- Satu-satunya tombol Accurate yang ditekan asisten adalah **"Ada di Rekening Koran"** pada kartu hijau, setelah pengguna mengonfirmasi. Sebelum setiap klik, asisten memeriksa ulang no. bukti dan nominal kartu; sesudahnya menunggu Accurate menandai kartu itu, dan berhenti total bila tidak terjadi.
- File Excel dibaca dengan SheetJS 0.18.5 dari cdnjs, dikunci dengan hash integritas.

## Aturan pencocokan

- **Hijau (pasti)**: nominal sama persis, tanggal ±3 hari, tidak ada kandidat lain, **dan** berita transfer menyebut nama/kata khas yang sama dengan keterangan jurnal (atau mutasi tanpa berita, mis. pembayaran VA). Nominal kembar boleh hijau bila hanya satu pasangan yang namanya cocok. Transfer BI-FAST + biaya 2.500 ke penerima yang sama dihitung sebagai satu.
- **Kuning (cek)**: nominal kembar, berita berbeda, transfer gabungan, setoran EDC/QRIS gabungan (berita "MID …"), bagian dari transfer massal (payroll/BPJS), atau beda tanggal hingga 14 hari. Diputuskan manusia.
- Sisa nominal transfer massal yang tidak terlihat jurnalnya **tidak** dianggap beres: dihitung sebagai pos rekonsiliasi tersendiri sampai jurnalnya ditemukan.
- Mutasi s.d. tanggal "Rekon mingguan terakhir" yang tidak punya pasangan di layar dianggap sudah direkon sebelumnya.

## Versi

| Versi | Isi |
|---|---|
| 1.2.3 (resmi) | Centang satu per satu, Muat semua kartu, cek rentang tanggal, kertas kerja CSV, berita transfer sebagai syarat hijau, deteksi pembatalan, setoran EDC/QRIS, sisa transfer massal dihitung. |
| 1.3.3-beta | Sama dengan 1.2.3 + "Centang semua hijau". Belum diuji di Accurate sungguhan; uji dulu di satu rekening sebelum dipindahkan ke versi resmi (ubah `BATCH = false` menjadi `true` di `asisten-rekon.js`). |
- Kata yang muncul di banyak transaksi bulan itu (mis. *Korset, Roro, Maternity, KOL*) tidak dihitung sebagai bukti kecocokan.

## Cara memperbarui

1. Uji dulu: upload versi baru sebagai `asisten-rekon-beta.js`, coba dengan bookmark beta di satu rekening.
2. Setelah yakin: simpan versi lama ke `arsip/`, upload versi baru sebagai `asisten-rekon.js`.
3. Tim cukup refresh tab Accurate; nomor versi tampil di judul panel.
4. Bila ada masalah: upload kembali file dari `arsip/` sebagai `asisten-rekon.js`.

## Keamanan akun GitHub

Kode di repository ini berjalan di sesi Accurate setiap anggota tim. Siapa pun yang bisa mengubah
`asisten-rekon.js` bisa mengubah perilaku asisten di Accurate tim. Karena itu:

- Aktifkan **verifikasi dua langkah (2FA)** di akun GitHub ini.
- Batasi siapa yang memegang akses akun.
- Jangan menerima perubahan kode dari pihak luar tanpa diperiksa.

## Bila Accurate mengubah tampilan

Asisten mengenali halaman dari class `bank-reconcile-content`, kartu `panelreconcilenotmatche`, dan tombol
`button[name="btnAddStatement"]`. Bila Accurate mengubah ini, asisten tidak menemukan kartu atau tombol
dan tidak mengklik apa pun. Perbaikannya: jalankan skrip pembaca struktur halaman di Console (lihat
riwayat pengembangan), lalu sesuaikan fungsi `readAccurate()`.
