        function syncAppViewportHeight() {
            const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
            const safeHeight = Math.max(1, Math.round(viewportHeight || 0));
            document.documentElement.style.setProperty("--app-height", `${safeHeight}px`);
        }

        function readCssPxVar(varName, fallbackValue) {
            const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
            const parsed = parseFloat(raw);
            return Number.isFinite(parsed) ? parsed : fallbackValue;
        }

        function syncDesktopSideMode() {
            if (!document.body) return;

            const visualWidth = (window.visualViewport && Number(window.visualViewport.width)) ? Number(window.visualViewport.width) : 0;
            const innerWidthSafe = Number(window.innerWidth) || 0;
            const safeWidth = Math.max(0, visualWidth, innerWidthSafe);
            const gameMaxWidth = readCssPxVar("--seki-game-max-width", 800);
            const sidePanelWidth = (safeWidth - gameMaxWidth) / 2;

            const canUseDesktopSidePanels = sidePanelWidth >= 220;

            document.body.classList.toggle("desktop-side-mode", canUseDesktopSidePanels);
        }

        function resetViewportScrollTop() {
            window.scrollTo(0, 0);
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
        }

        function stabilizeViewportForGameEntry() {
            const activeEl = document.activeElement;
            if (activeEl && typeof activeEl.blur === "function") {
                activeEl.blur();
            }
            syncAppViewportHeight();
            syncDesktopSideMode();
            resetViewportScrollTop();
        }

        syncAppViewportHeight();
        syncDesktopSideMode();
        window.addEventListener("resize", () => {
            syncAppViewportHeight();
            syncDesktopSideMode();
        });
        window.addEventListener("orientationchange", () => {
            setTimeout(() => {
                syncAppViewportHeight();
                syncDesktopSideMode();
                resetViewportScrollTop();
            }, 120);
        });
        if (window.visualViewport && typeof window.visualViewport.addEventListener === "function") {
            window.visualViewport.addEventListener("resize", () => {
                syncAppViewportHeight();
                syncDesktopSideMode();
            });
        }

        function resetMyHandLayout(container = els.hand) {
            if (!container) return;
            const cards = container.querySelectorAll(".card");
            cards.forEach(card => {
                card.style.marginLeft = "";
                card.style.zIndex = "";
                card.style.position = "";
            });
        }

        function updateMyHandOverlap(container) {
            if (!container) return;
            const cards = Array.from(container.querySelectorAll(".card"));
            const cardCount = cards.length;
            if (cardCount === 0) return;

            const firstCard = cards[0];
            const cardWidth = Math.max(1, firstCard.offsetWidth || 0);
            const firstStyle = window.getComputedStyle(firstCard);
            const marginLeft = parseFloat(firstStyle.marginLeft) || 0;
            const marginRight = parseFloat(firstStyle.marginRight) || 0;
            let baseGap = marginLeft + marginRight;

            if (cardCount > 1) {
                const secondCard = cards[1];
                const measuredGap = secondCard.offsetLeft - firstCard.offsetLeft - cardWidth;
                if (Number.isFinite(measuredGap) && measuredGap >= 0) {
                    baseGap = measuredGap;
                }
            }

            const containerWidth = Math.max(0, container.clientWidth);
            let overlap = 0;

            if (cardCount > 1 && containerWidth > 0) {
                const neededOverlap = Math.ceil(((cardCount * cardWidth) + ((cardCount - 1) * baseGap) - containerWidth) / (cardCount - 1));
                const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

                const normalMinVisibleWidth = 18;
                const extremeMinVisibleWidth = 1;

                const maxOverlapNormal = Math.max(0, cardWidth - normalMinVisibleWidth);
                overlap = clamp(neededOverlap, 0, maxOverlapNormal);

                if (neededOverlap > maxOverlapNormal) {
                    const maxOverlapExtreme = Math.max(0, cardWidth - extremeMinVisibleWidth);
                    overlap = clamp(neededOverlap, 0, maxOverlapExtreme);
                }
            }

            cards.forEach((card, idx) => {
                card.style.position = "relative";
                if (idx > 0 && overlap > 0) {
                    card.style.marginLeft = `${marginLeft - overlap}px`;
                }

                const normalZIndex = idx + 1;
                const selectedZIndex = cardCount + 200 + idx;
                card.style.zIndex = String(card.classList.contains("selected") ? selectedZIndex : normalZIndex);
            });
        }

        function applyMyHandLayout() {
            if (!els.hand) return;
            resetMyHandLayout(els.hand);
            updateMyHandOverlap(els.hand);
        }

        function refreshMyHandCardZIndex(container = els.hand) {
            if (!container) return;
            const cards = Array.from(container.querySelectorAll(".card"));
            const cardCount = cards.length;
            cards.forEach((card, idx) => {
                const normalZIndex = idx + 1;
                const selectedZIndex = cardCount + 200 + idx;
                card.style.zIndex = String(card.classList.contains("selected") ? selectedZIndex : normalZIndex);
            });
        }

        function updateMyHandSelectionVisual(container = els.hand) {
            if (!container) return;
            const handCards = Array.from(container.querySelectorAll("[data-hand-index]"));
            handCards.forEach(card => {
                const cardIdx = Number(card.dataset.handIndex);
                const isSelected = Number.isFinite(cardIdx) && cardIdx === selectedIdx;
                card.classList.toggle("selected", isSelected);
            });
            refreshMyHandCardZIndex(container);
        }

        function refreshRoleDraftMonitorLayout() {
            const monitor = els.roleDraftMonitor || document.getElementById("role-draft-monitor");
            if (!monitor || monitor.classList.contains("hidden")) return;
            if (!monitor.dataset.roleDraftPhase) return;
            applyRoleDraftLayoutDensity(monitor);
        }

        window.addEventListener("resize", () => {
            applyMyHandLayout();
            refreshRoleDraftMonitorLayout();
        });
        window.addEventListener("orientationchange", () => {
            setTimeout(() => {
                applyMyHandLayout();
                refreshRoleDraftMonitorLayout();
            }, 140);
        });
        if (window.visualViewport && typeof window.visualViewport.addEventListener === "function") {
            window.visualViewport.addEventListener("resize", () => {
                applyMyHandLayout();
                refreshRoleDraftMonitorLayout();
            });
        }
