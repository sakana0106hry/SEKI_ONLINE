        function passTurn() {
            if (!gameState || gameState.status !== "playing") {
                return showInfoModal("待機中", "まだゲームは開始していません。");
            }
            if (!isMyTurn()) return;
            
            let activeCount = getActiveCount(gameState);
            let top = getTop(gameState.graveNum);
            let resetHolder = top ? top.owner : null;

            let isOwnerReset = (resetHolder === myId && (gameState.graveNum||[]).length > 0);

            // ★修正: 共通関数を使ってリセット権の継承判定を行う
            let isInheritedReset = checkInheritedResetLogic(gameState, myId);

            if (isOwnerReset || isInheritedReset) {
                const resetNotice = renderNoticeBlock("※リセット権を行使します（場が流れ、自分のターンが続きます）", "warn");
                openModal(
                    "パス (リセット権行使)",
                    `山札からドローしますか？<br><br>${resetNotice}<br><br>${renderModalButton("ドローする", "execPassDraw(true)", "primary")}${renderModalButton("しない", "execPassNoDraw(true)", "ghost")}`
                );
                return;
            }

            openModal(
                "パス",
                `山札からドローしますか？<br><br>${renderModalButton("ドローする", "execPassDraw(false)", "primary")}${renderModalButton("しない", "execPassNoDraw(false)", "ghost")}`
            );
        }

        async function execPassNoDraw(isReset) {
            return runGuardedAction("execPassNoDraw", async () => {
                if (!isMyTurn()) return showInfoModal("エラー", "あなたの番ではありません。");
                closeModal();

                const txResult = await runTurnTransaction("execPassNoDraw", (state, ctx) => {
                    if (isReset) {
                        const excl = [...(state.exclusion || []), ...(state.graveNum || [])];
                        state.exclusion = excl;
                        state.graveNum = [];
                        state.passCount = 0;
                        state.lastSound = { type: "RESET", id: ctx.now };
                        ctx.appendLog(`${myName}がドローせずリセットしました`, "public");
                    } else {
                        state.passCount = (state.passCount || 0) + 1;
                        ctx.appendLog(`${myName}がドローせずパスしました`, "public");
                        state.turnIdx = ctx.getNextTurnIdx(state.rankings || {});
                    }
                    return true;
                });

                if (!txResult.committed) showTurnActionError(txResult.reason);
            });
        }

        // ↓↓↓ execPassDraw関数を丸ごとこれに置き換えてください ↓↓↓
        async function execPassDraw(isReset) {
            return runGuardedAction("execPassDraw", async () => {
                if (!isMyTurn()) return showInfoModal("エラー", "あなたの番ではありません。");
                closeModal();

                let drawResult = null;
                const txResult = await runTurnTransaction("execPassDraw", (state, ctx) => {
                    let deck = [...(state.deckNum || [])];

                    if (deck.length === 0) {
                        const excl = [...(state.exclusion || [])];
                        let refillDeck = excl.filter(c => c && c.type === "num");
                        const remainingExcl = excl.filter(c => !c || c.type !== "num");

                        if (refillDeck.length > 0) {
                            shuffle(refillDeck);
                            deck = refillDeck;
                            state.exclusion = remainingExcl;
                            ctx.appendLog("除外場から数字山札を補充しました", "public");
                        } else {
                            if (isReset) {
                                const resetExcl = [...(state.exclusion || []), ...(state.graveNum || [])];
                                state.exclusion = resetExcl;
                                state.graveNum = [];
                                state.passCount = 0;
                                state.lastSound = { type: "RESET", id: ctx.now };
                                ctx.appendLog(`${myName}がドローせずリセットしました`, "public");
                            } else {
                                state.passCount = (state.passCount || 0) + 1;
                                ctx.appendLog(`${myName}がドローせずパスしました`, "public");
                                state.turnIdx = ctx.getNextTurnIdx(state.rankings || {});
                            }
                            drawResult = { mode: "no-draw" };
                            return true;
                        }
                    }

                    const card = deck.pop();
                    if (!card) return false;

                    state.deckNum = deck;

                    const top = getTop(state.graveNum || []);
                    const playable = !isReset && (card.type === "num" && canPlay(card, top, state.isReverse, state));

                    if (playable) {
                        drawResult = { mode: "choice", card: { ...card } };
                        return true;
                    }

                    let hand = [...((state.hands && state.hands[myId]) || [])];
                    hand.push(card);
                    hand = sortCards(hand);
                    state.hands = state.hands || {};
                    state.hands[myId] = hand;

                    const msg = isReset ? "(リセットのため手札に入れます)" : "(出せないので手札に入れます)";
                    ctx.appendLog(`[${card.val}] を引きました ${msg}`, "private", myId);

                    if (isReset) {
                        const resetExcl = [...(state.exclusion || []), ...(state.graveNum || [])];
                        state.exclusion = resetExcl;
                        state.graveNum = [];
                        state.passCount = 0;
                        state.lastSound = { type: "RESET", id: ctx.now };
                        ctx.appendLog(`${myName}がリセットして1枚引きました`, "public");
                    } else {
                        state.passCount = (state.passCount || 0) + 1;
                        ctx.appendLog(`${myName}がパスして1枚引きました`, "public");
                        state.turnIdx = ctx.getNextTurnIdx(state.rankings || {});
                    }

                    drawResult = { mode: "auto-keep" };
                    return true;
                });

                if (!txResult.committed) {
                    showTurnActionError(txResult.reason);
                    return;
                }

                if (!drawResult || drawResult.mode === "auto-keep") {
                    drawnCardTemp = null;
                    return;
                }

                if (drawResult.mode === "no-draw") {
                    drawnCardTemp = null;
                    showInfoModal("通知", "山札も除外場もありません。ドローなしでパスします。");
                    return;
                }

                drawnCardTemp = drawResult.card;
                let imgUrl = CARD_IMAGES[drawResult.card.val];
                let imgStyle = imgUrl ? `background-image:url('${imgUrl}'); color:transparent; border:2px solid #fff;` : '';
                let cardHtml = `<div class="card ${drawResult.card.type}" style="display:inline-flex; ${imgStyle}">${drawResult.card.val}</div>`;
                let html = `引いたカード: ${cardHtml}<br>これを出しますか？<br><br>
                            <button class='modal-btn primary' onclick='execPassPlay()'>出す</button>
                            <button class='modal-btn' onclick='execPassKeep()'>手札に入れる</button>`;

                openModal("ドロー結果", html);
                if (document.getElementById("modal-footer")) {
                    document.getElementById("modal-footer").innerHTML = "";
                }
            });
        }

        async function execPassPlay() {
            return runGuardedAction("execPassPlay", async () => {
                if (!isMyTurn()) return showInfoModal("エラー", "あなたの番ではありません。");
                closeModal();
                let card = drawnCardTemp ? { ...drawnCardTemp } : null;
                if (!card) return;

                const txResult = await runTurnTransaction("execPassPlay", (state, ctx) => {
                    const gn = [...(state.graveNum || [])];
                    gn.push({ ...card, owner: myId });
                    state.graveNum = gn;
                    state.passCount = 0;
                    ctx.appendLog(`${myName}がパスドローから [${card.val}] を出しました`, "public");
                    state.turnIdx = ctx.getNextTurnIdx(state.rankings || {});
                    return true;
                });

                if (!txResult.committed) {
                    showTurnActionError(txResult.reason);
                    return;
                }
                drawnCardTemp = null;
            });
        }

        async function execPassKeep(isReset = false) {
            return runGuardedAction("execPassKeep", async () => {
                if (!isMyTurn()) return showInfoModal("エラー", "あなたの番ではありません。");
                closeModal();
                let card = drawnCardTemp ? { ...drawnCardTemp } : null;
                if (!card) return;

                const txResult = await runTurnTransaction("execPassKeep", (state, ctx) => {
                    let hand = [...((state.hands && state.hands[myId]) || [])];
                    hand.push(card);
                    hand = sortCards(hand);
                    state.hands = state.hands || {};
                    state.hands[myId] = hand;

                    if (isReset) {
                        const excl = [...(state.exclusion || []), ...(state.graveNum || [])];
                        state.exclusion = excl;
                        state.graveNum = [];
                        state.passCount = 0;
                        state.lastSound = { type: "RESET", id: ctx.now };
                        ctx.appendLog(`${myName}がリセットして1枚引きました`, "public");
                    } else {
                        state.passCount = (state.passCount || 0) + 1;
                        ctx.appendLog(`${myName}がパスして1枚引きました`, "public");
                        state.turnIdx = ctx.getNextTurnIdx(state.rankings || {});
                    }
                    return true;
                });

                if (!txResult.committed) {
                    showTurnActionError(txResult.reason);
                    return;
                }
                drawnCardTemp = null;
            });
        }

        async function playCard() {
            return runGuardedAction("playCard", async () => {
                if (!gameState || gameState.status !== "playing") {
                    return showInfoModal("待機中", "まだゲームは開始していません。");
                }
                if (selectedIdx === -1) return;
                if (!isMyTurn()) return showInfoModal("エラー", "あなたの番ではありません");

                let currentHand = sortCards(deepCopy(gameState.hands[myId]));
                const card = currentHand[selectedIdx];
                if (!card) return;
                
                if (card.type === 'num') {
                    let myHackedCount = (gameState.hackedHands && gameState.hackedHands[myId]) ? gameState.hackedHands[myId].length : 0;
                    if (Number(card.val) === 0 && (currentHand.length + myHackedCount) === 1) {
                        return showInfoModal("禁止あがり", "最後の一枚が「0」であがることはできません。");
                    }

                    const top = getTop(gameState.graveNum);
                    if (!canPlay(card, top, gameState.isReverse, gameState)) {
                        return showInfoModal("エラー", "そのカードは出せません");
                    }

                    const txResult = await runTurnTransaction("playCard", (state, ctx) => {
                        let txHand = sortCards(deepCopy((state.hands && state.hands[myId]) || []));
                        if (selectedIdx < 0 || selectedIdx >= txHand.length) return false;

                        const txCard = txHand[selectedIdx];
                        if (!txCard || txCard.type !== "num") return false;
                        let myTxHackedCount = (state.hackedHands && state.hackedHands[myId]) ? state.hackedHands[myId].length : 0;
                        if (Number(txCard.val) === 0 && (txHand.length + myTxHackedCount) === 1) return false;

                        const txTop = getTop(state.graveNum || []);
                        if (!canPlay(txCard, txTop, state.isReverse, state)) return false;

                        txHand.splice(selectedIdx, 1);
                        state.hands = state.hands || {};
                        state.hands[myId] = txHand;

                        let nextTotal = txHand.length + myTxHackedCount;
                        let soundList = ['PUT'];
                        if (nextTotal === 1) soundList.push('UNO');
                        else if (nextTotal === 2) soundList.push('DOS');

                        state.lastSound = { type: soundList, id: ctx.now };
                        let newGraveNum = [...(state.graveNum || [])];
                        newGraveNum.push({ ...txCard, owner: myId });
                        state.graveNum = newGraveNum;
                        state.passCount = 0;
                        ctx.appendLog(`${myName}が [${txCard.val}] を出しました`, 'public');

                        let tempRankings = {...(state.rankings || {})};
                        if (txHand.length === 0 && myTxHackedCount === 0) {
                            let currentRank = Object.keys(state.rankings || {}).length + 1;
                            state.rankings = { ...(state.rankings || {}), [myId]: currentRank };
                            ctx.appendLog(`${myName}が ${currentRank}位 であがりました！`, 'public');

                            state.lastWinnerId = myId;
                            state.lastWinnerTime = ctx.now;

                            let totalPlayers = state.playerOrder.length;
                            appendRankSound(soundList, currentRank, totalPlayers);

                            if (currentRank >= totalPlayers - 1) {
                                state.status = "finished";
                                let loserId = state.playerOrder.find(pid => !(state.rankings && state.rankings[pid]) && pid !== myId);
                                if (loserId) {
                                    state.rankings = { ...(state.rankings || {}), [loserId]: totalPlayers };
                                    appendRankSound(soundList, totalPlayers, totalPlayers);

                                    let lHand = (state.hands && state.hands[loserId]) ? state.hands[loserId] : [];
                                    let lHacked = (state.hackedHands && state.hackedHands[loserId]) ? state.hackedHands[loserId] : [];
                                    let allL = [...lHand, ...lHacked];
                                    let lText = allL.map(c => c.val).join(", ") || "なし";
                                    let lName = (state.players && state.players[loserId]) ? state.players[loserId].name : "Player";
                                    ctx.appendLog(`全順位確定！！最下位 ${lName} の残り手札: [${lText}]`, 'public');
                                } else {
                                    ctx.appendLog(`全順位が確定しました！！`, 'public');
                                }
                            }
                            tempRankings[myId] = 99;
                        }

                        state.turnIdx = ctx.getNextTurnIdx(tempRankings);
                        return true;
                    });

                    if (!txResult.committed) {
                        showTurnActionError(txResult.reason);
                        return;
                    }

                    selectedIdx = -1;
                    if (
                        txResult.snapshot &&
                        txResult.snapshot.status === "finished" &&
                        txResult.snapshot.rankings &&
                        txResult.snapshot.playerOrder
                    ) {
                        updateFinalScores(txResult.snapshot.rankings, txResult.snapshot.playerOrder);
                    }
                } else {
                    await handleSymbol(card, selectedIdx, currentHand);
                }
            });
        }

        async function handleSymbol(card, idx, currentHand) {
            if (!isMyTurn()) return showInfoModal("エラー", "あなたの番ではありません。");
            // ▼▼▼ 修正箇所: ロック中のカードも考慮して「あがり」かどうか判定する ▼▼▼
            let myHackedCount = (gameState.hackedHands && gameState.hackedHands[myId]) ? gameState.hackedHands[myId].length : 0;
            
            if (currentHand.length === 1 && myHackedCount === 0) return showInfoModal("禁止あがり", "記号であがることはできません。");
            
            
            if (card.val === "DIG UP") {
                const hasNum = currentHand.some((c, i) => i !== idx && c.type === 'num');
                if (!hasNum) return showInfoModal("使用不可", "手札に数字カードがないため、DIG UPは使用できません。");
                let gn = gameState.graveNum || [];
                if (gn.length === 0) return showInfoModal("使用不可", "数字墓地がないため使用できません");
                
                let top = gn[gn.length-1];
                let imgUrl = CARD_IMAGES[top.val];
                let imgStyle = imgUrl ? `background-image:url('${imgUrl}'); color:transparent; border:2px solid #fff;` : '';
                let topCardHtml = `<div class="card ${top.type}" style="${imgStyle} display:inline-flex;">${top.val}</div>`;

                let html = `<p>墓地の ${topCardHtml} を手札に入れます。<br>代わりに場に埋めるカード(手札)を選んでください。</p><div class="modal-list">`;
                currentHand.forEach((c, i) => {
                    if (i === idx) return; 
                    if (c.type !== 'num') return; 
                    let style = '';
                    let cImg = CARD_IMAGES[c.val];
                    if(cImg) style += `background-image:url('${cImg}'); color:transparent; border:2px solid #fff;`;
                    html += `<div class="card ${c.type}" style="${style}" onclick="execDigUp(${idx}, ${i})">${c.val}</div>`;
                });
                html += `</div>`;
                openModal("DIG UP: 交換", html);
                return;
            }
            if (card.val === "TRADE") {
                let pIds = gameState.playerOrder;
                let html = `<p>トレード相手を選んでください。</p>`;
                let canUseTarget = false;
                const activePids = pIds.filter(pid => !(gameState.rankings && gameState.rankings[pid]));
                const onlyOtherPid = (activePids.length === 2) ? activePids.find(pid => pid !== myId) : null;
                const canWhiffTrade = !!(onlyOtherPid && isPoliticianShieldActive(onlyOtherPid));
                pIds.forEach(pid => {
                    if (pid === myId || (gameState.rankings && gameState.rankings[pid])) return;
                    let p = gameState.players[pid];
                    let count = gameState.hands[pid] ? gameState.hands[pid].length : 0;
                    if (count > 0) {
                        if (isPoliticianShieldActive(pid)) {
                            html += `<button class="modal-btn is-disabled" disabled>${p.name} (政治家で対象外)</button>`;
                        } else {
                            canUseTarget = true;
                            html += `<button class="modal-btn" onclick="tradeStep2('${pid}', ${idx})">${p.name} (手札${count})</button>`;
                        }
                    }
                });
                if (!canUseTarget) {
                    html += `<p class="modal-note">対象にできるプレイヤーがいません。</p>`;
                    if (canWhiffTrade) {
                        const otherName = (gameState.players && gameState.players[onlyOtherPid]) ? gameState.players[onlyOtherPid].name : "相手";
                        html += `
                            <div class="seki-section warn">
                                <p class="modal-note warn warn-block">
                                    2人終盤かつ ${otherName} が[政治家]保護中のため、TRADEを空振り消費できます。
                                </p>
                                <button class="modal-btn primary" onclick="execTradeWhiff(${idx}, '${onlyOtherPid}')">空振りでTRADEを使用する</button>
                            </div>
                        `;
                    }
                }
                openModal("TRADE: 相手選択", html);
                return;
            }
            if (card.val === "DISCARD") {
                let newHand = [...currentHand];
                // 使用したDISCARDカード以外をリスト化
                let discardable = newHand.filter((_, i) => i !== idx);
                
                // ★追加: 捨てられる数字カードがあるかチェック
                let hasNum = discardable.some(c => c.type === 'num');
                if (!hasNum) return showInfoModal("エラー", "捨てることのできる数字カードがありません");

                let html = `<p>捨てるカードを選んでください<br><span style="font-size:12px; color:#ef5350;">※数字カードのみ選択可能です</span></p><div class="modal-list">`;
                discardable.forEach((c, i) => {
                    let style = '';
                    let onClick = '';
                    let cImg = CARD_IMAGES[c.val];

                    // ★変更: 数字カードなら選択可能、記号カードなら選択不可
                    if (c.type === 'num') {
                        // 選択可能
                        style = 'cursor:pointer; transition:transform 0.1s; ';
                        if(cImg) style += `background-image:url('${cImg}'); color:transparent; border:2px solid #fff;`;
                        onClick = `onclick="execDiscard(${idx}, ${i})"`;
                    } else {
                        // 選択不可 (グレーアウト)
                        style = 'opacity:0.3; cursor:not-allowed; border:1px dashed #777; background:rgba(0,0,0,0.2); transform:scale(0.95);';
                        if(cImg) {
                            style += `background-image:url('${cImg}'); background-size:cover; background-position:center; color:transparent;`;
                        }
                    }

                    html += `<div class="card ${c.type}" style="${style}" ${onClick}>${c.val}</div>`;
                });
                html += `</div>`;
                openModal("DISCARD: 手札破棄", html);
                return;
            }

            // ↓↓↓ handleSymbol関数内の lastSound 送信部分をこれに書き換え ↓↓↓
            // ---------------------------------------------------------
            // ★修正: REVERSEなどの即時発動カード処理
            // ---------------------------------------------------------
            const txResult = await runTurnTransaction("handleSymbol", (state, ctx) => {
                let txHand = sortCards(deepCopy((state.hands && state.hands[myId]) || []));
                if (!Number.isInteger(idx) || idx < 0 || idx >= txHand.length) return false;

                const txCard = txHand[idx];
                if (!txCard || txCard.type !== "sym") return false;
                if (txCard.val === "DIG UP" || txCard.val === "TRADE" || txCard.val === "DISCARD") return false;

                txHand.splice(idx, 1);
                let myTxHackedCount = (state.hackedHands && state.hackedHands[myId]) ? state.hackedHands[myId].length : 0;
                let nextTotal = txHand.length + myTxHackedCount;

                let soundList = [txCard.val];
                if (nextTotal === 1) soundList.push('UNO');
                else if (nextTotal === 2) soundList.push('DOS');

                state.lastSound = { type: soundList, id: ctx.now };
                state.hands = state.hands || {};
                state.hands[myId] = txHand;

                let newGraveSym = [...(state.graveSym || [])];
                newGraveSym.push(txCard);
                state.graveSym = newGraveSym;
                clearPoliticianShieldInState(state, myId, ctx, `${txCard.val}使用`);

                let logMsg = `${myName}が [${txCard.val}] を使用して`;
                if (txCard.val === "REVERSE") {
                    state.isReverse = !state.isReverse;
                    logMsg += "強弱を逆転させました";
                }
                ctx.appendLog(logMsg, 'public');

                state.passCount = 0;
                state.turnIdx = ctx.getNextTurnIdx(state.rankings || {});
                return true;
            });

            if (!txResult.committed) {
                showTurnActionError(txResult.reason);
                return;
            }
            selectedIdx = -1;
        }

        // ↓↓↓ execDigUp関数を丸ごとこれに置き換えてください ↓↓↓
        async function execDigUp(digUpIdx, returnIdx) {
            return runGuardedAction("execDigUp", async () => {
                if (!isMyTurn()) return showInfoModal("エラー", "あなたの番ではありません。");
                closeModal();

                const txResult = await runTurnTransaction("execDigUp", (state, ctx) => {
                    let newHand = sortCards(deepCopy((state.hands && state.hands[myId]) || []));
                    let gn = [...(state.graveNum || [])];
                    if (gn.length === 0) return false;
                    if (!Number.isInteger(digUpIdx) || digUpIdx < 0 || digUpIdx >= newHand.length) return false;

                    let top = gn.pop();
                    let usedDigUp = newHand.splice(digUpIdx, 1)[0];
                    if (!usedDigUp || usedDigUp.val !== "DIG UP") return false;

                    let actualReturnIdx = (returnIdx > digUpIdx) ? returnIdx - 1 : returnIdx;
                    if (!Number.isInteger(actualReturnIdx) || actualReturnIdx < 0 || actualReturnIdx >= newHand.length) return false;
                    let retCard = newHand.splice(actualReturnIdx, 1)[0];
                    if (!retCard || retCard.type !== "num") return false;

                    newHand.push(top);
                    gn.push({ ...retCard, owner: myId });
                    newHand = sortCards(newHand);

                    let newGraveSym = [...(state.graveSym || []), usedDigUp];
                    let myHackedCount = (state.hackedHands && state.hackedHands[myId]) ? state.hackedHands[myId].length : 0;
                    let nextTotal = newHand.length + myHackedCount;

                    let soundList = ['DIG UP'];
                    if (nextTotal === 1) soundList.push('UNO');
                    else if (nextTotal === 2) soundList.push('DOS');

                    state.lastSound = { type: soundList, id: ctx.now };
                    state.hands = state.hands || {};
                    state.hands[myId] = newHand;
                    state.graveNum = gn;
                    state.graveSym = newGraveSym;
                    clearPoliticianShieldInState(state, myId, ctx, "DIG UP使用");
                    state.passCount = 0;
                    state.turnIdx = ctx.getNextTurnIdx(state.rankings || {});

                    ctx.appendLog(`${myName}が [DIG UP] を使用して [${top.val}] を回収し、[${retCard.val}] を埋めました。`, 'public');
                    return true;
                });

                if (!txResult.committed) {
                    showTurnActionError(txResult.reason);
                    return;
                }
                selectedIdx = -1;
            });
        }

        /* --- 通常のTRADE改修 (狙い撃ち対応) --- */

        // 元の tradeStep2 を「奪うカード選択」に上書き
        // (handleSymbol からはこれが呼ばれます)
        /* --- 修正版: tradeStep2 (フォントバレ防止) --- */
        function tradeStep2(targetId, tradeCardIdx) {
            if (!canTargetByHandInterference(targetId)) return;
            let targetHand = deepCopy(gameState.hands[targetId] || []);
            
            // 元のインデックスを記録してシャッフル
            targetHand.forEach((c, i) => c.originalIndex = i);
            shuffle(targetHand);

            let html = `<p>相手の手札から<strong>欲しいカード</strong>を選んでください。<br>
                        <span style="font-size:12px;">(通常は裏向きですが、公開カードは見えます)</span></p>
                        <div class="modal-list">`;

            targetHand.forEach(c => {
                let content = "?";
                let style = "cursor:pointer; background:#455a64; color:#cfd8dc; border:1px solid #78909c;";
                let cssClass = "card"; // ★修正: 初期値はただのcard

                // 公開カードなら中身を表示
                // ★ハッキングチェック
                if (c.isHacked) {
                    cssClass += " hacked";
                    style = "cursor:not-allowed; border:1px solid #5f6f82; background:#2a3440; color:#cfd8dc;";
                    content = "🔒"; // 裏向きでもロックされていることはわかる
                    onClick = ""; // クリック無効
                }
                // 公開カードチェック (ハックされてたらロック優先)
                else if (c.isOpen) {
                    cssClass = `card ${c.type}`;
                    content = c.val;
                    style = "cursor:pointer; ";
                    let cImg = CARD_IMAGES[c.val];
                    if (cImg) style += `background-image:url('${cImg}'); color:transparent; border:2px solid #fff;`;
                }

                html += `<div class="${cssClass}" style="${style}" 
                        onclick="tradeStep3('${targetId}', ${tradeCardIdx}, ${c.originalIndex})">
                        ${content}
                        </div>`;
            });
            
            html += `</div>`;
            openModal("TRADE: 略奪選択", html);
        }

        // 新設: 自分の渡すカードを選ぶ (旧 tradeStep2 の中身)
        function tradeStep3(targetId, tradeCardIdx, takeIdx) {
            let myHand = sortCards(deepCopy(gameState.hands[myId]));
            let html = `<p>相手に渡すカードを選んでください。</p><div class="modal-list">`;
            
            myHand.forEach((c, i) => {
                if (i === tradeCardIdx) return; // コストとして払うTRADEカードは選べない
                
                let style = "";
                let cImg = CARD_IMAGES[c.val];
                if (cImg) {
                    style = `background-image:url('${cImg}'); color:transparent; border:2px solid #fff;`;
                }

                // 実行 (execTrade に takeIdx を渡す)
                html += `<div class="card ${c.type}" style="${style} cursor:pointer;" 
                        onclick="execTrade('${targetId}', ${tradeCardIdx}, ${i}, ${takeIdx})">${c.val}</div>`;
            });
            
            html += `</div>`;
            openModal("TRADE: 譲渡選択", html);
        }

        // 2人終盤かつ相手が政治家保護中のときだけ使えるTRADE空振り消費
        async function execTradeWhiff(tradeCardIdx, blockedPid) {
            return runGuardedAction("execTradeWhiff", async () => {
                if (!isMyTurn()) return showInfoModal("エラー", "あなたの番ではありません。");
                closeModal();

                const txResult = await runTurnTransaction("execTradeWhiff", (state, ctx) => {
                    let myHand = sortCards(deepCopy((state.hands && state.hands[myId]) || []));
                    if (!Number.isInteger(tradeCardIdx) || tradeCardIdx < 0 || tradeCardIdx >= myHand.length) return false;
                    if (!myHand[tradeCardIdx] || myHand[tradeCardIdx].val !== "TRADE") return false;

                    const activePids = (state.playerOrder || []).filter(pid => !(state.rankings && state.rankings[pid]));
                    const onlyOtherPid = (activePids.length === 2) ? activePids.find(pid => pid !== myId) : null;
                    const isBlocked = !!(onlyOtherPid && onlyOtherPid === blockedPid && isPoliticianShieldActive(onlyOtherPid, state));
                    if (!isBlocked) return false;

                    let usedTrade = myHand.splice(tradeCardIdx, 1)[0];
                    let newGraveSym = [...(state.graveSym || []), usedTrade];

                    let myHackedCount = (state.hackedHands && state.hackedHands[myId]) ? state.hackedHands[myId].length : 0;
                    let nextTotal = myHand.length + myHackedCount;
                    let soundList = ['TRADE'];
                    if (nextTotal === 1) soundList.push('UNO');
                    else if (nextTotal === 2) soundList.push('DOS');

                    state.hands = state.hands || {};
                    state.hands[myId] = myHand;
                    state.graveSym = newGraveSym;
                    clearPoliticianShieldInState(state, myId, ctx, "TRADE空振り使用");
                    state.lastSound = { type: soundList, id: ctx.now };
                    state.passCount = 0;
                    state.turnIdx = ctx.getNextTurnIdx(state.rankings || {});

                    const blockedName = (state.players && state.players[blockedPid]) ? state.players[blockedPid].name : "相手";
                    ctx.appendLog(`${myName}が [TRADE] を使用しましたが、${blockedName} は[政治家]保護中のため空振りになりました。`, 'public');
                    return true;
                });

                if (!txResult.committed) {
                    showTurnActionError(txResult.reason);
                    return;
                }
                selectedIdx = -1;
            });
        }

        // 実行処理 (引数 takeIdx を追加)
        // ↓↓↓ execTrade関数を丸ごとこれに置き換えてください ↓↓↓
        async function execTrade(targetId, tradeCardIdx, giveCardIdx, takeIdx) {
            return runGuardedAction("execTrade", async () => {
                if (!isMyTurn()) return showInfoModal("エラー", "あなたの番ではありません。");
                closeModal();

                const txResult = await runTurnTransaction("execTrade", (state, ctx) => {
                    if (!targetId || targetId === myId) return false;
                    if (isPoliticianShieldActive(targetId, state)) return false;

                    let myHand = sortCards(deepCopy((state.hands && state.hands[myId]) || []));
                    let targetHand = sortCards(deepCopy((state.hands && state.hands[targetId]) || []));
                    if (!Number.isInteger(tradeCardIdx) || tradeCardIdx < 0 || tradeCardIdx >= myHand.length) return false;
                    if (!Number.isInteger(giveCardIdx) || giveCardIdx < 0 || giveCardIdx >= myHand.length) return false;
                    if (!Number.isInteger(takeIdx) || takeIdx < 0 || takeIdx >= targetHand.length) return false;

                    let usedTrade = myHand.splice(tradeCardIdx, 1)[0];
                    if (!usedTrade || usedTrade.val !== "TRADE") return false;
                    let newGraveSym = [...(state.graveSym || []), usedTrade];

                    let actualGiveIdx = (giveCardIdx > tradeCardIdx) ? giveCardIdx - 1 : giveCardIdx;
                    if (actualGiveIdx < 0 || actualGiveIdx >= myHand.length) return false;

                    let giveCard = myHand.splice(actualGiveIdx, 1)[0];
                    let receiveCard = targetHand.splice(takeIdx, 1)[0];
                    if (!giveCard || !receiveCard) return false;

                    myHand.push(receiveCard);
                    targetHand.push(giveCard);
                    myHand = sortCards(myHand);
                    targetHand = sortCards(targetHand);

                    state.hands = state.hands || {};
                    state.hands[myId] = myHand;
                    state.hands[targetId] = targetHand;
                    state.graveSym = newGraveSym;
                    clearPoliticianShieldInState(state, myId, ctx, "TRADE使用");

                    let targetName = (state.players && state.players[targetId]) ? state.players[targetId].name : "Player";
                    let myDisplayName = (state.players && state.players[myId]) ? state.players[myId].name : myName;
                    ctx.appendLog(`${myName}が [TRADE] を使用して${targetName} とカードを交換しました`, 'public');
                    ctx.appendLog(`${targetName}から [${receiveCard.val}] を奪い、[${giveCard.val}] を渡しました。`, 'private', myId);
                    ctx.appendLog(`${myDisplayName}に [${receiveCard.val}] を奪われ、 [${giveCard.val}] を渡されました。`, 'private', targetId);

                    state.passCount = 0;
                    state.turnIdx = ctx.getNextTurnIdx(state.rankings || {});
                    state.players = state.players || {};
                    if (!state.players[targetId]) state.players[targetId] = { name: targetName };
                    state.players[targetId].notification = {
                        fromName: myName + "(TRADE)",
                        lostVal: receiveCard.val,
                        gotVal: giveCard.val
                    };

                    let myHackedCount = (state.hackedHands && state.hackedHands[myId]) ? state.hackedHands[myId].length : 0;
                    let nextTotal = myHand.length + myHackedCount;
                    let soundList = ['TRADE'];
                    if (nextTotal === 1) soundList.push('UNO');
                    else if (nextTotal === 2) soundList.push('DOS');
                    state.lastSound = { type: soundList, id: ctx.now };
                    return true;
                });

                if (!txResult.committed) {
                    showTurnActionError(txResult.reason);
                    return;
                }
                selectedIdx = -1;
            });
        }

        // ↓↓↓ execDiscard関数を丸ごとこれに置き換えてください ↓↓↓

        async function execDiscard(useCardIdx, targetIdx) {
            return runGuardedAction("execDiscard", async () => {
                if (!isMyTurn()) return showInfoModal("エラー", "あなたの番ではありません。");
                closeModal();

                const txResult = await runTurnTransaction("execDiscard", (state, ctx) => {
                    let currentHand = sortCards(deepCopy((state.hands && state.hands[myId]) || []));
                    if (!Number.isInteger(useCardIdx) || useCardIdx < 0 || useCardIdx >= currentHand.length) return false;

                    let usedCard = currentHand.splice(useCardIdx, 1)[0];
                    if (!usedCard || usedCard.val !== "DISCARD") return false;
                    let newGraveSym = [...(state.graveSym || []), usedCard];

                    if (!Number.isInteger(targetIdx) || targetIdx < 0 || targetIdx >= currentHand.length) return false;
                    let discardCard = currentHand.splice(targetIdx, 1)[0];
                    if (!discardCard) return false;

                    let newGraveNum = [...(state.graveNum || [])];
                    if (discardCard.type === 'num') newGraveNum.push({ ...discardCard, owner: myId });
                    else newGraveSym.push(discardCard);
                    currentHand = sortCards(currentHand);

                    let myHackedCount = (state.hackedHands && state.hackedHands[myId]) ? state.hackedHands[myId].length : 0;
                    let nextTotal = currentHand.length + myHackedCount;

                    let soundList = ['DISCARD'];
                    if (nextTotal === 1) soundList.push('UNO');
                    else if (nextTotal === 2) soundList.push('DOS');

                    state.lastSound = { type: soundList, id: ctx.now };
                    state.graveNum = newGraveNum;
                    state.graveSym = newGraveSym;
                    state.hands = state.hands || {};
                    state.hands[myId] = currentHand;
                    clearPoliticianShieldInState(state, myId, ctx, "DISCARD使用");

                    ctx.appendLog(`${myName}が [DISCARD] で [${discardCard.val}] を捨てました！！`, 'public');
                    state.passCount = 0;

                    let tempRankings = {...(state.rankings || {})};
                    if (currentHand.length === 0 && myHackedCount === 0) {
                        let currentRank = Object.keys(state.rankings || {}).length + 1;
                        state.rankings = { ...(state.rankings || {}), [myId]: currentRank };
                        ctx.appendLog(`${myName}が ${currentRank}位 であがりました！`, 'public');
                        state.lastWinnerId = myId;
                        state.lastWinnerTime = ctx.now;

                        let totalPlayers = state.playerOrder.length;
                        appendRankSound(soundList, currentRank, totalPlayers);
                        if (currentRank >= totalPlayers - 1) {
                            state.status = "finished";
                            let loserId = state.playerOrder.find(pid => !(state.rankings && state.rankings[pid]) && pid !== myId);
                            if (loserId) {
                                state.rankings = { ...(state.rankings || {}), [loserId]: totalPlayers };
                                appendRankSound(soundList, totalPlayers, totalPlayers);

                                let lHand = (state.hands && state.hands[loserId]) ? state.hands[loserId] : [];
                                let lHacked = (state.hackedHands && state.hackedHands[loserId]) ? state.hackedHands[loserId] : [];
                                let allL = [...lHand, ...lHacked];
                                let lText = allL.map(c => c.val).join(", ") || "なし";
                                let lName = (state.players && state.players[loserId]) ? state.players[loserId].name : "Player";
                                ctx.appendLog(`全順位確定！　最下位 ${lName} の残り手札: [${lText}]`, 'public');
                            } else {
                                ctx.appendLog(`全順位が確定しました！`, 'public');
                            }
                        }
                        tempRankings[myId] = 99;
                    }

                    state.turnIdx = ctx.getNextTurnIdx(tempRankings);
                    return true;
                });

                if (!txResult.committed) {
                    showTurnActionError(txResult.reason);
                    return;
                }

                selectedIdx = -1;
                if (
                    txResult.snapshot &&
                    txResult.snapshot.status === "finished" &&
                    txResult.snapshot.rankings &&
                    txResult.snapshot.playerOrder
                ) {
                    updateFinalScores(txResult.snapshot.rankings, txResult.snapshot.playerOrder);
                }
            });
        }

        function isMyTurn() {
            if (!gameState || !gameState.playerOrder) return false;
            return gameState.playerOrder[gameState.turnIdx] === myId;
        }
        function getTop(arr) { return (arr && arr.length > 0) ? arr[arr.length-1] : null; }
        function getRankSoundType(rank, totalPlayers) {
            if (!Number.isFinite(rank) || !Number.isFinite(totalPlayers) || totalPlayers <= 0) return null;
            if (rank === 1) return "RANK_1";
            if (rank === totalPlayers) return "RANK_4";
            return "RANK_2_3";
        }
        function appendRankSound(soundList, rank, totalPlayers) {
            if (!Array.isArray(soundList)) return;
            const rankSound = getRankSoundType(rank, totalPlayers);
            if (!rankSound) return;
            if (!soundList.includes(rankSound)) soundList.push(rankSound);
        }
        function getAstronomerObservation(data = gameState) {
            if (!data || !data.astronomerObservation) return null;
            const rawVal = Number(data.astronomerObservation.value);
            const activatedIsReverse = !!data.astronomerObservation.activatedIsReverse;
            const isSelectable =
                ASTRONOMER_CHOICES.includes(rawVal) ||
                (!activatedIsReverse && rawVal === 1) ||
                (activatedIsReverse && rawVal === 9);
            if (!isSelectable) return null;
            return {
                value: rawVal,
                activatedIsReverse,
                activatedBy: data.astronomerObservation.activatedBy || null
            };
        }
        function getAstronomerState(data = gameState) {
            const obs = getAstronomerObservation(data);
            if (!obs) return null;
            const isNowReverse = !!(data && data.isReverse);
            const isStrongest = (isNowReverse === obs.activatedIsReverse);
            return {
                ...obs,
                isStrongest
            };
        }
        function getAstronomerRoleSubText(data = gameState) {
            const state = getAstronomerState(data);
            if (!state) return "";
            return state.isStrongest
                ? `観測 ${state.value}`
                : `観測 ${state.value}`;
        }
        function getNumberStrengthOrder(isRev, data = gameState) {
            const baseOrder = isRev
                ? [1, 2, 3, 4, 5, 6, 7, 8, 9]
                : [9, 8, 7, 6, 5, 4, 3, 2, 1];
            const astro = getAstronomerState(data);
            if (!astro) return baseOrder;

            const rest = baseOrder.filter(v => v !== astro.value);
            return astro.isStrongest
                ? [astro.value, ...rest]
                : [...rest, astro.value];
        }
        function compareNumberStrength(a, b, isRev, data = gameState) {
            const valA = Number(a);
            const valB = Number(b);
            if (valA === valB) return 0;

            const order = getNumberStrengthOrder(!!isRev, data);
            const idxA = order.indexOf(valA);
            const idxB = order.indexOf(valB);
            if (idxA === -1 || idxB === -1) return 0;
            return idxA < idxB ? 1 : -1;
        }
        function canPlay(card, topCard, isRev, data = gameState) {
            if (!topCard) return true;
            if (Number(card.val) === 0 || Number(topCard.val) === 0) return true;
            return compareNumberStrength(card.val, topCard.val, isRev, data) > 0;
        }
        function updateAstronomerIndicator(data = gameState) {
            const panel = document.getElementById("astronomer-indicator");
            const valEl = document.getElementById("astronomer-indicator-value");
            const stateEl = document.getElementById("astronomer-indicator-state");
            if (!panel || !valEl || !stateEl) return;

            const state = getAstronomerState(data);
            if (!state) {
                panel.style.display = "none";
                return;
            }

            panel.style.display = "flex";
            panel.classList.remove("state-strongest", "state-weakest");
            panel.classList.add(state.isStrongest ? "state-strongest" : "state-weakest");
            valEl.innerText = state.value;
            stateEl.innerText = state.isStrongest ? "最強" : "最弱";
        }
        function shuffle(arr) { for(let i=arr.length-1; i>0; i--){ let j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } }
        function renderPile(arr) {
            if (!arr || arr.length === 0) return "";
            let c = arr[arr.length-1];
            return renderCardView(c);
        }

        function getActiveCount(data) {
            if(!data || !data.playerOrder) return 0;
            let finishedCount = Object.keys(data.rankings || {}).length;
            return Math.max(1, data.playerOrder.length - finishedCount);
        }

        function getNextActivePlayerIndex(currentIdx, playerOrder, rankings) {
            let next = (currentIdx + 1) % playerOrder.length;
            let loop = 0;
            while (rankings && rankings[playerOrder[next]] && loop < playerOrder.length) {
                next = (next + 1) % playerOrder.length;
                loop++;
            }
            return next;
        }
	// 追加: リセット処理の実体
        async function execPassReset() {
            // 既存の「ドローなしでリセット」する処理へ委譲します
            return execPassNoDraw(true);
        }
