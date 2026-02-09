# AGENTS.md

## Scope
- このファイルの指示は `C:\Users\sakan\SEK_Interface\SEKI_ONLINE` 配下全体に適用する。
- より深い階層に別の `AGENTS.md` がある場合は、そちらを優先する。

## Language
- ユーザーへの説明・報告は日本語で行う。
- コード内コメントは既存スタイルに合わせる。

## Workflow
- 変更前に対象箇所を読み、既存仕様（特に役職処理・ターン進行・ログ）を確認する。
- 変更は必要最小限にし、無関係なリファクタや整形を混ぜない。
- 既存の未コミット変更は巻き戻さない。

## Shell
- Use PowerShell
- Use encoding utf-8
- Prefer `npm.cmd` / `npx.cmd` over `npm` / `npx` in PowerShell (ExecutionPolicy-safe)

## Validation
- JavaScript を編集したら、最低限の構文チェックを実行する。
- PowerShell 上で npm / npx 系コマンドを使う場合は `npm.cmd` / `npx.cmd` を使う。
- 構文チェック手順は作業報告に実行コマンドを明記する（失敗時は理由と代替手段も明記）。
- public/private ログの追加時は、送信タイミングと対象種別を確認する。

## Game-Specific Rules
- 新役職・効果追加時は次を必ず確認する。
- 対象外案内は原則 `disabled` ボタンと注記で表現し、対象外クリック時に別モーダルを開かない。
1. 発動条件（自ターン/使用済み判定）
2. 対象選択UI（対象外表示・押下時の案内）
3. 実行時ガード（UIすり抜け防止）
4. ターン進行（終了するか、継続するか）
5. 効果解除条件（解除ログ含む）

## User Interface
- 白の背景に黄色の文字など、見ずらい配色は使わない。

## Out of Scope Defaults
- 明示依頼がない限り、ファイル構成変更・依存追加・大規模デザイン変更は行わない。
