/**
 * decisions.js — Pollinations decision models (BYOP).
 *
 * Decision models do not answer in prose. They return a calibrated judgment: the choice
 * they made, a confidence, and a probability for every option. A scoring game needs
 * exactly that, so this app keeps the probabilities instead of flattening them to text.
 *
 * Reference: the "Typed decisions" section of APIDOCS.md and
 * https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md
 */
(function (root) {
    const API_URL = "https://gen.pollinations.ai/v1/chat/completions";

    // The prompt is a { state, questions } object, not a chat message. microsoft-decision-1
    // says so itself when handed anything else: 'expects a JSON object with "state" and a
    // "questions" map'.
    function buildPrompt(scenario, options) {
        const criteria = {};
        for (const o of options) criteria[o.key] = o.text;
        return JSON.stringify({
            state: scenario,
            questions: {
                pick: {
                    type: "choice",
                    instructions: "Which outcome actually happened?",
                    criteria,
                },
            },
        });
    }

    // `message.content` is not always a string; a parts array stringifies to "[object Object]".
    function extractText(message) {
        const content = message ? message.content : null;
        if (typeof content === "string") return content;
        if (Array.isArray(content)) {
            return content
                .map((p) => (typeof p === "string" ? p : (p && typeof p.text === "string" ? p.text : "")))
                .join("");
        }
        if (content && typeof content === "object" && typeof content.text === "string") return content.text;
        return "";
    }

    function parseJudgment(text) {
        const cleaned = String(text).replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
        const start = cleaned.indexOf("{");
        const end = cleaned.lastIndexOf("}");
        if (start === -1 || end === -1) throw new Error("the model did not return JSON");
        const outer = JSON.parse(cleaned.slice(start, end + 1));
        const answer = outer.pick || outer[Object.keys(outer)[0]];
        if (!answer) throw new Error("no answer in the reply");
        if (typeof answer === "string") return { choice: answer, probabilities: null, confidence: null };
        return {
            choice: answer.choice,
            probabilities: answer.probabilities || null,
            confidence: typeof answer.confidence === "number" ? answer.confidence : null,
        };
    }

    /** Ask one decision model for a judgment on the scenario. */
    async function judge(model, scenario, options, apiKey) {
        if (!apiKey) throw new Error("Approve a Pollinations key with the Connect button first.");
        const started = Date.now();
        const res = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
            body: JSON.stringify({
                model,
                messages: [{ role: "user", content: buildPrompt(scenario, options) }],
                max_tokens: 600,
            }),
        });
        const ms = Date.now() - started;
        if (!res.ok) {
            let detail = "";
            try {
                const j = await res.json();
                detail = (j.error && (j.error.message || j.error)) || "";
            } catch (_e) { /* not JSON */ }
            throw new Error(detail ? String(detail).slice(0, 110) : "HTTP " + res.status);
        }
        const data = await res.json();
        const text = extractText((data.choices || [{}])[0].message);
        const judgment = parseJudgment(text);
        return Object.assign(judgment, { ms, tokens: (data.usage || {}).completion_tokens || null });
    }

    /**
     * Brier score over the option set: mean squared error between the model's probability
     * for each option and what actually happened. 0 is perfect, lower is better.
     */
    function brier(probabilities, options, truthKey) {
        if (!probabilities) return null;
        let sum = 0;
        for (const o of options) {
            const p = typeof probabilities[o.key] === "number" ? probabilities[o.key] : 0;
            sum += Math.pow(p - (o.key === truthKey ? 1 : 0), 2);
        }
        return sum / options.length;
    }

    root.Decisions = { API_URL, judge, brier, buildPrompt, parseJudgment, extractText };
})(typeof self !== "undefined" ? self : globalThis);
