        let myId = localStorage.getItem("seki_uid_v2");
        if (!myId) {
            myId = Date.now().toString() + "_" + Math.random().toString(36).substr(2, 5);
            localStorage.setItem("seki_uid_v2", myId);
        }
        
        let prevHandCounts = {}; // 手札枚数の記録用（SE再生に使用）
        const audioCache = {};
        // ★追加: ホスト設定の前回値を覚えておく変数
        let lastHostGameMode = "normal";
        let lastHostRoleGroups = [...ROLE_DRAFT_GROUP_ORDER];
        // ★追加: デュエルOPTIMIZEフェーズのローカル選択状態
        let duelOptimizeSelectedSymbols = [];
        let duelOptimizeExcludeIndices = [];
        let duelOptimizeConfirmBusy = false;

        let currentRoom = null;
        let myName = "";
        let selectedIdx = -1;
        let gameState = null;
        let drawnCardTemp = null;
        let wasMyTurn = false;
        let hasFinished = false;
        let joined = false;
        let lastReadLogTime = 0; // チャット既読用
        let prevActivatedList = {}; // 前回の発動状況を記録する
        let prevRevealedRoles = {}; // カミングアウト状況を記録する
    
        let prevSoundId = 0;
        let lastGraveNumCount = -1; // 前回の数字墓地の枚数
        let lastGraveSymCount = -1; // 前回の記号墓地の枚数
        let millionaireSelectedHandIdxs = [];
        let millionaireMaxSelectable = 1;
        let necromancerTargetType = null;
        let necromancerTargetIdx = -1;
        // ★追加: ハッカー解除制御用の変数
        let lastCleanupTurnIdx = -1;
        let lastChatTimeProcessed = 0; // ★追加: チャット吹き出し用
        let roleDraftPendingSelection = null;
        let roleDraftAdvanceBusy = false;
        let roleDraftPhaseAudioToken = "";
        const ASSET_LOADING_MIN_MS = 2500;
        let assetLoadingShownAt = 0;
        let assetLoadingUiTimer = null;
        let assetLoadingLastProgress = {
            loaded: 0,
            total: 0,
            percent: 0,
            failedCount: 0,
            currentLabel: "準備中..."
        };
        let actionInFlight = false;
        let actionInFlightName = "";
        let roomRenderRafId = null;
        let queuedRoomSnapshot = null;
        const renderCache = {
            handSig: "",
            rolePanelSig: "",
            opponentsSig: "",
            boardSig: "",
            messageSig: "",
            nameBarSig: ""
        };
        const roleDraftMonitorCache = {
            signature: "",
            html: ""
        };
        const logRenderCache = {
            signature: "",
            recentChats: []
        };
        const counterHudCache = {
            signature: "",
            numHtml: "",
            symHtml: "",
            roleHtml: ""
        };
        const lastBubbleTimestampByPid = {};
        

        const els = {
            login: document.getElementById("login-screen"),
            game: document.getElementById("game-screen"),
            assetLoadingScreen: document.getElementById("asset-loading-screen"),
            assetLoadingBar: document.getElementById("asset-loading-bar"),
            assetLoadingText: document.getElementById("asset-loading-text"),
            assetLoadingCurrent: document.getElementById("asset-loading-current"),
            assetLoadingFailed: document.getElementById("asset-loading-failed"),
            assetLoadingActions: document.getElementById("asset-loading-actions"),
            assetLoadingRetryBtn: document.getElementById("asset-loading-retry-btn"),
            assetLoadingContinueBtn: document.getElementById("asset-loading-continue-btn"),
            bootTransitionScreen: document.getElementById("boot-transition-screen"),
            bootTransitionTitle: document.getElementById("boot-transition-title"),
            roomName: document.getElementById("roomName"),
            roomSuggestion: document.getElementById("room-suggestion-panel"),
            playerName: document.getElementById("playerName"),
            hand: document.getElementById("my-hand"),
            indicator: document.getElementById("indicator"),
            graveNum: document.getElementById("graveNum"),
            graveSym: document.getElementById("graveSym"),
            others: document.getElementById("other-players"),
            msg: document.getElementById("msg"),
            hostCtrl: document.getElementById("host-controls"),
            log: document.getElementById("game-log-bar"),
            modal: document.getElementById("modal-overlay"),
            mBox: document.getElementById("modal-box"),
            mTitle: document.getElementById("modal-title"),
            mContent: document.getElementById("modal-content"),
            deckNum: document.getElementById("deckNumCount"),
            deckSym: document.getElementById("deckSymCount"),
            roleDraftMonitor: document.getElementById("role-draft-monitor"),
            mFooter: document.getElementById("modal-footer"),
            btnJoin: document.getElementById("btn-join"),
            btnChat: document.getElementById("btn-chat-icon")
        };

        let loadingActionResolver = null;

        function escapeHtml(text) {
            return String(text || "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");
        }

        function buildRenderSignature(payload) {
            try {
                return JSON.stringify(payload);
            } catch (e) {
                return `${Date.now()}`;
            }
        }

        function shortAssetLabel(label) {
            if (!label) return "-";
            const plain = String(label);
            const slashIdx = Math.max(plain.lastIndexOf("/"), plain.lastIndexOf("\\"));
            const base = slashIdx >= 0 ? plain.substring(slashIdx + 1) : plain;
            if (base.length <= 64) return base;
            return base.substring(0, 61) + "...";
        }

        function getAssetLoadingTimePercent() {
            if (!assetLoadingShownAt) return 100;
            const elapsed = Date.now() - assetLoadingShownAt;
            return Math.max(0, Math.min(100, Math.round((elapsed / ASSET_LOADING_MIN_MS) * 100)));
        }

