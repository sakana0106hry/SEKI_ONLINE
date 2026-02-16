/* --- AGENT (工作員) の実装 --- */

// 1. 1人目選択
function activateAgent() {
    const pIds = gameState.playerOrder || [];
    const candidates = pIds.filter(pid => (gameState.hands[pid] || []).length > 0 && !isPoliticianShieldActive(pid));
    const blockedCandidates = pIds.filter(pid => (gameState.hands[pid] || []).length > 0 && isPoliticianShieldActive(pid));

    if (candidates.length < 2) {
        return showInfoModal("発動不可", "政治家の保護を除くと、交換対象が2人未満です。");
    }

    let html = `<p>ランダム交換する<strong>1人目（対象A）</strong>を選んでください。<br>
        <span class="modal-note">※このあと2人目（対象B）を選びます。</span>
    </p>`;

    candidates.forEach(pid => {
        const p = gameState.players[pid];
        const handCount = (gameState.hands[pid] || []).length;
        const selfLabel = (pid === myId) ? " (あなた)" : "";
        html += `<button class="modal-btn" onclick="agentSelectSecondTarget('${pid}')">${p.name}${selfLabel} (手札${handCount})</button>`;
    });
    if (blockedCandidates.length > 0) {
        html += `<p class="seki-disabled-note">※政治家の保護中プレイヤーは対象外です</p>`;
        blockedCandidates.forEach(pid => {
            const p = gameState.players[pid];
            html += `<button class="modal-btn is-disabled" disabled>${p.name} (政治家で対象外)</button>`;
        });
    }

    openModal("工作員: 対象A選択", html);
    if (document.getElementById("modal-footer")) {
        document.getElementById("modal-footer").innerHTML = "";
    }
}

// 2. 2人目選択
function agentSelectSecondTarget(firstId) {
    const pIds = gameState.playerOrder || [];
    const candidates = pIds.filter(pid =>
        pid !== firstId &&
        !isPoliticianShieldActive(pid) &&
        (gameState.hands[pid] || []).length > 0
    );
    const blockedCandidates = pIds.filter(pid =>
        pid !== firstId &&
        isPoliticianShieldActive(pid) &&
        (gameState.hands[pid] || []).length > 0
    );

    if (candidates.length === 0) {
        return showInfoModal("発動不可", "2人目の候補がいません。");
    }

    const firstName = gameState.players[firstId] ? gameState.players[firstId].name : "不明";
    let html = `<p><strong>2人目</strong>を選んでください。<br>
        <span class="modal-note">選択済み: ${firstName}</span>
    </p>`;

    candidates.forEach(pid => {
        const p = gameState.players[pid];
        const handCount = (gameState.hands[pid] || []).length;
        const selfLabel = (pid === myId) ? " (あなた)" : "";
        html += `<button class="modal-btn" onclick="execAgentSwap('${firstId}', '${pid}')">${p.name}${selfLabel} (手札${handCount})</button>`;
    });
    if (blockedCandidates.length > 0) {
        html += `<p class="seki-disabled-note">※政治家の保護中プレイヤーは対象外です</p>`;
        blockedCandidates.forEach(pid => {
            const p = gameState.players[pid];
            html += `<button class="modal-btn is-disabled" disabled>${p.name} (政治家で対象外)</button>`;
        });
    }

    openModal("工作員: 対象B選択", html);
    if (document.getElementById("modal-footer")) {
        document.getElementById("modal-footer").innerHTML = "";
    }
}

// 3. 実行処理（ランダム1枚交換）
async function execAgentSwap(pidA, pidB) {
    closeModal();
    if (!canTargetByHandInterference(pidA) || !canTargetByHandInterference(pidB)) return;

    let handA = deepCopy(gameState.hands[pidA] || []);
    let handB = deepCopy(gameState.hands[pidB] || []);

    if (handA.length === 0 || handB.length === 0) {
        return showInfoModal("エラー", "対象プレイヤーの手札が不足しています。");
    }

    const idxA = Math.floor(Math.random() * handA.length);
    const idxB = Math.floor(Math.random() * handB.length);

    const cardA = handA.splice(idxA, 1)[0];
    const cardB = handB.splice(idxB, 1)[0];
    handA.push(cardB);
    handB.push(cardA);

    const updates = {};
    updates[`rooms/${currentRoom}/hands/${pidA}`] = sortCards(handA);
    updates[`rooms/${currentRoom}/hands/${pidB}`] = sortCards(handB);

    let actList = {...(gameState.activatedList || {})};
    actList[myId] = true;
    updates[`rooms/${currentRoom}/activatedList`] = actList;

    const nameA = gameState.players[pidA] ? gameState.players[pidA].name : "不明";
    const nameB = gameState.players[pidB] ? gameState.players[pidB].name : "不明";

    await pushLog(`${myName}が[工作員]を発動！${nameA}と${nameB}の手札をランダムに1枚交換しました。`, 'public');
    await pushLog(`【工作員の策略】${nameA}:[${cardA.val}] ↔ ${nameB}:[${cardB.val}]`, 'private', pidA);
    await pushLog(`【工作員の策略】${nameA}:[${cardA.val}] ↔ ${nameB}:[${cardB.val}]`, 'private', pidB);

    if (pidA !== myId) {
        updates[`rooms/${currentRoom}/players/${pidA}/notification`] = {
            fromName: `${myName}(工作員)`,
            lostVal: cardA.val,
            gotVal: cardB.val
        };
    }
    if (pidB !== myId) {
        updates[`rooms/${currentRoom}/players/${pidB}/notification`] = {
            fromName: `${myName}(工作員)`,
            lostVal: cardB.val,
            gotVal: cardA.val
        };
    }

    // ターンは進めない（このあと自分のターンを継続）
    await db.ref().update(updates);
}

