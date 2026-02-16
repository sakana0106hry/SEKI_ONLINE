    function getEffectiveHostId(data) {
        if (!data) return null;
        let pIds = data.playerOrder || getSortedPlayerIds(data.players || {});
        let hostId = (pIds.length > 0) ? pIds[0] : null;

        // ゲーム終了時は最下位（敗者）にホスト権限を移す
        if (data.status === "finished" && data.rankings) {
            let loserId = Object.keys(data.rankings).reduce((a, b) => 
                data.rankings[a] > data.rankings[b] ? a : b
            , null);
            if (loserId && data.players[loserId]) {
                hostId = loserId;
            }
        }
        return hostId;
    }
        

    
        // Global exports
        window.joinGame = joinGame;
        window.playCard = playCard;
        window.passTurn = passTurn;
        window.initGame = confirmInitGame; 
        window.viewGrave = viewGrave;
        window.closeModal = closeModal;
        window.execDigUp = execDigUp;
        window.tradeStep2 = tradeStep2;
        window.tradeStep3 = tradeStep3; // ★追加: 奪うカード選択
        window.execTrade = execTrade;
        window.execDiscard = execDiscard;
        window.execPassDraw = execPassDraw;
        window.execPassNoDraw = execPassNoDraw;
        window.execPassPlay = execPassPlay;
        window.execPassKeep = execPassKeep;
        window.execPassReset = execPassReset;
        window.closeRoom = confirmCloseRoom;
        window.execInitGame = execInitGame;
        window.execCloseRoom = execCloseRoom;
        window.showLogHistory = showLogHistory;
        window.sendChat = sendChat;
        window.sendDesktopChat = sendDesktopChat;
        window.playCutInAnimation = playCutInAnimation;
        window.openHostSettings = openHostSettings;
        window.confirmInitGameWithSettings = confirmInitGameWithSettings;
        window.selectRoleDraftCandidate = selectRoleDraftCandidate;
        window.confirmRoleDraftSelection = confirmRoleDraftSelection;
        window.openRoleDraftDetail = openRoleDraftDetail;
        window.showRoleDraftUnusedDetail = showRoleDraftUnusedDetail;
        window.showRoleList = showRoleList;
        window.showRule = showRule;
        window.leaveRoom = leaveRoom; // これを追加
        // windowオブジェクトに登録してHTMLから呼べるようにする
        window.showPlayerLogs = showPlayerLogs;
        // 釣り師
        window.activateAngler = activateAngler;
        window.anglerStep2 = anglerStep2;
        window.execAngler = execAngler;
        // 占い師
        window.activateFortuneTeller = activateFortuneTeller;
        // 天文学者
        window.activateAstronomer = activateAstronomer;
        window.execAstronomerObserve = execAstronomerObserve;
        window.showAstronomerInvalidSelection = showAstronomerInvalidSelection;
        // 盗賊
        window.activateThief = activateThief;
        window.thiefSelectTake = thiefSelectTake; // ★追加
        window.thiefSelectGive = thiefSelectGive; // ★追加(名前変更)
        window.execThiefTrade = execThiefTrade;
        window.endThiefTurn = endThiefTurn;
        // 狩人
        window.activateHunter = activateHunter;
        window.toggleHunterSelect = toggleHunterSelect; // 新しい関数
        window.checkHunterCount = checkHunterCount;     // 新しい関数
        window.execHunterSwap = execHunterSwap;
        // 賭博師
        window.activateGambler = activateGambler;
        window.execGamblerGuess = execGamblerGuess;
        window.gamblerSelectDiscard = gamblerSelectDiscard;
        window.toggleGamblerSelect = toggleGamblerSelect;
        window.execGamblerDiscard = execGamblerDiscard;
        // 手品師
        window.activateMagician = activateMagician;
        window.execMagicianReverse = execMagicianReverse;
        window.activateMagicianTrade = activateMagicianTrade;
        window.magicianSelectTake = magicianSelectTake; // ★新設
        window.magicianSelectGive = magicianSelectGive; // ★名前変更
        window.activateMagicianDigUp = activateMagicianDigUp;
        window.execMagicianDigUp = execMagicianDigUp;
        // 億万長者
        window.activateMillionaire = activateMillionaire;
        window.selectMillionaireTarget = selectMillionaireTarget;
        window.execMillionaire = execMillionaire;
        // 政治家
        window.activatePolitician = activatePolitician;
        // 皇帝
        window.activateEmperor = activateEmperor;
        window.execEmperorSelect = execEmperorSelect;
        // 警察官
        window.activatePoliceOfficer = activatePoliceOfficer;
        window.policeTradeStart = policeTradeStart;
        window.endPoliceTurn = endPoliceTurn;
        window.policeSelectTake = policeSelectTake; // ★追加: 奪うカード選択
        window.policeSelectGive = policeSelectGive;
        window.execPoliceTrade = execPoliceTrade;
        // ハッカー
        window.activateHacker = activateHacker;
        window.selectHackerTarget = selectHackerTarget;
        window.execHacker = execHacker;
        window.checkHackerCleanup = checkHackerCleanup;
        // 錬金術師
        window.activateAlchemist = activateAlchemist;
        window.selectAlchemistHand = selectAlchemistHand;
        window.execAlchemist = execAlchemist;
        window.execAlchemistKeep = execAlchemistKeep; // ★名前変更 (Keep)
        // ネクロマンサー
        window.activateNecromancer = activateNecromancer; // ★追加
        window.selectNecromancerTarget = selectNecromancerTarget; // ★追加
        window.execNecromancer = execNecromancer;         // ★追加
        // 工作員
        window.activateAgent = activateAgent;
        window.agentSelectSecondTarget = agentSelectSecondTarget;
        window.execAgentSwap = execAgentSwap;


