(function () {
    const el = (id) => document.getElementById(id);
    const D = window.Decisions;

    // Only decision models that answer on a quest-tier balance are listed here; the rest
    // require paid Pollen, which would make the round fail for most visitors.
    const MODELS = [
        { id: "microsoft/microsoft-decision-1", name: "Microsoft Decision 1", lab: "Microsoft", on: true },
        { id: "vllm-sr/d3",                     name: "d3",                    lab: "vLLM Semantic Router", on: true },
    ];

    const ROUNDS = [
        {
            scenario: "A 40-person startup ships a paid tier at $29/month while leaving the free tier completely unchanged. It has 50,000 free users.",
            options: [
                { key: "churn", text: "Most free users leave anyway" },
                { key: "low",   text: "Under 2% convert to paid" },
                { key: "mid",   text: "Between 2% and 5% convert" },
                { key: "high",  text: "More than 5% convert" },
            ],
        },
        {
            scenario: "A team of six engineers replaces their code review process with an AI reviewer that comments on every pull request. A human still clicks merge.",
            options: [
                { key: "faster",  text: "Review time falls and quality holds" },
                { key: "fasterbad", text: "Review time falls but more defects ship" },
                { key: "slower",  text: "It gets slower because of noise" },
                { key: "ignored", text: "Most comments get ignored" },
            ],
        },
        {
            scenario: "A restaurant stops taking phone orders entirely and only accepts orders through its own website. Regulars are told at the door.",
            options: [
                { key: "loss",  text: "It loses meaningful revenue" },
                { key: "flat",  text: "Revenue stays roughly flat" },
                { key: "gain",  text: "It gains revenue from lower fees" },
            ],
        },
        {
            scenario: "A conference replaces all slide talks with live demos and no slides. Same speakers, same slots, same audience.",
            options: [
                { key: "better", text: "It is clearly better received" },
                { key: "mixed",  text: "Mixed, about the same" },
                { key: "worse",  text: "It goes noticeably worse" },
            ],
        },
    ];

    const KEY_STORE = "polli_byop_key";
    const BOARD_STORE = "calibration_board_v1";

    let round = 0;
    let judgments = [];      // { model, judgment } for the round in flight
    let lastTruth = null;

    const key = () => {
        const c = document.querySelector("polli-connect");
        return (c && c.apiKey) || sessionStorage.getItem(KEY_STORE) || "";
    };
    const status = (t, cls) => { const s = el("status"); s.textContent = t || ""; s.className = cls || ""; };
    const board = () => { try { return JSON.parse(localStorage.getItem(BOARD_STORE)) || {}; } catch (e) { return {}; } };
    const saveBoard = (b) => localStorage.setItem(BOARD_STORE, JSON.stringify(b));

    function pct(x) { return (x * 100).toFixed(0) + "%"; }

    function renderLeaderboard() {
        const b = board();
        const rows = Object.keys(b).map((id) => ({ id, ...b[id] }));
        rows.sort((x, y) => x.totalBrier / x.rounds - y.totalBrier / y.rounds);
        const box = el("board");
        if (!rows.length) { box.innerHTML = '<div class="muted">No rounds scored yet.</div>'; return; }
        box.innerHTML = rows
            .map((r, i) => {
                const avg = r.totalBrier / r.rounds;
                const medal = ["gold", "silver", "bronze"][i] || "";
                return `<div class="brow ${medal}">
                    <span class="bpos">${i + 1}</span>
                    <span class="bname">${r.name}</span>
                    <span class="bmeta">${r.rounds} round${r.rounds > 1 ? "s" : ""} · ${r.hits} right</span>
                    <span class="bscore">${avg.toFixed(3)}</span>
                </div>`;
            })
            .join("") + '<div class="muted small">Lower Brier is better. 0 is a perfect score.</div>';
    }

    function renderRound() {
        const r = ROUNDS[round % ROUNDS.length];
        el("roundNo").textContent = `Round ${(round % ROUNDS.length) + 1} of ${ROUNDS.length}`;
        el("scenario").textContent = r.scenario;
        el("cards").innerHTML = "";
        el("referee").style.display = "none";
        el("refereeOptions").innerHTML = "";
        el("scores").innerHTML = "";
        judgments = [];
        lastTruth = null;
        status("");
        el("run").disabled = false;
        el("run").textContent = "Ask the models";
    }

    function card(model, state) {
        const c = document.createElement("div");
        c.className = "card " + (state.kind === "ok" ? "okc" : "badc");
        const head = `<div class="chead"><b>${model.name}</b><span class="lab">${model.lab}</span>
            <span class="ms">${state.meta || "…"}</span></div>`;
        let body = "";
        if (state.kind === "ok") {
            body = `<div class="pick">picks <b>${state.pickLabel}</b>${state.conf !== null ? ` <span class="conf">${(state.conf * 100).toFixed(0)}% confident</span>` : ""}</div>`;
            if (state.bars) {
                body += state.bars
                    .map((b) => `<div class="bar"><span class="bl">${b.text}</span>
                        <span class="bt"><i style="width:${Math.max(1, b.p * 100)}%"></i></span>
                        <span class="bv">${pct(b.p)}</span></div>`)
                    .join("");
            }
        } else {
            body = `<div class="err">${state.text}</div>`;
        }
        c.innerHTML = head + body;
        return c;
    }

    async function runRound() {
        const apiKey = key();
        const r = ROUNDS[round % ROUNDS.length];
        const models = MODELS.filter((m) => m.on);
        if (!apiKey) { status("Approve a Pollinations key first — press Connect below.", "err"); return; }
        if (!models.length) { status("No models selected.", "err"); return; }

        el("run").disabled = true;
        el("cards").innerHTML = "";
        el("referee").style.display = "none";
        el("scores").innerHTML = "";
        status(`Asking ${models.length} decision models…`);

        const settled = await Promise.allSettled(models.map((m) => D.judge(m.id, r.scenario, r.options, apiKey)));
        judgments = [];
        settled.forEach((res, i) => {
            const m = models[i];
            if (res.status === "fulfilled") {
                const j = res.value;
                const label = (r.options.find((o) => o.key === j.choice) || {}).text || j.choice;
                const bars = j.probabilities
                    ? r.options.map((o) => ({ text: o.text, p: typeof j.probabilities[o.key] === "number" ? j.probabilities[o.key] : 0 }))
                    : null;
                judgments.push({ model: m, j });
                el("cards").appendChild(card(m, {
                    kind: "ok", pickLabel: label, conf: j.confidence, bars,
                    meta: `${j.ms} ms`,
                }));
            } else {
                el("cards").appendChild(card(m, { kind: "bad", text: res.reason.message }));
            }
        });

        if (!judgments.length) { status("Every model failed this round.", "err"); el("run").disabled = false; return; }
        status(`Both judgments in. Now YOU decide what actually happened.`, "ok");

        // The player is the referee: the truth is whatever they say it is.
        const ro = el("refereeOptions");
        ro.innerHTML = "";
        for (const o of r.options) {
            const b = document.createElement("button");
            b.className = "opt";
            b.textContent = o.text;
            b.addEventListener("click", () => resolveRound(o.key));
            ro.appendChild(b);
        }
        el("referee").style.display = "block";
    }

    function resolveRound(truthKey) {
        if (lastTruth) return;
        lastTruth = truthKey;
        const r = ROUNDS[round % ROUNDS.length];
        const b = board();
        const out = el("scores");
        out.innerHTML = '<div class="seclabel">Round score — Brier, lower is better</div>';
        for (const { model, j } of judgments) {
            const s = D.brier(j.probabilities, r.options, truthKey);
            const hit = j.choice === truthKey;
            const rec = b[model.id] || { name: model.name, rounds: 0, hits: 0, totalBrier: 0 };
            rec.rounds += 1;
            if (hit) rec.hits += 1;
            if (s !== null) rec.totalBrier += s;
            b[model.id] = rec;
            out.innerHTML += `<div class="srow"><b>${model.name}</b>
                <span class="${hit ? "hit" : "miss"}">${hit ? "called it" : "missed"}</span>
                <span class="sval">${s === null ? "no probabilities" : s.toFixed(3)}</span></div>`;
        }
        saveBoard(b);
        renderLeaderboard();
        el("refereeOptions").innerHTML = '<div class="muted">Round closed.</div>';
        el("run").textContent = "Next round";
        el("run").disabled = false;
        el("run").onclick = () => { round += 1; renderRound(); el("run").onclick = runRound; };
    }

    function renderPicker() {
        const box = el("picker");
        box.innerHTML = "";
        for (const m of MODELS) {
            const row = document.createElement("label");
            row.className = "pick on";
            row.innerHTML = `<input type="checkbox" checked /><b>${m.name}</b><span class="lab">${m.lab}</span>`;
            row.querySelector("input").addEventListener("change", (e) => { m.on = e.target.checked; row.classList.toggle("on", m.on); });
            box.appendChild(row);
        }
    }

    function reset() { localStorage.removeItem(BOARD_STORE); renderLeaderboard(); }

    el("run").addEventListener("click", runRound);
    el("reset").addEventListener("click", reset);
    renderPicker();
    renderLeaderboard();
    renderRound();
})();
