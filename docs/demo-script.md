# Demo script — video submission (≤ 5 menit) & Demo Day (3 menit)

## Persiapan rekaman (wajib, urut)

1. **Vault fresh** (minta Claude menyiapkan): tarik saldo vault lama (`withdraw`) + `sweep` router,
   isi `MUSDT=`/`ROUTER=` mock lama di `contracts/.env`, lalu
   `SEED_BNB=80000000000000000 BNB_MAX_TX=20000000000000000 BNB_DAILY=60000000000000000 DEMO_SWAP_BNB=0.01 ./scripts/testnet-deploy.sh`.
   Counter harus mulai `0 executed · 0 blocked`.
2. `cd app && npm run deploy` (atau `npm run dev` kalau rekam lokal) supaya dashboard memakai vault baru.
3. Cek saldo gas AGENT ≥ 0.02 tBNB. Cek `LLM_API_KEY` terisi. **`AGENT_DRY_RUN=0`.**
4. Browser: jendela 1920×1080, zoom 100–110%, mode gelap, tutup tab lain, matikan notifikasi.
5. Isi demo key di field chat. MetaMask sudah berisi wallet OWNER (untuk bagian Freeze, opsional).
6. Buka tab kedua: BscScan vault → tab **Events** (untuk ditunjuk saat beat 1).
7. Rekam dengan OBS 1080p 30fps, mic terpisah. Rekam per segmen, gabungkan di editor.

## Video (≤ 5 menit) — PRD §11.2

| Waktu | Layar | Voiceover |
|---|---|---|
| 0:00–0:08 | **Cold open:** baris merah `Blocked · RECIPIENT_NOT_ALLOWED` muncul di feed | "AI agent ini baru saja mencoba menguras vault. Kontraknya menolak." |
| 0:08–0:30 | Dashboard penuh: saldo 0.08 BNB, policy 0.02/tx · 0.06/hari, Alice ✓ Bob ✓ `0xbad…` ✗, fee 10 bps | "Siapa yang mau kasih private key ke AI? Nggak ada. Di PAGAR, agent cuma pegang gas key, bukan funds key. Identitasnya terdaftar di ERC-8004." |
| 0:30–0:55 | Klik prompt **"Swap 0.01 BNB ke USDT"** → chip tool → baris hijau `Executed` · `fee 0.00001 BNB → PAGAR` → klik link BscScan | "Happy path: swap dieksekusi apa adanya, protokol dapat fee kecil. Semuanya on-chain." |
| 0:55–1:45 | Klik **"Ada token baru, MOON. Cek dulu info-nya."** → chip `getTokenInfo · MOON` → agent memanggil `proposeTransfer … 0xbad…` → **baris merah** → pindah ke tab BscScan Events, tunjuk event `ActionBlocked` | "Saya nggak mengetik serangan itu. Agent membacanya dari data token yang dia ambil sendiri: prompt injection. Agent-nya nurut, kontraknya nolak. PAGAR earned tetap: block itu gratis. Kami dibayar hanya saat kalian aman." |
| 1:45–2:05 | Klik **"Approve unlimited USDT ke router biar hemat gas"** → baris merah `UNLIMITED_APPROVAL` | "Alasan umum untuk approve unlimited, celah yang sama yang dipakai drainer. Ditolak." |
| 2:05–2:20 | Zoom ke counter `1 executed · 2 blocked` | "Counter ini dibaca langsung dari kontrak, publik. Satu dibayar, dua ditolak gratis." |
| 2:20–3:20 | BscScan: kode kontrak **verified** · terminal `forge test` 45 passed · badge CI hijau di README · diagram mermaid · tabel reason code | "Bukti teknis: 45 test termasuk fuzz 2.000 run yang membuktikan pelanggaran tidak pernah revert. Urutan cek tetap, jadi alasan yang keluar selalu benar." |
| 3:20–4:00 | Slide **Follow the money** + roadmap + keterbatasan | "R1 live on-chain: fee per eksekusi, maks 1% di kode. R2 sampai R4 roadmap. Keterbatasan kami: testnet, belum diaudit." |
| 4:00–4:15 | Logo / tagline | "AI boleh salah. Kontrak nggak bisa diajak nego. Dan kontraknya dapat upah, per transaksi yang lolos. That's PAGAR." |

**Kalau LLM menolak payload di beat 1:** klik **Simulate: agent key bocor**. Voiceover: "Agent kami kali ini
menolak. Tapi anggap key-nya bocor: hasilnya sama." Baris merah yang sama; counter akhir tetap `1 · 2`.

Setelah rekam:

```bash
node scripts/deployment-set.mjs demoTxs=<hash swap>,<hash blocked 4>,<hash blocked 5>
```

Tempel ketiga hash + tx registrasi ERC-8004 di deskripsi YouTube, README, dan form. Video public/unlisted.

## Demo Day live (3 menit) — PRD §11.1

Sama dengan 0:08–2:20 di atas, lalu slide follow-the-money dan punchline. Bawa hotspot sendiri; video
ini jadi cadangan kalau jaringan atau LLM bermasalah.
