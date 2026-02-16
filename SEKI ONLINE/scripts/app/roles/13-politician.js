/* --- POLITICIAN (政治家) --- */
async function activatePolitician() {
    if (!isMyTurn()) return;

    let actList = {...(gameState.activatedList || {})};
    if (actList[myId]) return showInfoModal("使用不可", "政治家はすでに発動済みです。");

    let shieldMap = {...(gameState.politicianShield || {})};
    shieldMap[myId] = true;

    let updates = {};
    actList[myId] = true;
    updates[`rooms/${currentRoom}/activatedList`] = actList;
    updates[`rooms/${currentRoom}/politicianShield`] = shieldMap;

    await pushLog(`${myName}が[政治家]を発動し、手札干渉の対象外になりました。`, 'public');
    await db.ref().update(updates);
}

function activateThief(count = 1) {
    let html = `<p><strong>【盗賊スキル ${count}/2回目】</strong><br>トレードする相手を選んでください。</p>`;
    let canUseTarget = false;
    let hasBlockedTarget = false;
    
    const pIds = gameState.playerOrder;
    pIds.forEach(pid => {
        if (pid === myId) return; 
        if (gameState.rankings && gameState.rankings[pid]) return; 

        const pName = gameState.players[pid].name;
        // 公開情報の表示（警察官などでバレている場合）
        const hand = gameState.hands[pid] || [];
        const handLen = hand.length;
        if (handLen === 0) return;
        let revealed = hand.filter(c => c.isOpen).map(c => c.val).join(", ");
        let revealedInfo = revealed ? `<br><span style="font-size:12px; color:#d9ebff;">(公開: ${revealed})</span>` : "";

        if (isPoliticianShieldActive(pid)) {
            hasBlockedTarget = true;
            html += `<button class="modal-btn is-disabled" disabled style="display:block; width:100%; margin:5px 0;">
                ${pName} (政治家で対象外)
            </button>`;
        } else {
            canUseTarget = true;
            html += `<button class="modal-btn" onclick="thiefSelectTake('${pid}', ${count})" style="display:block; width:100%; margin:5px 0;">
                ${pName} (手札${handLen}枚)${revealedInfo}
            </button>`;
        }
    });

    if (hasBlockedTarget) {
        html += `<p class="seki-disabled-note">※政治家の保護中プレイヤーは対象外です</p>`;
    }

    if (!canUseTarget) {
        html += `<p style="font-size:12px; color:#9cb3c9;">対象にできるプレイヤーがいません。</p>`;
    }

    openModal(`盗賊: ターゲット選択 (${count}回目)`, html);
    if (canUseTarget && document.getElementById("modal-footer")) {
        document.getElementById("modal-footer").innerHTML = "";
    }
}

// 2. ★追加: 奪うカードを選ぶ（裏向きシャッフル）
