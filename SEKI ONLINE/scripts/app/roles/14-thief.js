/* --- 修正版: 盗賊 (ハッカー対応) --- */

// 奪うカード選択
function thiefSelectTake(targetId, count) {
    if (!canTargetByHandInterference(targetId)) return;
    let targetHand = deepCopy(gameState.hands[targetId] || []);
    targetHand.forEach((c, i) => c.originalIndex = i);
    shuffle(targetHand);

    let html = `<p>相手の手札から<strong>奪うカード</strong>を選んでください。<br>
                <span style="font-size:12px;">(公開カードは見えます)</span></p>
                <div class="modal-list">`;

    targetHand.forEach(c => {
        let content = "?";
        let style = "cursor:pointer; background:#455a64; color:#cfd8dc; border:1px solid #78909c;";
        let cssClass = "card"; 
        let onClick = `onclick="thiefSelectGive('${targetId}', ${c.originalIndex}, ${count})"`;

        // ★ハッカー対応
        if (c.isHacked) {
            cssClass += " hacked";
            style = "cursor:not-allowed; border:1px solid #5f6f82; background:#2a3440; color:#cfd8dc;";
            content = "🔒"; 
            onClick = "";
        }
        else if (c.isOpen) {
            cssClass = `card ${c.type}`;
            content = c.val;
            style = "cursor:pointer; "; 
            let cImg = CARD_IMAGES[c.val];
            if (cImg) style += `background-image:url('${cImg}'); color:transparent; border:2px solid #fff;`;
        }

        html += `<div class="${cssClass}" style="${style}" ${onClick}>${content}</div>`;
    });
    
    openModal(`盗賊: 略奪選択 (${count}回目)`, html);
    if (document.getElementById("modal-footer")) {
                    document.getElementById("modal-footer").innerHTML = "";
                }
}

// 渡すカード選択
function thiefSelectGive(targetId, takeIdx, count) {
    if (!canTargetByHandInterference(targetId)) return;
    const myHand = sortCards(deepCopy(gameState.hands[myId] || []));

    let html = `<p>相手に押し付けるカードを選んでください。</p><div class="modal-list">`;
    
    myHand.forEach((c, idx) => {
        let style = "";
        let cImg = CARD_IMAGES[c.val];
        if (cImg) style += `background-image:url('${cImg}'); color:transparent; border:2px solid #fff;`;
        
        let cssClass = `card ${c.type}`;
        let onClick = `onclick="execThiefTrade('${targetId}', ${idx}, ${takeIdx}, ${count})"`;
        let cursorStyle = "cursor:pointer;";

        // ★ハッカー対応
        if (c.isHacked) {
            cssClass += " hacked";
            onClick = "";
            cursorStyle = "cursor:not-allowed;";
        }

        html += `<div class="${cssClass}" style="${style} ${cursorStyle}" ${onClick}>${c.val}</div>`;
    });

    openModal(`盗賊: 譲渡選択 (${count}回目)`, html);

    if (document.getElementById("modal-footer")) {
                    document.getElementById("modal-footer").innerHTML = "";
                }
}

// 4. トレード実行処理 (ランダムではなく指定インデックスで)
async function execThiefTrade(targetId, giveIdx, takeIdx, count) {
    return runGuardedAction("execThiefTrade", async () => {
        closeModal();
        if (!canTargetByHandInterference(targetId)) return;

        const stepCount = (Number(count) === 2) ? 2 : 1;
        let tradeResult = null;

        const txResult = await runTurnTransaction("execThiefTrade", (state, ctx) => {
            if (!targetId || targetId === myId) return false;
            if (isPoliticianShieldActive(targetId, state)) return false;

            let myHand = sortCards(deepCopy((state.hands && state.hands[myId]) || []));
            let targetHand = sortCards(deepCopy((state.hands && state.hands[targetId]) || []));
            if (targetHand.length === 0) return false;

            if (!Number.isInteger(giveIdx) || giveIdx < 0 || giveIdx >= myHand.length) return false;
            if (!Number.isInteger(takeIdx) || takeIdx < 0 || takeIdx >= targetHand.length) return false;

            const giveCard = myHand[giveIdx];
            const receiveCard = targetHand[takeIdx];
            if (!giveCard || !receiveCard) return false;
            if (giveCard.isHacked || receiveCard.isHacked) return false;

            myHand.splice(giveIdx, 1);
            targetHand.splice(takeIdx, 1);
            myHand.push(receiveCard);
            targetHand.push(giveCard);

            state.hands = state.hands || {};
            state.hands[myId] = sortCards(myHand);
            state.hands[targetId] = sortCards(targetHand);

            const targetName = (state.players && state.players[targetId]) ? state.players[targetId].name : "Player";
            ctx.appendLog(`${myName}が[盗賊]で${targetName}とトレードしました！(${stepCount}回目)`, 'public');
            ctx.appendLog(`${targetName}から [${receiveCard.val}] を盗み、 [${giveCard.val}] を奪いました。`, 'private', myId);
            ctx.appendLog(`${myName}に [${receiveCard.val}] を盗まれ、 [${giveCard.val}] を渡されました。`, 'private', targetId);

            state.players = state.players || {};
            if (!state.players[targetId]) state.players[targetId] = { name: targetName };
            state.players[targetId].notification = {
                fromName: myName + "(盗賊)",
                lostVal: receiveCard.val,
                gotVal: giveCard.val
            };

            if (stepCount === 2) {
                const skillSound = (typeof SOUND_FILES !== 'undefined' && SOUND_FILES['SKILL_THIEF']) ? 'SKILL_THIEF' : 'SKILL';
                state.lastSound = { type: skillSound, id: ctx.now };
            }

            if (stepCount === 1) {
                let actList = {...(state.activatedList || {})};
                actList[myId] = true;
                state.activatedList = actList;
            }

            tradeResult = {
                receiveVal: receiveCard.val
            };
            return true;
        });

        if (!txResult.committed) {
            if (!canTargetByHandInterference(targetId)) {
                showInfoModal("使用不可", "政治家の保護により対象外です。");
                return;
            }
            showTurnActionError(txResult.reason);
            return;
        }

        if (stepCount === 1) {
            const receiveVal = (tradeResult && tradeResult.receiveVal) ? tradeResult.receiveVal : "?";
            let confirmHtml = `
            <p>1回目のトレードが完了しました。<br>
            <strong>奪ったカード: ${receiveVal}</strong><br>
            続けて2回目のトレードを行いますか？
            </p>
            <button class="modal-btn danger" onclick="activateThief(2)" style="width:100%; margin-bottom:10px;">
                はい (もう一度盗む)
            </button>
            <button class="modal-btn ghost" onclick="endThiefTurn()" style="width:100%;">
                いいえ (ターンを終了する)
            </button>
        `;
            openModal("盗賊: 追撃の選択", confirmHtml);
            if (document.getElementById("modal-footer")) {
                document.getElementById("modal-footer").innerHTML = "";
            }
        } else {
            endThiefTurn();
        }
    });
}
// 4. ターン終了処理
async function endThiefTurn() {
    closeModal();
    
    // ★修正: gameState.turnIdx を使うように変更（念のため）
    let currentTurnIdx = (typeof turnIdx !== 'undefined') ? turnIdx : gameState.turnIdx;
    let nextIdx = (currentTurnIdx + 1) % gameState.playerOrder.length;
    
    let updates = {};
    updates[`rooms/${currentRoom}/turnIdx`] = nextIdx;
    updates[`rooms/${currentRoom}/passCount`] = 0; 
    updates[`rooms/${currentRoom}/lastAction`] = "THIEF_END";

    let actList = {...(gameState.activatedList || {})};
    actList[myId] = true; 
    updates[`rooms/${currentRoom}/activatedList`] = actList;

    await db.ref().update(updates);
    await pushLog(`${myName}の[盗賊]が終了しました。`, 'public');
}

