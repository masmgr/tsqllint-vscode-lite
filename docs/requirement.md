了解。呼び出し対象が **tsqllint CLI（TSQLLint）**で確定したので、要件定義ドラフトを **「外部ツール実行＝tsqllint を直接叩いて stdout をパースする」前提**に更新します。
※tsqllint の出力は少なくとも `file.sql(line,col): severity rule : message` 形式の実例があり ([GitHub][1])、設定により **error が出ると非0終了**する仕様です ([GitHub][2])

---

# 要件定義書（ドラフト・tsqllint版）

## 1. 目的

* VS Code 拡張として **tsqllint** を実行し、SQL のアンチパターン検出結果を **Diagnostics（赤線・問題リスト・ホバー）**で表示する。
* 既存拡張（古い基盤）を延命せず、**最新テンプレ土台で段階的に移植**できる状態を作る。

---

## 2. 前提（tsqllint仕様）

### 2.1 ツールのインストール形態

* tsqllint は **dotnet tool / Homebrew / npm** で導入可能 ([GitHub][2])

  * dotnet tool: `dotnet tool install --global TSQLLint` ([GitHub][2])
  * Homebrew: `brew install tsqllint` ([GitHub][2])
  * npm: `npm install tsqllint -g` ([GitHub][2])

### 2.2 実行インターフェース（最小）

* lint: `tsqllint <file.sql | dir | wildcard>` ([GitHub][2])
* config: `-c` 指定、もしくは探索（環境変数/カレント/ホーム等） ([GitHub][2])
* 出力：少なくとも以下形式の例がある（stdout想定）

  * `~/Desktop/foo.sql(1,-1): warning prefer-tabs : Should use spaces rather than tabs.` ([GitHub][1])
  * `ImportAssociationAttributes.sql(74,1): error conditional-begin-end : ...` ([GitHub][3])
* 終了コード：ルールが **error** の違反があると非0になりうる ([GitHub][2])
  ※warning は0になりうる（ツール仕様として説明あり） ([GitHub][2])

---

## 3. スコープ

### In Scope

* `.sql` を対象に、tsqllint を実行して Diagnostics を表示
* 保存時（onSave）での lint（変更時は debounce で任意）
* `.tsqllintrc` の扱い（探索/パス指定/--print-config 連携）
* インストール検出・エラーメッセージ改善（導入手順提示）
* 仕様テスト/CI（typecheck+lint+test+build）

### Out of Scope（初期）

* LSP（まず無しで実装し、必要になったら再検討）
* 高度補完（ルール名補完など）
* workspace全体の重い解析（初期はファイル単位）

---

## 4. 機能要件

### 4.1 lint実行トリガ

* 基本：**保存時 lint**
* オプション：変更時 lint（debounce、例 300–800ms）
* 同時実行は **キュー化（最大1）**（連打・多重起動防止）

### 4.2 tsqllint実行

* 実行コマンドは **`tsqllint` を直接呼ぶ**（PATH解決）
* 引数（最小）：

  * 対象ファイルパス（or dir）
  * 任意で `-c <configPath>`（ユーザー設定で指定可能）
* 終了コードの扱い：

  * **exitCode != 0 でも “実行失敗” と断定しない**

    * error違反で非0になる仕様があるため ([GitHub][2])
  * ただし「tsqllint 自体が起動できない」「stderr に tool not found」などは実行失敗

### 4.3 出力パース → Diagnostics変換

* stdout から 1行ずつ読み取り、以下を抽出して Diagnostic を生成：

  * file, line, column, severity, ruleName, message ([GitHub][1])
* 想定フォーマット（暫定）：

  * `<path>(<line>,<col>): <severity> <rule> : <message>`
* マッピング：

  * error → `DiagnosticSeverity.Error`
  * warning → `DiagnosticSeverity.Warning`
  * （info等が出るなら `Information` に）

### 4.4 設定（Configuration）

* 拡張設定で提供：

  * `tsqllint.path`（任意：明示パス。最優先）
  * `tsqllint.configPath`（任意：`-c` で渡す）
  * `tsqllint.runOnSave`（default true）
  * `tsqllint.runOnType`（default false）
  * `tsqllint.debounceMs`
* `.tsqllintrc` の探索は tsqllint 側仕様に任せる（優先順位が明記されている） ([GitHub][2])
  → 拡張は **configPath 指定がある時だけ `-c` を付与**（それ以外は素直に実行）

### 4.5 エラー表示（ユーザー誘導）

* tsqllint が見つからない場合：

  * OS別に導入手順（dotnet/brew/npm）を提示 ([GitHub][2])
* configに問題がある場合：

  * `--print-config` の存在を案内 ([GitHub][2])
* 失敗時は「stderr + 次にやること」を必ず表示（ただの“失敗しました”禁止）

---

## 5. 非機能要件

* Windows/macOS/Linuxで動作
* タイムアウト（例：10秒、設定化）
* 実行時のcwd：ワークスペースルート（なければファイルのディレクトリ）
* ログ：開発者向け OutputChannel（デフォルトは静か、失敗時のみ通知）

---

## 6. テスト要件（勝ち筋）

### 6.1 仕様テスト（最重要）

* SQLサンプルと期待DiagnosticsをJSONで固定（行/列/メッセージ/Severity）
* 目的：作り直しで挙動がズレたら即検知

### 6.2 テスト階層

* Unit（dotnet不要）

  * 出力パーサ（文字列→Diagnostics）
  * 設定解決（path/configPath）
* Integration（CIで任意）

  * 実 tsqllint を入れて数ケース実行（導入コストが許せば）
  * もしくは **フェイクCLI**（同形式のstdoutを吐くだけ）でプロセス周りを叩く
* E2E（最小）

  * VS Code起動→sql開く→diagnosticsが出ることだけ確認

---

## 7. 実装方針（LSP無し・推奨）

* `lint/runTsqllint.ts`：外部実行（execa推奨）
* `lint/parseOutput.ts`：stdoutパース（純粋関数）
* `extension.ts`：イベント（onSave/onChange）→ lint → DiagnosticCollection更新

---

## 8. 未決事項（ここだけ決めれば着手できる）

1. lint対象：保存時のみ？リアルタイムも要る？
2. config：拡張が `-c` を常に付ける運用？（推奨は「指定ある時だけ」）
3. 対象範囲：単一ファイル lint だけ？ディレクトリ/ワイルドカードもやる？ ([GitHub][2])

---

必要なら次は、**tsqllint 出力パーサの確定**が一番効きます。
今ある実例だと `(<line>,<col>)` は取れるけど、`col=-1` みたいなケースもある ([GitHub][1])ので、「-1は行頭扱い」などの仕様をここで固定すると後がラクです。

[1]: https://github.com/tsqllint/tsqllint-sample-plugin "GitHub - tsqllint/tsqllint-sample-plugin"
[2]: https://github.com/tsqllint/tsqllint "GitHub - tsqllint/tsqllint: Configurable linting for TSQL"
[3]: https://github.com/tsqllint/tsqllint/issues/130 "Order error output by row number · Issue #130 · tsqllint/tsqllint · GitHub"
