    /* --- 1. 既存モーダルに共通補助ボタンを注入 --- */
    if (!window._origOpenModal) window._origOpenModal = window.openModal;
    if (!window._origCloseModal) window._origCloseModal = window.closeModal;

    let mainModalBoardMode = false;
    const TURN_GUARD_ACTIONS = new Set([
        "playCard",
        "execPassDraw",
        "execPassNoDraw",
        "execPassPlay",
        "execPassKeep",
        "handleSymbol",
        "execDigUp",
        "execTradeWhiff",
        "execTrade",
        "execDiscard",
        "execAngler",
        "endThiefTurn",
        "execHunterSwap",
        "execGamblerGuess",
        "execGamblerDiscard",
        "execMagicianReverse",
        "execMagicianTrade",
        "execMagicianDigUp",
        "execEmperorSelect",
        "endPoliceTurn",
        "execPoliceTrade",
        "execHacker",
        "execAlchemist",
        "execAlchemistKeep",
        "activateAngler",
        "activateFortuneTeller",
        "activateThief",
        "activateHunter",
        "activateGambler",
        "activateMagician",
        "activateMillionaire",
        "activateEmperor",
        "activatePoliceOfficer",
        "activateHacker",
        "activateAlchemist",
        "activateNecromancer",
        "activateAgent"
    ]);
    const LOCK_GUARD_ACTIONS = new Set([
        "execAngler",
        "endThiefTurn",
        "execHunterSwap",
        "execGamblerGuess",
        "execGamblerDiscard",
        "execMagicianReverse",
        "execMagicianTrade",
        "execMagicianDigUp",
        "execEmperorSelect",
        "endPoliceTurn",
        "execPoliceTrade",
        "execHacker",
        "execAlchemist",
        "execAlchemistKeep",
        "activateAngler",
        "activateFortuneTeller",
        "activateThief",
        "activateHunter",
        "activateGambler",
        "activateMagician",
        "activateMillionaire",
        "activateEmperor",
        "activatePoliceOfficer",
        "activateHacker",
        "activateAlchemist",
        "activateNecromancer",
        "activateAgent"
    ]);

    function installActionGuardWrappers() {
        if (window.__sekiActionGuardInstalled) return;
        window.__sekiActionGuardInstalled = true;

        const allNames = Array.from(new Set([...TURN_GUARD_ACTIONS, ...LOCK_GUARD_ACTIONS]));
        allNames.forEach((name) => {
            const original = window[name];
            if (typeof original !== "function") return;
            if (original.__sekiGuardWrapped) return;

            const wrapped = async function(...args) {
                const runOriginal = () => original.apply(this, args);
                if (TURN_GUARD_ACTIONS.has(name) && typeof isMyTurn === "function" && !isMyTurn()) {
                    return showInfoModal("エラー", "あなたの番ではありません。");
                }
                if (LOCK_GUARD_ACTIONS.has(name) && typeof runGuardedAction === "function") {
                    return runGuardedAction(name, runOriginal);
                }
                return runOriginal();
            };

            wrapped.__sekiGuardWrapped = true;
            wrapped.__sekiGuardOriginal = original;
            window[name] = wrapped;
        });
    }

    installActionGuardWrappers();

    function setMainModalBoardMode(enabled) {
        mainModalBoardMode = !!enabled;
        const overlay = document.getElementById("modal-overlay");
        const toggleBtn = document.getElementById("modal-board-toggle");

        if (overlay) overlay.classList.toggle("board-visible", mainModalBoardMode);
        if (toggleBtn) {
            toggleBtn.classList.toggle("active", mainModalBoardMode);
            toggleBtn.textContent = mainModalBoardMode ? "👁 盤面ON" : "👁 盤面OFF";
        }
    }

    function toggleMainModalBoardMode() {
        setMainModalBoardMode(!mainModalBoardMode);
    }

    function ensureMainModalTools() {
        const box = document.getElementById("modal-box");
        if (!box) return;

        if (getComputedStyle(box).position === "static") box.style.position = "relative";

        let btnDiv = document.getElementById("modal-help-btns");
        if (!btnDiv) {
            btnDiv = document.createElement("div");
            btnDiv.id = "modal-help-btns";
            btnDiv.innerHTML = `
                <button class="help-icon-btn" onclick="showRuleSub()" title="ルール">📖</button>
                <button class="help-icon-btn" onclick="showRoleSub()" title="役職一覧">👥</button>
            `;
            box.appendChild(btnDiv);
        }

        let boardBtn = document.getElementById("modal-board-toggle");
        if (!boardBtn) {
            boardBtn = document.createElement("button");
            boardBtn.id = "modal-board-toggle";
            boardBtn.type = "button";
            boardBtn.setAttribute("onclick", "toggleMainModalBoardMode()");
            boardBtn.title = "盤面確認";
            box.appendChild(boardBtn);
        }
    }

    window.openModal = function(title, html, options = {}) {
        window._origOpenModal(title, html, options);
        ensureMainModalTools();
        setMainModalBoardMode(false);
    };

    window.closeModal = function() {
        setMainModalBoardMode(false);
        window._origCloseModal();
    };

    const modalOverlay = document.getElementById("modal-overlay");
    if (modalOverlay && !window._modalBoardObserverAttached) {
        window._modalBoardObserverAttached = true;
        let lastMainModalHiddenState = modalOverlay.classList.contains("hidden");
        const observer = new MutationObserver(() => {
            const isHidden = modalOverlay.classList.contains("hidden");
            if (lastMainModalHiddenState && !isHidden) {
                ensureMainModalTools();
                setMainModalBoardMode(false);
            }
            lastMainModalHiddenState = isHidden;
        });
        observer.observe(modalOverlay, { attributes: true, attributeFilter: ["class"] });
        if (!modalOverlay.classList.contains("hidden")) {
            ensureMainModalTools();
            setMainModalBoardMode(false);
        }
    }

    /* --- 2. サブモーダル制御 --- */
    function openSubModal(title, html) {
        document.getElementById("sub-modal-title").innerText = title;
        document.getElementById("sub-modal-body").innerHTML = html;
        document.getElementById("sub-modal-overlay").classList.remove("hidden");
    }

    function closeSubModal() {
        document.getElementById("sub-modal-overlay").classList.add("hidden");
    }

    /* --- 3. 共通ガイド表示 --- */
    function showRuleSub() {
        openGuide("rule", "sub");
    }

    function showRoleSub() {
        openGuide("role", "sub");
    }

    window.closeSubModal = closeSubModal;
    window.toggleMainModalBoardMode = toggleMainModalBoardMode;
    window.showRuleSub = showRuleSub;
    window.showRoleSub = showRoleSub;
