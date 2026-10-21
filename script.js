(function () {
    "use strict";

    /* =========================================================
       FEED-MATRIX - script.js
       Cocok dengan index.html + style.css versi terbaru
       ========================================================= */

    var KEY = "feedmatrix.records.v3";
    var TKEY = "feedmatrix.threshold.v1";
    var DEFAULT_THRESHOLD = 5; // persen
    var TEMP_LIMIT = 32;       // °C, batas suhu kandang panas (Live Kandang)

    var $ = function (id) {
        return document.getElementById(id);
    };

    /* ---------- Format angka ---------- */
    function num(n, d) {
        return Number(n).toLocaleString("id-ID", {
            minimumFractionDigits: d,
            maximumFractionDigits: d
        });
    }
    function rp(n) {
        return "Rp " + Math.round(n).toLocaleString("id-ID");
    }
    function kg(n) {
        return num(n, 1) + " kg";
    }
    function pctSigned(n) {
        return (n > 0 ? "+" : "") + num(n, 2) + "%";
    }
    function fcrText(f) {
        return f === null || f === undefined ? "—" : num(f, 2);
    }
    function todayISO() {
        var d = new Date();
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        return d.toISOString().slice(0, 10);
    }
    function isNum(v) {
        return typeof v === "number" && isFinite(v);
    }
    function isHot(x) {
        return isNum(x.suhu) && x.suhu > TEMP_LIMIT;
    }
    // Baca angka opsional dari input: kosong -> null
    function parseOpt(id) {
        var v = $(id).value;
        if (v === "") return null;
        var n = parseFloat(v);
        return isFinite(n) ? n : null;
    }
    function dmy(iso) {
        var p = String(iso).split("-");
        return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : iso;
    }

    /* ---------- Penyimpanan (LocalStorage) ---------- */
    function load() {
        try {
            var d = JSON.parse(localStorage.getItem(KEY));
            return Array.isArray(d) ? d : [];
        } catch (e) {
            return [];
        }
    }
    function store() {
        try {
            localStorage.setItem(KEY, JSON.stringify(memory));
        } catch (e) {}
    }

    var memory = load();
    var feedChart = null;
    var eduChart = null;

    /* ---------- Ambang deviasi ----------
       Jika ada <input id="ambang"> di HTML, nilainya dipakai.
       Jika tidak ada, dipakai nilai simpanan / default 5%. */
    function getThreshold() {
        var el = $("ambang");
        if (el) {
            var v = parseFloat(el.value);
            if (v > 0) return v;
        }
        try {
            var s = parseFloat(localStorage.getItem(TKEY));
            if (s > 0) return s;
        } catch (e) {}
        return DEFAULT_THRESHOLD;
    }

    /* ---------- Perhitungan ----------
       Konsumsi bersih = realisasi - sisa
       Deviasi (kg)    = konsumsi bersih - rencana
       Deviasi (%)     = deviasi / rencana x 100
       Pertambahan biomassa = ayam x (bobot - bobot sebelumnya)
       FCR             = konsumsi bersih / pertambahan biomassa
       Biaya           = konsumsi bersih x harga */
    function calc() {
        var ayam = parseInt($("jumlah-ayam").value, 10) || 0;
        var bobot = parseFloat($("bobot").value) || 0;
        var bobotPrev = parseFloat($("bobot-sebelumnya").value) || 0;
        var rencana = parseFloat($("rencana").value) || 0;
        var realisasi = parseFloat($("realisasi").value) || 0;
        var sisa = parseFloat($("sisa").value) || 0;
        var harga = parseFloat($("harga").value) || 0;

        var nett = Math.max(0, realisasi - sisa);
        var dev = nett - rencana;
        var devPct = rencana > 0 ? (dev / rencana) * 100 : 0;
        var gain = ayam * (bobot - bobotPrev); // kg biomassa
        var fcr = gain > 0 ? nett / gain : null;

        return {
            ayam: ayam,
            bobot: bobot,
            bobotPrev: bobotPrev,
            rencana: rencana,
            realisasi: realisasi,
            sisa: sisa,
            harga: harga,
            nett: nett,
            dev: dev,
            devPct: devPct,
            gain: gain,
            fcr: fcr,
            cost: nett * harga
        };
    }

    /* ---------- Live Kandang: baca input lingkungan ---------- */
    function readEnv() {
        var env = {
            lokasi: $("lokasi").value.trim(),
            suhu: parseOpt("suhu"),
            lembab: parseOpt("kelembaban"),
            amonia: parseOpt("amonia"),
            cctv: $("cctv").value === "offline" ? "offline" : "aktif",
            error: ""
        };
        if (env.suhu !== null && (env.suhu < 0 || env.suhu > 60)) {
            env.error = "Suhu kandang harus antara 0 dan 60 °C.";
        } else if (env.lembab !== null && (env.lembab < 0 || env.lembab > 100)) {
            env.error = "Kelembaban harus antara 0 dan 100%.";
        } else if (env.amonia !== null && env.amonia < 0) {
            env.error = "Kadar amonia tidak boleh negatif.";
        }
        return env;
    }

    function previewEnv() {
        var e = readEnv();
        $("hasil-lokasi").textContent = e.lokasi || "—";
        $("hasil-suhu").textContent = e.suhu === null ? "— °C" : num(e.suhu, 1) + " °C";
        $("hasil-kelembaban").textContent = e.lembab === null ? "—%" : num(e.lembab, 1) + "%";
        $("hasil-amonia").textContent = e.amonia === null ? "— ppm" : num(e.amonia, 1) + " ppm";

        var st = $("hasil-status-suhu");
        if (e.suhu === null) {
            st.textContent = "—";
            st.style.color = "";
        } else if (e.suhu > TEMP_LIMIT) {
            st.textContent = "PANAS (>" + TEMP_LIMIT + "°C)";
            st.style.color = "#b42323";
        } else {
            st.textContent = "Normal";
            st.style.color = "";
        }
    }

    function preview() {
        previewEnv();
        var kosong = $("rencana").value === "" && $("realisasi").value === "";
        if (kosong) {
            $("hasil-konsumsi").textContent = "— kg";
            $("hasil-deviasi").textContent = "— kg";
            $("hasil-persentase").textContent = "—%";
            $("hasil-fcr").textContent = "—";
            $("hasil-biaya").textContent = "Rp —";
            return;
        }
        var c = calc();
        $("hasil-konsumsi").textContent = kg(c.nett);
        $("hasil-deviasi").textContent = (c.dev > 0 ? "+" : "") + kg(c.dev);
        $("hasil-persentase").textContent = pctSigned(c.devPct);
        $("hasil-fcr").textContent = fcrText(c.fcr);
        $("hasil-biaya").textContent = rp(c.cost);
    }

    /* ---------- Grafik utama ---------- */
    function initChart() {
        var canvas = $("feedChart");
        if (!canvas || typeof Chart === "undefined") return;

        feedChart = new Chart(canvas.getContext("2d"), {
            type: "line",
            data: {
                labels: [],
                datasets: [
                    {
                        label: "Rencana (kg)",
                        data: [],
                        borderColor: "#5d6e63",
                        borderDash: [5, 5],
                        pointRadius: 2,
                        fill: false,
                        tension: 0.25
                    },
                    {
                        label: "Konsumsi Bersih (kg)",
                        data: [],
                        borderColor: "#1f4d34",
                        backgroundColor: "rgba(31, 77, 52, 0.10)",
                        pointRadius: 3,
                        fill: true,
                        tension: 0.25
                    },
                    {
                        label: "FCR",
                        data: [],
                        borderColor: "#d9a21b",
                        yAxisID: "yFCR",
                        pointRadius: 3,
                        spanGaps: true,
                        fill: false,
                        tension: 0.25
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                scales: {
                    x: { title: { display: true, text: "Tanggal" } },
                    y: {
                        title: { display: true, text: "Pakan (kg)" },
                        beginAtZero: true
                    },
                    yFCR: {
                        type: "linear",
                        position: "right",
                        title: { display: true, text: "FCR" },
                        grid: { drawOnChartArea: false }
                    }
                }
            }
        });
    }

    function updateChart() {
        if (!feedChart) return;
        var sorted = memory.slice().sort(function (a, b) {
            return a.tgl < b.tgl ? -1 : a.tgl > b.tgl ? 1 : a.umur - b.umur;
        });
        feedChart.data.labels = sorted.map(function (x) {
            return dmy(x.tgl) + " (H" + x.umur + ")";
        });
        feedChart.data.datasets[0].data = sorted.map(function (x) {
            return x.rencana;
        });
        feedChart.data.datasets[1].data = sorted.map(function (x) {
            return x.nett;
        });
        feedChart.data.datasets[2].data = sorted.map(function (x) {
            return x.fcr;
        });
        feedChart.update();
    }

    /* ---------- Grafik edukasi (kurva standar, ilustrasi) ----------
       Nilai di bawah hanya contoh pendekatan (gram/ekor/hari).
       Ganti dengan tabel resmi strain yang Anda pakai
       (mis. Ross 308 / Cobb 500). */
    function initEduChart() {
        var canvas = $("eduChart");
        if (!canvas || typeof Chart === "undefined") return;

        var hari = [0, 7, 14, 21, 28, 35, 42];
        var intake = [0, 25, 65, 105, 150, 185, 210];

        eduChart = new Chart(canvas.getContext("2d"), {
            type: "line",
            data: {
                labels: hari,
                datasets: [
                    {
                        label: "Konsumsi standar (g/ekor/hari) - ilustrasi",
                        data: intake,
                        borderColor: "#1f4d34",
                        backgroundColor: "rgba(31, 77, 52, 0.10)",
                        fill: true,
                        tension: 0.3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { title: { display: true, text: "Umur (hari)" } },
                    y: {
                        title: { display: true, text: "g/ekor/hari" },
                        beginAtZero: true
                    }
                }
            }
        });
    }

    /* ---------- Helper DOM ---------- */
    function td(text, cls) {
        var c = document.createElement("td");
        c.textContent = text;
        if (cls) c.className = cls;
        return c;
    }
    function emptyRow(tbody, cols, text) {
        var tr = document.createElement("tr");
        var c = document.createElement("td");
        c.colSpan = cols;
        c.textContent = text;
        tr.appendChild(c);
        tbody.appendChild(tr);
    }

    /* ---------- Render dashboard + tabel ---------- */
    function render(lastRec) {
        var thr = getThreshold();
        var filter = $("filter-tanggal") ? $("filter-tanggal").value : "";
        var tbody = $("tabel-riwayat");
        tbody.innerHTML = "";

        // Statistik semua data
        var totalCost = 0;
        var sumAbsPct = 0;
        var bad = 0;      // data dengan deviasi pakan > ambang
        var hot = 0;      // data dengan suhu kandang > 32°C
        var flagged = 0;  // data yang menyimpang (deviasi ATAU suhu panas)
        var sumNett = 0;
        var sumGain = 0;
        var sumSuhu = 0, nSuhu = 0;
        var sumAmonia = 0, nAmonia = 0;

        memory.forEach(function (x) {
            var devBad = Math.abs(x.devPct) > thr;
            totalCost += x.cost;
            sumAbsPct += Math.abs(x.devPct);
            sumNett += x.nett;
            if (x.gain > 0) sumGain += x.gain;
            if (devBad) bad++;
            if (isHot(x)) hot++;
            if (devBad || isHot(x)) flagged++;
            if (isNum(x.suhu)) { sumSuhu += x.suhu; nSuhu++; }
            if (isNum(x.amonia)) { sumAmonia += x.amonia; nAmonia++; }
        });

        var n = memory.length;
        var avgAbs = n ? sumAbsPct / n : 0;
        var fcrKum = sumGain > 0 ? sumNett / sumGain : null;

        $("total-biaya").textContent = n ? rp(totalCost) : "Rp —";
        $("fcr-kumulatif").textContent = fcrText(fcrKum);
        $("deviasi-rata-rata").textContent = n ? num(avgAbs, 2) + "%" : "—%";
        $("jumlah-menyimpang").textContent = flagged;

        // Kartu statistik Live Kandang
        var avgSuhu = nSuhu ? sumSuhu / nSuhu : null;
        $("suhu-rata-rata").textContent = avgSuhu === null ? "— °C" : num(avgSuhu, 1) + " °C";
        $("suhu-rata-rata").classList.toggle("is-hot", avgSuhu !== null && avgSuhu > TEMP_LIMIT);
        $("suhu-keterangan").textContent = hot
            ? hot + " catatan melebihi " + TEMP_LIMIT + " °C"
            : "Batas aman ≤ " + TEMP_LIMIT + " °C";

        var lastAmonia = null;
        memory.slice().sort(function (a, b) {
            return a.tgl < b.tgl ? -1 : a.tgl > b.tgl ? 1 : a.umur - b.umur;
        }).forEach(function (x) {
            if (isNum(x.amonia)) lastAmonia = x.amonia;
        });
        $("amonia-rata-rata").textContent = nAmonia ? num(sumAmonia / nAmonia, 1) + " ppm" : "— ppm";
        $("amonia-keterangan").textContent = lastAmonia === null
            ? "Rata-rata data tersimpan"
            : "Rata-rata; terakhir " + num(lastAmonia, 1) + " ppm";

        // Tabel (terbaru di atas, bisa difilter tanggal)
        var rows = memory
            .filter(function (x) {
                return !filter || x.tgl === filter;
            })
            .sort(function (a, b) {
                return a.tgl < b.tgl ? 1 : a.tgl > b.tgl ? -1 : b.umur - a.umur;
            });

        if (!rows.length) {
            emptyRow(
                tbody,
                11,
                n ? "Tidak ada data pada tanggal tersebut." : "Belum ada data monitoring."
            );
        }

        rows.forEach(function (x) {
            var isBad = Math.abs(x.devPct) > thr;
            var tr = document.createElement("tr");

            tr.appendChild(td(dmy(x.tgl)));
            tr.appendChild(td("Hari " + x.umur));
            tr.appendChild(td(x.ayam.toLocaleString("id-ID")));
            tr.appendChild(td(x.lokasi ? x.lokasi : "—"));
            tr.appendChild(td(isNum(x.suhu) ? num(x.suhu, 1) + " °C" : "—", isHot(x) ? "cell-hot" : ""));
            tr.appendChild(td(kg(x.nett)));
            tr.appendChild(td(fcrText(x.fcr)));
            tr.appendChild(td(pctSigned(x.devPct)));
            tr.appendChild(td(rp(x.cost)));

            var tdStatus = document.createElement("td");
            var tag = document.createElement("span");
            var hotRow = isHot(x);
            tag.className = "status " + (isBad ? "status-danger" : hotRow ? "status-warning" : "status-normal");
            tag.textContent = isBad && hotRow ? "Menyimpang + Panas"
                : isBad ? "Menyimpang"
                : hotRow ? "Suhu Panas"
                : "Normal";
            tdStatus.appendChild(tag);
            tr.appendChild(tdStatus);

            var tdAksi = document.createElement("td");
            var wrap = document.createElement("div");
            wrap.className = "action-buttons";
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "btn-small";
            btn.textContent = "Hapus";
            btn.setAttribute("data-id", x.id);
            wrap.appendChild(btn);
            tdAksi.appendChild(wrap);
            tr.appendChild(tdAksi);

            tbody.appendChild(tr);
        });

        // Peringatan sistem (terintegrasi: deviasi pakan + suhu kandang)
        renderAlert(lastRec, thr, n, bad, hot);
        renderLive();
        if (typeof renderMarket === "function" && $("market-grid")) renderMarket();

        updateChart();
    }

    /* ---------- Peringatan terintegrasi ----------
       Mengecek deviasi pakan (> ambang) dan suhu kandang (> 32°C)
       sekaligus, lalu menampilkan semua temuan sebagai baris pesan. */
    function renderAlert(lastRec, thr, n, bad, hot) {
        var pesan = $("pesan-peringatan");
        var lines = [];

        if (lastRec) {
            var over = Math.abs(lastRec.devPct) > thr;
            var panas = isHot(lastRec);

            if (over) {
                lines.push({
                    type: "danger",
                    text: "FEED-MATRIX mendeteksi ketidaksesuaian pakan (umur " +
                        lastRec.umur + " hari): deviasi " + pctSigned(lastRec.devPct) +
                        " melebihi ambang ±" + num(thr, 1) + "%. Periksa pencatatan, " +
                        "pemborosan, atau kebocoran pakan."
                });
            } else {
                lines.push({
                    type: "ok",
                    text: "Deviasi " + pctSigned(lastRec.devPct) +
                        " masih dalam ambang toleransi ±" + num(thr, 1) + "%. Data tersimpan."
                });
            }

            if (panas) {
                lines.push({
                    type: "danger",
                    text: "⚠️ Peringatan Suhu Kandang Panas (>" + TEMP_LIMIT + "°C)! " +
                        "Pakan berpotensi tersisa karena ayam stres termal. " +
                        "(Suhu tercatat: " + num(lastRec.suhu, 1) + " °C)"
                });
            }

            if (over && panas) {
                lines.push({
                    type: "danger",
                    text: "Peringatan terintegrasi: deviasi pakan terjadi bersamaan dengan " +
                        "suhu kandang panas. Pertimbangkan stres termal sebagai penyebab " +
                        "sebelum menyimpulkan pemborosan atau kebocoran pakan."
                });
            }
        } else if (!n) {
            lines.push({
                type: "info",
                text: "Belum ada evaluasi data. Masukkan data monitoring untuk memulai."
            });
        } else {
            if (bad) {
                lines.push({
                    type: "danger",
                    text: "Terdapat " + bad + " data yang menyimpang dari toleransi ±" +
                        num(thr, 1) + "%."
                });
            }
            if (hot) {
                lines.push({
                    type: "danger",
                    text: "⚠️ Terdapat " + hot + " data dengan suhu kandang panas (>" +
                        TEMP_LIMIT + "°C). Pakan berpotensi tersisa karena ayam stres termal."
                });
            }
            if (!bad && !hot) {
                lines.push({
                    type: "ok",
                    text: "Semua data masih dalam toleransi ±" + num(thr, 1) +
                        "% dan suhu kandang aman."
                });
            }
        }

        var anyDanger = lines.some(function (l) { return l.type === "danger"; });
        var anyOk = lines.some(function (l) { return l.type === "ok"; });
        pesan.className = !n && !lastRec ? "" : anyDanger ? "alert-danger" : anyOk ? "alert-success" : "";

        pesan.textContent = "";
        lines.forEach(function (l) {
            var span = document.createElement("span");
            span.className = "alert-line " + l.type;
            span.textContent = l.text;
            pesan.appendChild(span);
        });
    }

    /* ---------- Live Kandang (mockup CCTV) ---------- */
    function latestRecord() {
        if (!memory.length) return null;
        return memory.slice().sort(function (a, b) {
            return a.tgl < b.tgl ? -1 : a.tgl > b.tgl ? 1 : a.umur - b.umur;
        })[memory.length - 1];
    }

    function initLiveFloor() {
        var floor = $("live-floor");
        if (!floor) return;
        floor.innerHTML = "";
        for (var i = 0; i < 16; i++) {
            var c = document.createElement("span");
            c.className = "chick";
            c.style.left = (4 + Math.random() * 84) + "%";
            c.style.top = (6 + Math.random() * 80) + "%";
            c.style.setProperty("--dx", (Math.random() * 60 - 30).toFixed(0) + "px");
            c.style.setProperty("--dy", (Math.random() * 30 - 15).toFixed(0) + "px");
            c.style.setProperty("--d", (4 + Math.random() * 6).toFixed(1) + "s");
            c.style.setProperty("--delay", (-Math.random() * 6).toFixed(1) + "s");
            floor.appendChild(c);
        }
    }

    /* Sumber tampilan layar: video contoh, foto contoh, simulasi, atau unggahan */
    var liveUrl = null;

    function setLiveSource(mode, fileUrl, kind) {
        var screen = $("live-screen");
        var vid = $("live-video");
        var pic = $("live-photo");
        if (!screen || !vid || !pic) return;

        var showVideo = mode === "video" || (mode === "upload" && kind === "video");
        var showPhoto = mode === "foto" || (mode === "upload" && kind === "image");

        if (mode === "video") vid.src = "cctv-sample.mp4";
        if (mode === "foto") pic.src = "cctv-sample.jpg";
        if (mode === "upload") {
            if (liveUrl) URL.revokeObjectURL(liveUrl);
            liveUrl = fileUrl;
            if (kind === "video") vid.src = fileUrl;
            else pic.src = fileUrl;
        }

        vid.hidden = !showVideo;
        pic.hidden = !showPhoto;
        screen.classList.toggle("src-sim", mode === "simulasi");

        if (showVideo) {
            var p = vid.play();
            if (p && p.catch) p.catch(function () {});
        } else {
            vid.pause();
        }

        var btns = document.querySelectorAll ? document.querySelectorAll(".live-src-btn") : [];
        Array.prototype.forEach.call(btns, function (b) {
            b.classList.toggle("active", b.getAttribute("data-src") === mode);
        });
    }

    function initLiveSource() {
        var box = $("live-source");
        if (!box) return;
        box.addEventListener("click", function (e) {
            var b = e.target.closest(".live-src-btn");
            if (!b) return;
            setLiveSource(b.getAttribute("data-src"));
        });
        $("live-file").addEventListener("change", function () {
            var f = this.files && this.files[0];
            if (!f) return;
            var kind = f.type.indexOf("video/") === 0 ? "video"
                     : f.type.indexOf("image/") === 0 ? "image" : "";
            if (!kind) {
                alert("Pilih file foto atau video.");
                return;
            }
            setLiveSource("upload", URL.createObjectURL(f), kind);
            this.value = "";
        });
    }

    function tickClock() {
        var el = $("live-clock");
        if (!el) return;
        el.textContent = dmy(todayISO()) + " " + new Date().toTimeString().slice(0, 8);
    }

    function renderLive() {
        var screen = $("live-screen");
        if (!screen) return;

        var rec = latestRecord();
        var badge = $("live-badge");
        var offline = !!rec && rec.cctv === "offline";
        var panas = !!rec && isHot(rec);

        screen.classList.toggle("is-standby", !rec);
        screen.classList.toggle("is-offline", offline);
        screen.classList.toggle("is-hot", !!rec && !offline && panas);

        badge.className = "live-badge";
        if (!rec) {
            badge.textContent = "CONTOH";
            badge.classList.add("is-standby");
            $("live-nosignal-text").textContent = "Belum ada data kandang";
        } else if (offline) {
            badge.textContent = "OFFLINE";
            badge.classList.add("is-offline");
            $("live-nosignal-text").textContent = "Kamera tidak aktif";
        } else if (panas) {
            badge.textContent = "● LIVE · SUHU PANAS";
            badge.classList.add("is-hot");
        } else {
            badge.textContent = "● LIVE";
            badge.classList.add("is-live");
        }

        $("live-lokasi").textContent = rec
            ? "📍 " + (rec.lokasi || "Lokasi belum diisi") + " · data " + dmy(rec.tgl)
            : "📍 Lokasi belum diisi";

        $("live-suhu").textContent = rec && isNum(rec.suhu) ? num(rec.suhu, 1) + " °C" : "— °C";
        $("live-lembab").textContent = rec && isNum(rec.lembab) ? num(rec.lembab, 1) + "%" : "—%";
        $("live-amonia").textContent = rec && isNum(rec.amonia) ? num(rec.amonia, 1) + " ppm" : "— ppm";
        $("live-m-suhu").classList.toggle("is-hot", panas);
    }

    /* ---------- Direktori supplier (data contoh) ----------
       Data ini hanya contoh. Isi dengan data/harga yang sudah
       Anda verifikasi sendiri. */
    var SUPPLIERS = [
        { nama: "PT. Charoen Pokphand", lokasi: "Makassar", produk: "CP 511, CP 512", harga: 8200, kontak: "" },
        { nama: "PT. Japfa Comfeed", lokasi: "Gowa", produk: "Comfeed 21, 22", harga: 8100, kontak: "" },
        { nama: "PT. Malindo Feedmill", lokasi: "Maros", produk: "Malindo 511, 512", harga: 8000, kontak: "" },
        { nama: "PT. New Hope Indonesia", lokasi: "Makassar", produk: "NH 511, NH 512", harga: 8300, kontak: "" }
    ];

    function renderSuppliers() {
        var tbody = $("tabel-supplier");
        if (!tbody) return;
        tbody.innerHTML = "";
        if (!SUPPLIERS.length) {
            emptyRow(tbody, 5, "Data supplier belum ditambahkan.");
            return;
        }
        SUPPLIERS.forEach(function (s) {
            var tr = document.createElement("tr");
            tr.appendChild(td(s.nama));
            tr.appendChild(td(s.lokasi));
            tr.appendChild(td(s.produk));
            tr.appendChild(td(s.harga.toLocaleString("id-ID")));

            var tdK = document.createElement("td");
            if (s.kontak) {
                var a = document.createElement("a");
                a.href = "https://wa.me/" + s.kontak; // format: 628xxxxxxxxxx
                a.target = "_blank";
                a.rel = "noopener";
                a.textContent = "WhatsApp";
                tdK.appendChild(a);
            } else {
                tdK.textContent = "—";
            }
            tr.appendChild(tdK);
            tbody.appendChild(tr);
        });
    }

    /* ---------- Export CSV ---------- */
    // Kutip sel yang mengandung koma, tanda kutip, atau baris baru
    function csvCell(v) {
        if (v === null || v === undefined) return "";
        var t = String(v);
        return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    }
    // Cegah teks bebas dibaca sebagai rumus oleh Excel
    function csvText(v) {
        var t = v ? String(v) : "";
        return /^[=+\-@]/.test(t) ? "'" + t : t;
    }

    function exportCSV() {
        if (!memory.length) {
            alert("Belum ada data untuk diekspor.");
            return;
        }
        var header = [
            "Tanggal", "Umur (hari)", "Jumlah Ayam", "Bobot (kg)",
            "Bobot Sebelumnya (kg)", "Rencana (kg)", "Realisasi (kg)",
            "Sisa (kg)", "Konsumsi Bersih (kg)", "Deviasi (kg)",
            "Deviasi (%)", "FCR", "Harga (Rp/kg)", "Biaya (Rp)",
            "Lokasi", "Suhu Kandang (°C)", "Kelembaban (%)",
            "Kadar Amonia (ppm)", "Status CCTV"
        ];
        var lines = [header.map(csvCell).join(",")];

        memory
            .slice()
            .sort(function (a, b) {
                return a.tgl < b.tgl ? -1 : a.tgl > b.tgl ? 1 : a.umur - b.umur;
            })
            .forEach(function (x) {
                lines.push(
                    [
                        x.tgl, x.umur, x.ayam, x.bobot, x.bobotPrev,
                        x.rencana, x.realisasi, x.sisa, x.nett,
                        x.dev.toFixed(2), x.devPct.toFixed(2),
                        x.fcr === null ? "" : x.fcr.toFixed(2),
                        x.harga, Math.round(x.cost),
                        csvText(x.lokasi),
                        isNum(x.suhu) ? x.suhu : "",
                        isNum(x.lembab) ? x.lembab : "",
                        isNum(x.amonia) ? x.amonia : "",
                        x.cctv === "offline" ? "Offline" : "Aktif"
                    ].map(csvCell).join(",")
                );
            });

        // \uFEFF = BOM agar Excel membaca UTF-8 dengan benar
        var blob = new Blob(["\uFEFF" + lines.join("\n")], {
            type: "text/csv;charset=utf-8;"
        });
        var url = URL.createObjectURL(blob);
        var link = document.createElement("a");
        link.href = url;
        link.download = "FeedMatrix_Data_Pakan.csv";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    /* ---------- Event: simpan data ---------- */
    $("feed-form").addEventListener("submit", function (e) {
        e.preventDefault();

        var tgl = $("tanggal").value;
        var umur = parseInt($("umur").value, 10);
        var c = calc();

        if (!tgl || !umur || umur < 1 || c.ayam < 1) {
            alert("Isi tanggal, umur ayam, dan jumlah ayam dengan benar.");
            return;
        }
        if (c.rencana <= 0) {
            alert("Rencana pakan harus lebih dari 0 kg.");
            return;
        }
        if (c.bobot <= 0 || c.bobot < c.bobotPrev) {
            alert("Bobot rata-rata harus lebih dari 0 dan tidak boleh lebih kecil dari bobot sebelumnya.");
            return;
        }
        if (c.sisa > c.realisasi) {
            alert("Sisa pakan tidak boleh lebih besar dari realisasi pakan.");
            return;
        }

        var env = readEnv();
        if (env.error) {
            alert(env.error);
            return;
        }

        var rec = {
            id: Date.now() + "-" + Math.floor(Math.random() * 1000),
            tgl: tgl,
            umur: umur,
            ayam: c.ayam,
            bobot: c.bobot,
            bobotPrev: c.bobotPrev,
            rencana: c.rencana,
            realisasi: c.realisasi,
            sisa: c.sisa,
            nett: c.nett,
            dev: c.dev,
            devPct: c.devPct,
            gain: c.gain,
            fcr: c.fcr,
            harga: c.harga,
            cost: c.cost,
            // Live Kandang
            lokasi: env.lokasi,
            suhu: env.suhu,
            lembab: env.lembab,
            amonia: env.amonia,
            cctv: env.cctv
        };

        memory.push(rec);
        store();
        render(rec);
    });

    /* ---------- Event: reset form ---------- */
    $("feed-form").addEventListener("reset", function () {
        // tunggu form benar-benar kosong, lalu isi ulang default
        setTimeout(function () {
            $("tanggal").value = todayISO();
            $("sisa").value = 0;
            preview();
        }, 0);
    });

    /* ---------- Event: preview realtime ---------- */
    [
        "jumlah-ayam", "bobot", "bobot-sebelumnya",
        "rencana", "realisasi", "sisa", "harga",
        "lokasi", "suhu", "kelembaban", "amonia", "cctv"
    ].forEach(function (id) {
        $(id).addEventListener("input", preview);
    });

    /* ---------- Event: hapus satu data ---------- */
    $("tabel-riwayat").addEventListener("click", function (e) {
        var btn = e.target.closest("button[data-id]");
        if (!btn) return;
        if (!confirm("Hapus data ini?")) return;
        var id = btn.getAttribute("data-id");
        memory = memory.filter(function (x) {
            return x.id !== id;
        });
        store();
        render(null);
    });

    /* ---------- Event: filter, ambang, export ---------- */
    if ($("filter-tanggal")) {
        $("filter-tanggal").addEventListener("input", function () {
            render(null);
        });
    }

    if ($("ambang")) {
        try {
            var savedT = localStorage.getItem(TKEY);
            if (savedT) $("ambang").value = savedT;
        } catch (e) {}
        $("ambang").addEventListener("input", function () {
            try {
                localStorage.setItem(TKEY, $("ambang").value);
            } catch (e) {}
            render(null);
        });
    }

    $("export-csv").addEventListener("click", exportCSV);

    /* =========================================================
       MARKETPLACE TERINTEGRASI (Fitur Baru C)
       - Beli Pakan: diambil dari daftar SUPPLIERS (Direktori Pakan)
       - Jual Ayam Panen & Jual Pupuk Organik: contoh + listing sendiri
       - Pesanan & listing sendiri disimpan di LocalStorage (simulasi)
       ========================================================= */
    var MKEY = "feedmatrix.market.v1";
    var OKEY = "feedmatrix.orders.v1";

    var MARKET_SAMPLES = [
        { id: "ayam-1", kat: "ayam", nama: "Ayam Broiler Panen (hidup), umur 33 hari",
          penjual: "Kandang Berkah Maju", lokasi: "Gowa", harga: 21500, hargaTengkulak: 23000,
          stok: 1800, minOrder: 100, catatan: "Bobot rata-rata ±1,8 kg/ekor", kontak: "" },
        { id: "ayam-2", kat: "ayam", nama: "Ayam Broiler Panen (hidup), umur 35 hari",
          penjual: "Peternakan Sumber Rejeki", lokasi: "Maros", harga: 21000, hargaTengkulak: 22500,
          stok: 2400, minOrder: 200, catatan: "Bobot rata-rata ±2,0 kg/ekor", kontak: "" },
        { id: "ayam-3", kat: "ayam", nama: "Ayam Broiler Panen (hidup), umur 34 hari",
          penjual: "Kandang Tani Mandiri", lokasi: "Takalar", harga: 20800, hargaTengkulak: 22300,
          stok: 1200, minOrder: 100, catatan: "Bobot rata-rata ±1,9 kg/ekor", kontak: "" },
        { id: "pupuk-1", kat: "pupuk", nama: "Pupuk Kandang Ayam Fermentasi (kering, curah)",
          penjual: "Kandang Berkah Maju", lokasi: "Gowa", harga: 1500, hargaTengkulak: 2000,
          stok: 5000, minOrder: 50, catatan: "Dari kotoran kandang broiler, sudah difermentasi", kontak: "" },
        { id: "pupuk-2", kat: "pupuk", nama: "Pupuk Organik Granul dari Kotoran Ayam",
          penjual: "Peternakan Sumber Rejeki", lokasi: "Maros", harga: 3500, hargaTengkulak: 4500,
          stok: 2000, minOrder: 25, catatan: "Butiran seragam, mudah ditebar", kontak: "" },
        { id: "pupuk-3", kat: "pupuk", nama: "Kompos Kotoran Ayam + Sekam (karung 25 kg)",
          penjual: "Kandang Tani Mandiri", lokasi: "Takalar", harga: 1800, hargaTengkulak: 2400,
          stok: 3000, minOrder: 25, catatan: "Dikemas karung 25 kg", kontak: "" }
    ];

    var CAT_INFO = {
        pakan: { ikon: "🌾", unit: "kg" },
        ayam: { ikon: "🐔", unit: "kg" },
        pupuk: { ikon: "🌱", unit: "kg" }
    };

    function loadList(key) {
        try {
            var d = JSON.parse(localStorage.getItem(key));
            return Array.isArray(d) ? d : [];
        } catch (e) { return []; }
    }
    function saveList(key, arr) {
        try { localStorage.setItem(key, JSON.stringify(arr)); } catch (e) {}
    }

    var marketUser = loadList(MKEY);
    var orders = loadList(OKEY);
    var marketCat = "pakan";
    var marketQuery = "";
    var orderTarget = null;

    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        return n;
    }

    function allListings() {
        var pakan = SUPPLIERS.map(function (sp, i) {
            return {
                id: "pakan-" + i, kat: "pakan", nama: sp.produk, penjual: sp.nama,
                lokasi: sp.lokasi, harga: sp.harga,
                hargaTengkulak: Math.round(sp.harga * 1.08 / 100) * 100,
                stok: 20000, minOrder: 500, catatan: "Pakan broiler langsung dari supplier",
                kontak: sp.kontak || "", sampel: true
            };
        });
        var mine = marketUser.map(function (m) {
            var x = {}; for (var k in m) x[k] = m[k];
            x.mine = true; return x;
        });
        var samples = MARKET_SAMPLES.map(function (m) {
            var x = {}; for (var k in m) x[k] = m[k];
            x.sampel = true; return x;
        });
        return pakan.concat(samples, mine);
    }

    function findListing(id) {
        var all = allListings();
        for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
        return null;
    }

    function renderMarketInfo() {
        var info = $("market-info");
        if (!info) return;
        var rec = latestRecord();
        var txt;
        if (marketCat === "pakan") {
            txt = rec && rec.harga > 0
                ? "Harga pakan pada catatan terakhir Anda (" + dmy(rec.tgl) + "): " +
                  rp(rec.harga) + "/kg. Bandingkan dengan harga langsung supplier di bawah."
                : "Isi data di dashboard agar harga supplier bisa dibandingkan dengan harga pakan Anda.";
        } else if (marketCat === "ayam") {
            txt = rec && rec.ayam > 0 && rec.bobot > 0
                ? "Estimasi biomassa dari catatan terakhir Anda: " + rec.ayam.toLocaleString("id-ID") +
                  " ekor × " + num(rec.bobot, 2) + " kg ≈ " + num(rec.ayam * rec.bobot, 0) +
                  " kg. Pasang listing untuk menjual langsung ke pembeli."
                : "Pasang listing ayam panen Anda agar langsung terlihat pembeli, tanpa lewat tengkulak.";
        } else {
            txt = "Kotoran kandang bisa dijual sebagai pupuk organik untuk tambahan pendapatan. Pasang listing Anda sendiri.";
        }
        info.textContent = txt;
    }

    function renderMarket() {
        var grid = $("market-grid");
        if (!grid) return;
        grid.innerHTML = "";
        renderMarketInfo();

        var q = marketQuery.trim().toLowerCase();
        var rec = latestRecord();
        var list = allListings().filter(function (m) {
            if (m.kat !== marketCat) return false;
            if (!q) return true;
            return (m.nama + " " + m.penjual + " " + m.lokasi).toLowerCase().indexOf(q) !== -1;
        });

        if (marketCat === "pakan") {
            list.sort(function (a, b) { return a.harga - b.harga; });
        }

        if (!list.length) {
            grid.appendChild(el("p", "market-empty",
                q ? "Tidak ada listing yang cocok dengan pencarian."
                  : "Belum ada listing. Klik \"+ Pasang Listing\" untuk menambahkan."));
            return;
        }

        list.forEach(function (m) {
            var card = el("article", "market-card");

            var top = el("div", "market-card-top");
            top.appendChild(el("div", "market-icon", CAT_INFO[m.kat].ikon));
            var badges = el("div", "market-badges");
            badges.appendChild(el("span", "market-badge", "Direct to Buyer"));
            var hemat = m.hargaTengkulak && m.hargaTengkulak > m.harga
                ? Math.round((m.hargaTengkulak - m.harga) / m.hargaTengkulak * 100) : 0;
            if (hemat > 0) badges.appendChild(el("span", "market-badge save", "Hemat " + hemat + "%"));
            if (m.mine) badges.appendChild(el("span", "market-badge mine", "Milik Anda"));
            else if (m.sampel) badges.appendChild(el("span", "market-badge sample", "Contoh"));
            top.appendChild(badges);
            card.appendChild(top);

            var body = el("div", "market-card-body");
            body.appendChild(el("h4", "", m.nama));
            body.appendChild(el("div", "market-seller", m.penjual + " · 📍 " + m.lokasi));

            var price = el("div", "market-price", rp(m.harga) + " ");
            price.appendChild(el("small", "", "/kg"));
            body.appendChild(price);

            if (m.hargaTengkulak && m.hargaTengkulak > m.harga) {
                var old = el("div", "market-old", "Via tengkulak ±");
                old.appendChild(el("s", "", rp(m.hargaTengkulak) + "/kg"));
                old.appendChild(document.createTextNode(" · hemat " + rp(m.hargaTengkulak - m.harga) + "/kg"));
                body.appendChild(old);
            }

            body.appendChild(el("div", "market-meta",
                "Stok: " + num(m.stok, 0) + " kg · Min. order: " + num(m.minOrder, 0) + " kg"));
            if (m.catatan) body.appendChild(el("div", "market-meta", m.catatan));

            if (m.kat === "pakan" && rec && rec.harga > 0) {
                var diff = rec.harga - m.harga;
                body.appendChild(el("div", "market-compare",
                    diff > 0 ? "Lebih murah " + rp(diff) + "/kg dari harga pakan terakhir Anda"
                    : diff < 0 ? "Lebih mahal " + rp(-diff) + "/kg dari harga pakan terakhir Anda"
                    : "Sama dengan harga pakan terakhir Anda"));
            }

            var act = el("div", "market-actions");
            var b = el("button", "btn btn-primary", m.kat === "pakan" ? "Beli Langsung" : "Pesan Langsung");
            b.type = "button";
            b.setAttribute("data-act", "order");
            b.setAttribute("data-id", m.id);
            act.appendChild(b);
            if (m.kontak) {
                var a = el("a", "btn btn-outline", "WhatsApp");
                a.href = "https://wa.me/" + m.kontak;
                a.target = "_blank";
                a.rel = "noopener";
                act.appendChild(a);
            }
            if (m.mine) {
                var d = el("button", "btn-small btn-delete", "Hapus");
                d.type = "button";
                d.setAttribute("data-act", "del");
                d.setAttribute("data-id", m.id);
                act.appendChild(d);
            }
            body.appendChild(act);
            card.appendChild(body);
            grid.appendChild(card);
        });
    }

    function renderOrders() {
        var tbody = $("tabel-pesanan");
        if (!tbody) return;
        tbody.innerHTML = "";
        if (!orders.length) {
            emptyRow(tbody, 8, "Belum ada pesanan.");
            return;
        }
        orders.slice().reverse().forEach(function (o) {
            var tr = document.createElement("tr");
            tr.appendChild(td(dmy(o.tgl)));
            tr.appendChild(td(o.nama));
            tr.appendChild(td(o.penjual));
            tr.appendChild(td(num(o.jumlah, 0) + " kg"));
            tr.appendChild(td(rp(o.total)));
            tr.appendChild(td(o.hemat > 0 ? rp(o.hemat) : "—"));
            var tds = document.createElement("td");
            tds.appendChild(el("span", "status status-warning", o.status));
            tr.appendChild(tds);
            var ta = document.createElement("td");
            var btn = el("button", "btn-small btn-delete", "Hapus");
            btn.type = "button";
            btn.setAttribute("data-oid", o.id);
            ta.appendChild(btn);
            tr.appendChild(ta);
            tbody.appendChild(tr);
        });
    }

    /* --- dialog helper --- */
    function openDialog(id) {
        var d = $(id);
        if (d.showModal) d.showModal();
        else d.setAttribute("open", "");
    }
    function closeDialog(id) {
        var d = $(id);
        if (d.close) d.close();
        else d.removeAttribute("open");
    }

    /* --- pesan langsung --- */
    function updateOrderSummary() {
        if (!orderTarget) return;
        var qty = parseFloat($("order-jumlah").value) || 0;
        var total = qty * orderTarget.harga;
        var hemat = orderTarget.hargaTengkulak > orderTarget.harga
            ? (orderTarget.hargaTengkulak - orderTarget.harga) * qty : 0;
        $("order-total").textContent = qty > 0 ? rp(total) : "Rp —";
        $("order-hemat").textContent = qty > 0 && hemat > 0 ? rp(hemat) : "—";
    }

    function openOrder(id) {
        var m = findListing(id);
        if (!m) return;
        orderTarget = m;
        $("order-title").textContent = (m.kat === "pakan" ? "Beli: " : "Pesan: ") + m.nama;
        $("order-meta").textContent = m.penjual + " · 📍 " + m.lokasi + " · " + rp(m.harga) +
            "/kg · stok " + num(m.stok, 0) + " kg";
        $("order-jumlah-label").textContent = "Jumlah (kg), min. " + num(m.minOrder, 0);
        $("order-jumlah").min = m.minOrder;
        $("order-jumlah").max = m.stok;
        $("order-jumlah").value = m.minOrder;
        $("order-catatan").value = "";
        $("order-error").hidden = true;
        updateOrderSummary();
        openDialog("order-dialog");
        setTimeout(function () { $("order-nama").focus(); }, 0);
    }

    function orderError(msg) {
        $("order-error").textContent = msg;
        $("order-error").hidden = false;
    }

    $("order-jumlah").addEventListener("input", updateOrderSummary);

    $("order-form").addEventListener("submit", function (e) {
        e.preventDefault();
        var m = orderTarget;
        if (!m) return;
        var nama = $("order-nama").value.trim();
        var qty = parseFloat($("order-jumlah").value);
        if (!nama) { orderError("Nama pembeli wajib diisi."); return; }
        if (!(qty > 0)) { orderError("Masukkan jumlah pesanan."); return; }
        if (qty < m.minOrder) { orderError("Jumlah minimal " + num(m.minOrder, 0) + " kg."); return; }
        if (qty > m.stok) { orderError("Jumlah melebihi stok (" + num(m.stok, 0) + " kg)."); return; }

        var hemat = m.hargaTengkulak > m.harga ? (m.hargaTengkulak - m.harga) * qty : 0;
        orders.push({
            id: Date.now() + "-" + Math.floor(Math.random() * 1000),
            tgl: todayISO(),
            nama: m.nama,
            penjual: m.penjual,
            jumlah: qty,
            total: qty * m.harga,
            hemat: hemat,
            pembeli: nama,
            catatan: $("order-catatan").value.trim(),
            status: "Menunggu konfirmasi"
        });
        saveList(OKEY, orders);
        closeDialog("order-dialog");
        renderOrders();
        $("market-flash").textContent = "Pesanan " + m.nama + " (" + num(qty, 0) +
            " kg) terkirim ke " + m.penjual + ". Status: menunggu konfirmasi.";
        $("market-orders").scrollIntoView({ behavior: "smooth", block: "nearest" });
    });

    /* --- pasang listing --- */
    function openListing() {
        $("listing-form").reset();
        $("listing-error").hidden = true;
        var rec = latestRecord();
        $("lst-kat").value = marketCat === "pupuk" ? "pupuk" : "ayam";
        if (rec && rec.lokasi) $("lst-lokasi").value = rec.lokasi;
        $("listing-hint").textContent = rec && rec.ayam > 0 && rec.bobot > 0
            ? "Estimasi biomassa catatan terakhir: ≈ " + num(rec.ayam * rec.bobot, 0) + " kg."
            : "Jual hasil kandang Anda langsung ke pembeli.";
        openDialog("listing-dialog");
        setTimeout(function () { $("lst-nama").focus(); }, 0);
    }

    function listingError(msg) {
        $("listing-error").textContent = msg;
        $("listing-error").hidden = false;
    }

    $("listing-form").addEventListener("submit", function (e) {
        e.preventDefault();
        var nama = $("lst-nama").value.trim();
        var lokasi = $("lst-lokasi").value.trim();
        var jumlah = parseFloat($("lst-jumlah").value);
        var harga = parseFloat($("lst-harga").value);
        var kontak = $("lst-kontak").value.replace(/\D/g, "");

        if (!nama) { listingError("Nama produk wajib diisi."); return; }
        if (!lokasi) { listingError("Lokasi wajib diisi."); return; }
        if (!(jumlah > 0)) { listingError("Jumlah tersedia harus lebih dari 0."); return; }
        if (!(harga > 0)) { listingError("Harga harus lebih dari 0."); return; }
        if (kontak && !/^62\d{8,13}$/.test(kontak)) {
            listingError("Nomor WhatsApp harus berformat 628xxxxxxxxxx.");
            return;
        }

        var kat = $("lst-kat").value === "pupuk" ? "pupuk" : "ayam";
        marketUser.push({
            id: "u-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
            kat: kat, nama: nama, penjual: "Anda", lokasi: lokasi,
            harga: harga, hargaTengkulak: null, stok: jumlah,
            minOrder: Math.min(jumlah, kat === "ayam" ? 100 : 25),
            catatan: "", kontak: kontak
        });
        saveList(MKEY, marketUser);
        closeDialog("listing-dialog");
        marketCat = kat;
        syncMarketTabs();
        renderMarket();
        $("market-flash").textContent = "Listing \"" + nama + "\" berhasil dipasang.";
    });

    function syncMarketTabs() {
        Array.prototype.forEach.call(document.querySelectorAll(".market-tab"), function (b) {
            b.classList.toggle("active", b.getAttribute("data-cat") === marketCat);
        });
    }

    function initMarket() {
        if (!$("market-grid")) return;

        $("market-tabs").addEventListener("click", function (e) {
            var b = e.target.closest(".market-tab");
            if (!b) return;
            marketCat = b.getAttribute("data-cat");
            syncMarketTabs();
            renderMarket();
        });

        $("market-search").addEventListener("input", function () {
            marketQuery = this.value;
            renderMarket();
        });

        $("market-add").addEventListener("click", openListing);

        $("market-grid").addEventListener("click", function (e) {
            var b = e.target.closest("button[data-act]");
            if (!b) return;
            var id = b.getAttribute("data-id");
            if (b.getAttribute("data-act") === "order") {
                openOrder(id);
            } else if (b.getAttribute("data-act") === "del") {
                if (!confirm("Hapus listing ini?")) return;
                marketUser = marketUser.filter(function (x) { return x.id !== id; });
                saveList(MKEY, marketUser);
                renderMarket();
            }
        });

        $("tabel-pesanan").addEventListener("click", function (e) {
            var b = e.target.closest("button[data-oid]");
            if (!b) return;
            if (!confirm("Hapus pesanan ini?")) return;
            var id = b.getAttribute("data-oid");
            orders = orders.filter(function (x) { return x.id !== id; });
            saveList(OKEY, orders);
            renderOrders();
        });

        Array.prototype.forEach.call(document.querySelectorAll("[data-close]"), function (b) {
            b.addEventListener("click", function () {
                closeDialog(b.getAttribute("data-close"));
            });
        });

        renderMarket();
        renderOrders();
    }

    /* ---------- Inisialisasi ---------- */
    $("tanggal").value = todayISO();
    if ($("tahun-footer")) {
        $("tahun-footer").textContent = new Date().getFullYear();
    }

    initChart();
    initEduChart();
    initLiveFloor();
    initLiveSource();
    tickClock();
    setInterval(tickClock, 1000);
    renderSuppliers();
    preview();
    render(null);
    initMarket();

    /* ---------- Login & Akses Dashboard ----------
       CATATAN: autentikasi ini berjalan di browser saja (demo, tanpa backend).
       Akun email disimpan di localStorage. Untuk keamanan nyata gunakan server. */

    // Isi dengan OAuth Client ID dari Google Cloud Console agar login Google aktif.
    // Contoh: "1234567890-abc123.apps.googleusercontent.com"
    var GOOGLE_CLIENT_ID = "";

    var SESSION_KEY = "feedmatrix.session.v2";   // sessionStorage: {type, name, email}
    var USERS_KEY = "feedmatrix.users.v1";       // localStorage: akun email

    var loginPage = $("login-page");
    var btnLogin = $("btn-login");
    var dashboard = $("dashboard");
    var authMode = "masuk";
    var googleReady = false;

    /* --- session --- */
    function getSession() {
        try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); }
        catch (e) { return null; }
    }
    function setSession(obj) {
        try {
            if (obj) sessionStorage.setItem(SESSION_KEY, JSON.stringify(obj));
            else sessionStorage.removeItem(SESSION_KEY);
        } catch (e) {}
    }
    function isLoggedIn() {
        var s = getSession();
        return !!s && (s.type === "email" || s.type === "google");
    }
    function canViewDashboard() {
        return !!getSession();   // login atau demo
    }

    /* --- akun email (lokal) --- */
    function getUsers() {
        try {
            var u = JSON.parse(localStorage.getItem(USERS_KEY));
            return Array.isArray(u) ? u : [];
        } catch (e) { return []; }
    }
    function saveUsers(u) {
        try { localStorage.setItem(USERS_KEY, JSON.stringify(u)); } catch (e) {}
    }
    function hashPass(pw) {
        if (window.crypto && crypto.subtle && window.TextEncoder) {
            return crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw)).then(function (buf) {
                return Array.prototype.map.call(new Uint8Array(buf), function (b) {
                    return ("0" + b.toString(16)).slice(-2);
                }).join("");
            });
        }
        return Promise.resolve("x" + btoa(unescape(encodeURIComponent(pw))));
    }

    /* --- tampilan akun (topbar aplikasi + sapaan menu) --- */
    function updateUI() {
        var s = getSession();
        var allowed = !!s;

        if (isLoggedIn()) {
            btnLogin.textContent = "Logout";
            btnLogin.setAttribute("href", "#home");
        } else {
            btnLogin.textContent = "Login";
            btnLogin.setAttribute("href", "#login");
        }

        if (allowed) {
            var txt, act, greet;
            if (s.type === "demo") {
                txt = "Mode Demo";
                act = "Login";
                greet = "Selamat datang di FEED-MATRIX";
                $("userbar-text").title = "Mode Demo: data hanya tersimpan di browser ini.";
            } else {
                var nm = s.name || s.email;
                txt = nm + (s.type === "google" ? " (Google)" : "");
                act = "Logout";
                greet = "Halo, " + nm + "!";
                $("userbar-text").title = "Masuk sebagai " + nm;
            }
            $("userbar-text").textContent = txt;
            $("userbar-action").textContent = act;
            $("menu-greeting").textContent = greet;
        }
    }

    /* --- halaman aplikasi: menu / dashboard / marketplace --- */
    var APP_ROUTES = {
        "#app": "menu",
        "#app/dashboard": "dashboard",
        "#app/marketplace": "marketplace"
    };
    // tautan lama (landing) -> tampilan aplikasi
    var TARGET_VIEW = {
        "#dashboard": "dashboard",
        "#form-input": "dashboard",
        "#live-kandang": "dashboard",
        "#grafik": "dashboard",
        "#peringatan": "dashboard",
        "#riwayat": "dashboard",
        "#marketplace": "marketplace"
    };
    var LANDING_IDS = ["navbar"];

    function landingEls() {
        return [$("navbar"), document.querySelector("main"), document.querySelector("footer")];
    }

    function showApp(view) {
        $("app").hidden = false;
        landingEls().forEach(function (n) { if (n) n.hidden = true; });
        document.body.classList.add("in-app");

        ["menu", "dashboard", "marketplace"].forEach(function (v) {
            $("view-" + v).hidden = v !== view;
        });
        Array.prototype.forEach.call(document.querySelectorAll(".app-nav a"), function (a) {
            a.classList.toggle("active", a.getAttribute("data-view") === view);
        });
        updateUI();

        if (view === "dashboard") {
            setTimeout(function () { if (feedChart) feedChart.resize(); }, 50);
        } else if (view === "marketplace") {
            renderMarket();
            renderOrders();
        }
        window.scrollTo(0, 0);
    }

    function hideApp() {
        if ($("app").hidden) return;
        $("app").hidden = true;
        landingEls().forEach(function (n) { if (n) n.hidden = false; });
        document.body.classList.remove("in-app");
        setTimeout(function () { if (eduChart) eduChart.resize(); }, 50);
        var t = location.hash.length > 1 ? document.getElementById(location.hash.slice(1)) : null;
        if (t && t.scrollIntoView) t.scrollIntoView();
        else window.scrollTo(0, 0);
    }

    function route() {
        var h = location.hash;

        if (h === "#login" && !isLoggedIn()) showLogin();
        else if (!loginPage.hidden) hideLogin();

        var view = APP_ROUTES[h];
        if (view) {
            if (!canViewDashboard()) {
                history.replaceState(null, "", location.pathname + location.search);
                hideApp();
                openLogin();
                return;
            }
            showApp(view);
        } else {
            hideApp();
        }
    }

    function navigateApp(view, anchorId) {
        var hash = view === "menu" ? "#app" : "#app/" + view;
        if (location.hash !== hash) history.pushState(null, "", hash);
        route();
        if (anchorId) {
            var t = document.getElementById(anchorId);
            if (t && t.scrollIntoView) setTimeout(function () { t.scrollIntoView(); }, 60);
        }
    }

    // setelah login/demo: selalu ke halaman menu
    function goToApp() {
        navigateApp("menu");
    }

    function doLogout() {
        if (!confirm("Keluar dari akun?")) return;
        setSession(null);
        if (window.google && google.accounts && google.accounts.id) {
            try { google.accounts.id.disableAutoSelect(); } catch (e) {}
        }
        history.pushState(null, "", "#home");
        updateUI();
        route();
    }

    /* --- buka/tutup halaman login --- */
    function showLogin() {
        loginPage.hidden = false;
        document.body.classList.add("login-open");
        $("login-error").hidden = true;
        initGoogle();
        setTimeout(function () { $("login-email").focus(); }, 0);
    }
    function hideLogin() {
        loginPage.hidden = true;
        document.body.classList.remove("login-open");
    }
    function closeLogin() {
        if (location.hash === "#login") {
            history.replaceState(null, "", location.pathname + location.search);
        }
        hideLogin();
    }
    function openLogin() {
        history.pushState(null, "", "#login");
        showLogin();
    }

    function afterLogin() {
        $("login-form").reset();
        closeLogin();
        updateUI();
        goToApp();
    }

    /* --- tab Masuk / Daftar --- */
    function setMode(mode) {
        authMode = mode;
        var daftar = mode === "daftar";
        $("tab-masuk").classList.toggle("active", !daftar);
        $("tab-daftar").classList.toggle("active", daftar);
        $("group-nama").hidden = !daftar;
        $("login-submit").textContent = daftar ? "Daftar dengan Email" : "Masuk dengan Email";
        $("login-pass").setAttribute("autocomplete", daftar ? "new-password" : "current-password");
        $("login-error").hidden = true;
    }
    $("tab-masuk").addEventListener("click", function () { setMode("masuk"); });
    $("tab-daftar").addEventListener("click", function () { setMode("daftar"); });

    function showError(msg) {
        var el = $("login-error");
        el.textContent = msg;
        el.hidden = false;
    }

    /* --- submit email --- */
    $("login-form").addEventListener("submit", function (e) {
        e.preventDefault();
        var email = $("login-email").value.trim().toLowerCase();
        var pass = $("login-pass").value;
        var nama = $("login-nama").value.trim();

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showError("Masukkan alamat email yang valid.");
            return;
        }
        if (pass.length < 6) {
            showError("Password minimal 6 karakter.");
            return;
        }

        hashPass(pass).then(function (h) {
            var users = getUsers();
            var found = users.filter(function (u) { return u.email === email; })[0];

            if (authMode === "daftar") {
                if (!nama) { showError("Nama wajib diisi."); return; }
                if (found) { showError("Email sudah terdaftar. Silakan masuk."); return; }
                users.push({ name: nama, email: email, hash: h });
                saveUsers(users);
                setSession({ type: "email", name: nama, email: email });
                afterLogin();
            } else {
                if (!found || found.hash !== h) {
                    showError("Email atau password salah.");
                    return;
                }
                setSession({ type: "email", name: found.name, email: email });
                afterLogin();
            }
        });
    });

    /* --- password tampil/sembunyi --- */
    $("toggle-pass").addEventListener("click", function () {
        var p = $("login-pass");
        var show = p.type === "password";
        p.type = show ? "text" : "password";
        this.textContent = show ? "Sembunyikan" : "Tampilkan";
        this.setAttribute("aria-label", show ? "Sembunyikan password" : "Tampilkan password");
    });

    /* --- Google Sign-In (Google Identity Services) --- */
    function parseJwt(token) {
        var b = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        return JSON.parse(decodeURIComponent(escape(atob(b))));
    }

    function onGoogleCredential(resp) {
        try {
            var p = parseJwt(resp.credential);
            setSession({ type: "google", name: p.name || p.email, email: p.email });
            afterLogin();
        } catch (e) {
            showError("Login Google gagal. Silakan coba lagi.");
        }
    }

    function initGoogle() {
        if (googleReady || !GOOGLE_CLIENT_ID) return;
        var sc = document.createElement("script");
        sc.src = "https://accounts.google.com/gsi/client";
        sc.async = true;
        sc.defer = true;
        sc.onload = function () {
            try {
                google.accounts.id.initialize({
                    client_id: GOOGLE_CLIENT_ID,
                    callback: onGoogleCredential
                });
                google.accounts.id.renderButton($("google-btn"), {
                    theme: "outline",
                    size: "large",
                    width: 340,
                    text: "continue_with",
                    locale: "id"
                });
                $("google-fallback").hidden = true;
                googleReady = true;
            } catch (e) {}
        };
        sc.onerror = function () {
            showError("Tidak dapat memuat Google. Periksa koneksi internet.");
        };
        document.head.appendChild(sc);
    }

    $("google-fallback").addEventListener("click", function () {
        if (!GOOGLE_CLIENT_ID) {
            showError("Login Google belum dikonfigurasi. Isi GOOGLE_CLIENT_ID di script.js.");
        }
    });

    /* --- tombol & link --- */
    btnLogin.addEventListener("click", function (e) {
        e.preventDefault();
        if (isLoggedIn()) doLogout();
        else openLogin();
    });

    $("btn-demo").addEventListener("click", function (e) {
        e.preventDefault();
        if (!getSession()) setSession({ type: "demo" });
        goToApp();
    });

    $("login-demo-link").addEventListener("click", function (e) {
        e.preventDefault();
        setSession({ type: "demo" });
        closeLogin();
        goToApp();
    });

    $("userbar-action").addEventListener("click", function () {
        var s = getSession();
        if (s && s.type === "demo") {
            openLogin();
        } else {
            doLogout();
        }
    });

    // Tautan ke Dashboard / Marketplace: minta login jika belum boleh akses,
    // jika sudah masuk arahkan ke halaman aplikasi.
    document.addEventListener("click", function (e) {
        var a = e.target.closest("a[href^='#']");
        if (!a || a.id === "btn-demo" || a.id === "login-demo-link") return;
        var href = a.getAttribute("href");
        var view = TARGET_VIEW[href];
        if (!view) return;
        e.preventDefault();
        if (!canViewDashboard()) {
            openLogin();
            return;
        }
        navigateApp(view, href === "#dashboard" || href === "#marketplace" ? "" : href.slice(1));
    });

    window.addEventListener("hashchange", route);

    $("login-close").addEventListener("click", closeLogin);
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && !loginPage.hidden) closeLogin();
    });

    updateUI();
    route();
})();