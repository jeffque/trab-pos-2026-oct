// Comportamento da prancha: numeração de linhas, palavras-guia (linhas visíveis),
// cursor no carimbo, estado "alterado" e Ctrl+S. Reexecuta a cada troca do HTMX.

function setupEditor(form) {
    const text = form.querySelector("[data-text]")
    const gutter = form.querySelector("[data-gutter]")
    const guide = form.querySelector("[data-guide]")
    const save = form.querySelector("[data-save]")
    const status = form.querySelector("[data-status]")
    const cursor = document.querySelector("[data-cursor]")
    if (!text || form.dataset.ready) return
    form.dataset.ready = "1"

    const original = text.value
    const cleanStatus = status ? status.textContent : ""
    const lineHeight = parseFloat(getComputedStyle(text).lineHeight) || 22
    let lineCount = 0

    function renumber() {
        const count = text.value.split("\n").length
        if (count === lineCount) return
        lineCount = count
        let out = ""
        for (let i = 1; i <= count; i++) out += i + (i < count ? "\n" : "")
        gutter.textContent = out
    }

    function updateGuide() {
        gutter.scrollTop = text.scrollTop
        const padTop = parseFloat(getComputedStyle(text).paddingTop) || 0
        const first = Math.max(1, Math.floor((text.scrollTop - padTop) / lineHeight) + 1)
        const last = Math.min(lineCount, Math.floor((text.scrollTop + text.clientHeight - padTop) / lineHeight))
        guide.textContent = `L ${first}–${Math.max(first, last)} / ${lineCount}`
    }

    function updateCursor() {
        if (!cursor) return
        const before = text.value.slice(0, text.selectionStart)
        const line = before.split("\n").length
        const col = before.length - before.lastIndexOf("\n")
        cursor.textContent = `L${line}:C${col}`
    }

    function updateDirty() {
        if (!save || save.hasAttribute("data-always")) return
        const dirty = text.value !== original
        save.disabled = !dirty
        if (status) {
            status.textContent = dirty ? "Alterações não salvas." : cleanStatus
            status.classList.toggle("is-dirty", dirty)
        }
    }

    text.addEventListener("input", () => { renumber(); updateGuide(); updateCursor(); updateDirty() })
    text.addEventListener("scroll", updateGuide, { passive: true })
    text.addEventListener("keyup", updateCursor)
    text.addEventListener("click", updateCursor)
    text.addEventListener("focus", updateCursor)
    new ResizeObserver(updateGuide).observe(text)

    form.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
            e.preventDefault()
            if (save && !save.disabled) form.requestSubmit(save)
        }
    })

    form.addEventListener("submit", () => {
        if (!save) return
        save.disabled = true
        save.textContent = "Salvando…"
    })

    renumber()
    updateGuide()
    updateDirty()
}

function setupFilter(root) {
    const input = root.querySelector("[data-filter]")
    if (!input) return
    const rows = root.querySelectorAll(".ledger__row")
    const none = root.querySelector("[data-nomatch]")
    input.addEventListener("input", () => {
        const q = input.value.trim().toLowerCase()
        let shown = 0
        rows.forEach(row => {
            const match = row.dataset.name.includes(q)
            row.hidden = !match
            if (match) shown++
        })
        if (none) none.hidden = shown > 0
    })
}

function setup(root) {
    root.querySelectorAll("[data-editor]").forEach(setupEditor)
    setupFilter(root)
}

if (window.htmx) {
    htmx.onLoad(setup)
} else {
    document.addEventListener("DOMContentLoaded", () => setup(document))
}
