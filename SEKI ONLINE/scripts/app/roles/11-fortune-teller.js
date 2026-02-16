/* --- FORTUNE TELLER (占い師) の実装 --- */
// 修正版: ログに詳細を残す機能を追加

async function activateFortuneTeller() {
    // 1. 他のプレイヤーの情報を収集
    let html = `<div style="text-align:left;">`;
    let logText = ``; // ★ログ保存用のテキスト
    
    const pIds = gameState.playerOrder;
    
    pIds.forEach(pid => {
        if (pid === myId) return; // 自分はスキップ

        const pName = gameState.players[pid].name;
        if (isPoliticianShieldActive(pid)) {
            html += `
                <div style="margin-bottom:10px; border-bottom:1px solid #eee; padding-bottom:5px;">
                    <div style="font-weight:bold; color:#fdd835;">${pName}</div>
                    <div style="font-size:12px; color:#d32f2f;">[政治家]発動中のため確認できません</div>
                </div>
            `;
            logText += `[${pName}] [政治家]発動中のため確認不可<br>`;
            return;
        }

        const pRole = gameState.roles[pid];
        const pRoleJP = (ROLE_INFO[pRole]) ? ROLE_INFO[pRole].jp : pRole;
        const pHand = gameState.hands[pid] || [];

        // 手札の内容（表示用HTML）
        let handHtml = pHand.map(c => {
             // 画像があるかチェック
             let imgUrl = CARD_IMAGES[c.val];
             
             // 共通のスタイル（小さめのカードにする）
             let baseStyle = "display:inline-block; width:30px; height:45px; border-radius:4px; margin:2px; vertical-align:middle; line-height:45px; text-align:center; font-weight:bold; border:1px solid #78909c; background:#455a64; color:#cfd8dc; position:relative;";
             
             // 画像がある場合（記号など）：背景画像にして文字を消す
             if (imgUrl) {
                 return `<span class="card ${c.type}" style="${baseStyle} background-image:url('${imgUrl}'); background-size:cover; color:transparent; border:none;">${c.val}</span>`;
             }
             
             // 画像がない場合（数字など）：数字を表示
             // 数字の「0」だけは紫色にする
             
             // 普通の数字
             return `<span class="card ${c.type}" style="${baseStyle}">${c.val}</span>`;
        }).join("");

        // 手札の内容（ログ保存用の簡易テキスト）
        let handText = pHand.map(c => c.val).join(", ");

        // モーダル用HTML作成
        html += `
            <div style="margin-bottom:10px; border-bottom:1px solid #eee; padding-bottom:5px;">
                <div style="font-weight:bold; color:#fdd835;">${pName}</div>
                <div style="font-size:12px;">役職: <span style="color:#d9ebff;">${pRoleJP}</span></div>
                <div style="font-size:12px;">手札: ${handHtml}</div>
            </div>
        `;

        // ★ログ用テキスト作成（改行を入れて見やすく）
        logText += `[${pName}] 役職:${pRoleJP} / 手札:${handText}<br>`;
    });

    html += `</div><p style="font-size:12px; color:#aaa;">※この内容はログ(チャット履歴)にも保存されました。</p>`;

    // 2. サーバー更新
    let updates = {};
    let actList = {...(gameState.activatedList || {})};
    actList[myId] = true; // 使用済みにする
    updates[`rooms/${currentRoom}/activatedList`] = actList;
    
    // 全員への通知（中身は言わない）
    await pushLog(`${myName}が[占い師]を発動！水晶玉を覗き込みました...`, 'public');
    
    // ★自分だけのメモとして詳細を保存（ここがポイント！）
    // type='private', targetId=myId にすることで自分にしか見えません
    await pushLog(`【占い結果メモ】<br>${logText}`, 'private', myId);
    
    //playSoundEffect('SKILL'); 
    
    // データベース更新
    await db.ref().update(updates);

    // 3. モーダルで情報を表示
    openModal("占い師: 千里眼", html);
}

