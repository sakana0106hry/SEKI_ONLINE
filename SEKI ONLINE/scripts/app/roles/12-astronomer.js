/* --- ASTRONOMER (天文学者) の実装 --- */
function isAstronomerSelectableValue(val, isRev) {
    const numVal = Number(val);
    return ASTRONOMER_CHOICES.includes(numVal) || (!isRev && numVal === 1) || (isRev && numVal === 9);
}

function getAstronomerSelectableRangeText(isRev) {
    return isRev ? "2〜9" : "1〜8";
}

function activateAstronomer() {
    if (!isMyTurn()) return showInfoModal("エラー", "あなたの番ではありません");
    if (!gameState || !gameState.roles) return showInfoModal("エラー", "ゲーム状態を取得できません。");

    let actList = {...(gameState.activatedList || {})};
    if (actList[myId]) return showInfoModal("使用不可", "天文学者はすでに発動済みです。");

    const isRev = !!gameState.isReverse;
    const strongerThan = isRev ? 1 : 9;
    const selectableRangeText = getAstronomerSelectableRangeText(isRev);

    let html = `
        <p>観測する数字を選んでください。<br>
        <span style="font-size:12px; color:#ff0000;">
            現在は${isRev ? "逆行" : "順行"}なので、[${strongerThan}]より強い数字を指定します。
        </span>
        </p>
        <div class="modal-list">`;

    for (let n = 1; n <= 9; n++) {
        const isSelectable = isAstronomerSelectableValue(n, isRev);
        let style = "";
        if (!isSelectable) {
            style = "opacity:0.35; cursor:not-allowed; border:1px dashed #888; transform:scale(0.95);";
        }
        const onClick = isSelectable
            ? `onclick="execAstronomerObserve(${n})"`
            : `onclick="showAstronomerInvalidSelection(${n}, ${isRev ? "true" : "false"})"`;
        html += `<div class="card num" style="${style}" ${onClick}>${n}</div>`;
    }

    html += `</div>
        <p style="font-size:12px; color:#ff0000; margin-top:8px;">
            ※ 現在は ${selectableRangeText} のみ選択可能です。
        </p>`;

    openModal("天文学者: 観測", html);
}

function showAstronomerInvalidSelection(val, isRev = !!(gameState && gameState.isReverse)) {
    const selectableRangeText = getAstronomerSelectableRangeText(!!isRev);
    showInfoModal("対象外", `[${val}] は観測対象外です。${selectableRangeText}から選んでください。`);
}

async function execAstronomerObserve(observedVal) {
    if (!isMyTurn()) return showInfoModal("エラー", "あなたの番ではありません");
    if (!gameState || !gameState.roles) return showInfoModal("エラー", "ゲーム状態を取得できません。");

    const val = Number(observedVal);
    const isRev = !!gameState.isReverse;
    if (!isAstronomerSelectableValue(val, isRev)) {
        return showInfoModal("対象外", `${getAstronomerSelectableRangeText(isRev)}から選んでください。`);
    }

    let actList = {...(gameState.activatedList || {})};
    if (actList[myId]) return showInfoModal("使用不可", "天文学者はすでに発動済みです。");

    closeModal();

    let updates = {};
    actList[myId] = true;
    updates[`rooms/${currentRoom}/activatedList`] = actList;
    updates[`rooms/${currentRoom}/astronomerObservation`] = {
        value: val,
        activatedIsReverse: !!gameState.isReverse,
        activatedBy: myId,
        timestamp: Date.now()
    };
    updates[`rooms/${currentRoom}/passCount`] = 0;
    let nextIdx = getNextActivePlayerIndex(gameState.turnIdx, gameState.playerOrder, gameState.rankings);
    updates[`rooms/${currentRoom}/turnIdx`] = nextIdx;

    const strongerThan = gameState.isReverse ? 1 : 9;
    await pushLog(`${myName}が[天文学者]を発動し、[${val}] を観測して [${strongerThan}] より強くしました。`, 'public');
    await db.ref().update(updates);
}
