        function renderAssetLoadingUI(progress) {
            const loaded = Number(progress && progress.loaded) || 0;
            const total = Number(progress && progress.total) || 0;
            const percent = Number(progress && progress.percent) || 0;
            const failedCount = Number(progress && progress.failedCount) || 0;
            const currentLabel = shortAssetLabel(progress && progress.currentLabel ? progress.currentLabel : "準備中...");
            const visualPercent = Math.min(percent, getAssetLoadingTimePercent());

            if (els.assetLoadingText) {
                const failedSuffix = failedCount > 0 ? ` / 失敗 ${failedCount}` : "";
                els.assetLoadingText.innerText = `${loaded} / ${total} (${visualPercent}%)${failedSuffix}`;
            }
            if (els.assetLoadingBar) {
                els.assetLoadingBar.style.width = `${Math.max(0, Math.min(visualPercent, 100))}%`;
            }
            if (els.assetLoadingCurrent) {
                els.assetLoadingCurrent.innerText = `現在: ${currentLabel}`;
            }
        }

        function updateAssetLoadingUI(progress) {
            assetLoadingLastProgress = {
                loaded: Number(progress && progress.loaded) || 0,
                total: Number(progress && progress.total) || 0,
                percent: Number(progress && progress.percent) || 0,
                failedCount: Number(progress && progress.failedCount) || 0,
                currentLabel: progress && progress.currentLabel ? progress.currentLabel : "準備中..."
            };
            renderAssetLoadingUI(assetLoadingLastProgress);
        }

        function showAssetLoadingScreen() {
            if (!els.assetLoadingScreen) return;
            els.assetLoadingScreen.classList.remove("hidden");
            assetLoadingShownAt = Date.now();
            assetLoadingLastProgress = {
                loaded: 0,
                total: 0,
                percent: 0,
                failedCount: 0,
                currentLabel: "準備中..."
            };
            updateAssetLoadingUI({ loaded: 0, total: 0, percent: 0, currentLabel: "準備中...", failedCount: 0 });

            if (assetLoadingUiTimer) clearInterval(assetLoadingUiTimer);
            assetLoadingUiTimer = setInterval(() => {
                renderAssetLoadingUI(assetLoadingLastProgress);
            }, 80);

            if (els.assetLoadingFailed) {
                els.assetLoadingFailed.classList.add("hidden");
                els.assetLoadingFailed.innerHTML = "";
            }
            if (els.assetLoadingActions) {
                els.assetLoadingActions.classList.add("hidden");
            }
            if (els.assetLoadingRetryBtn) els.assetLoadingRetryBtn.disabled = false;
            if (els.assetLoadingContinueBtn) els.assetLoadingContinueBtn.disabled = false;
        }

        async function hideAssetLoadingScreen() {
            if (!els.assetLoadingScreen || els.assetLoadingScreen.classList.contains("hidden")) return;

            const elapsed = Date.now() - assetLoadingShownAt;
            const waitMs = Math.max(0, ASSET_LOADING_MIN_MS - elapsed);
            if (waitMs > 0) {
                await new Promise(resolve => setTimeout(resolve, waitMs));
            }
            renderAssetLoadingUI(assetLoadingLastProgress);

            els.assetLoadingScreen.classList.add("hidden");
            if (assetLoadingUiTimer) {
                clearInterval(assetLoadingUiTimer);
                assetLoadingUiTimer = null;
            }
            if (loadingActionResolver) {
                loadingActionResolver("continue");
                loadingActionResolver = null;
            }
        }

        async function showBootTransitionScreen() {
            if (!els.bootTransitionScreen) return;

            const screen = els.bootTransitionScreen;
            const title = els.bootTransitionTitle;
            let startWipeTimer = null;
            let forceFinishTimer = null;
            let finished = false;
            let resolved = false;

            const finish = () => {
                if (finished) return;
                finished = true;

                if (startWipeTimer) clearTimeout(startWipeTimer);
                if (forceFinishTimer) clearTimeout(forceFinishTimer);

                screen.classList.add("hidden");
                screen.classList.remove("is-wiping");
                if (title) title.classList.remove("is-active");
                screen.removeEventListener("animationend", onAnimEnd);
            };

            const finalize = (resolve) => {
                if (resolved) return;
                resolved = true;
                finish();
                resolve();
            };

            const onAnimEnd = (ev) => {
                if (ev.target !== screen) return;
                if (ev.animationName === "sekiBootNoiseOut" || ev.animationName === "sekiBootFadeOut") {
                    if (pendingResolve) finalize(pendingResolve);
                }
            };

            let pendingResolve = null;
            const waitOneFrame = () => new Promise(resolve => {
                let done = false;
                const finish = () => {
                    if (done) return;
                    done = true;
                    resolve();
                };
                const fallback = setTimeout(finish, 34);
                if (typeof requestAnimationFrame === "function") {
                    requestAnimationFrame(() => {
                        clearTimeout(fallback);
                        finish();
                    });
                }
            });

            screen.classList.remove("hidden");
            screen.classList.remove("is-wiping");
            if (title) title.classList.add("is-active");
            playSoundEffect('BOOTING');
            void screen.offsetWidth;

            screen.addEventListener("animationend", onAnimEnd);
            await waitOneFrame();
            await waitOneFrame();

            await new Promise(resolve => {
                pendingResolve = resolve;
                startWipeTimer = setTimeout(() => {
                    screen.classList.add("is-wiping");
                }, 980);

                forceFinishTimer = setTimeout(() => {
                    finalize(resolve);
                }, 2300);
            });
        }

        function renderAssetLoadingFailed(failedList) {
            if (!els.assetLoadingFailed || !els.assetLoadingActions) return;

            if (!Array.isArray(failedList) || failedList.length === 0) {
                els.assetLoadingFailed.classList.add("hidden");
                els.assetLoadingFailed.innerHTML = "";
                els.assetLoadingActions.classList.add("hidden");
                return;
            }

            const firstFive = failedList.slice(0, 5);
            const restCount = Math.max(0, failedList.length - firstFive.length);
            const listHtml = firstFive
                .map(item => `<li>${escapeHtml(shortAssetLabel(item && item.label ? item.label : item.url))}</li>`)
                .join("");
            const moreText = restCount > 0 ? `<div>...ほか ${restCount} 件</div>` : "";

            els.assetLoadingFailed.innerHTML = `
                <div>読み込み失敗: ${failedList.length} 件</div>
                <ul>${listHtml}</ul>
                ${moreText}
            `;
            els.assetLoadingFailed.classList.remove("hidden");
            els.assetLoadingActions.classList.remove("hidden");
        }

        function waitAssetLoadingAction() {
            if (!els.assetLoadingRetryBtn || !els.assetLoadingContinueBtn) return Promise.resolve("continue");

            if (loadingActionResolver) {
                loadingActionResolver("continue");
                loadingActionResolver = null;
            }

            return new Promise(resolve => {
                loadingActionResolver = resolve;

                els.assetLoadingRetryBtn.onclick = () => {
                    if (!loadingActionResolver) return;
                    const fn = loadingActionResolver;
                    loadingActionResolver = null;
                    fn("retry");
                };

                els.assetLoadingContinueBtn.onclick = () => {
                    if (!loadingActionResolver) return;
                    const fn = loadingActionResolver;
                    loadingActionResolver = null;
                    fn("continue");
                };
            });
        }

        const ROOM_CAPACITY = 5;
        let roomSuggestionTimer = null;
        let roomSuggestionCache = [];

