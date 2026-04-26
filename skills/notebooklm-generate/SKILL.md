---
name: notebooklm-generate
description: "現在の notebooklm MCP fork (takachaa/notebooklm-mcp-secure) を使ってスライド生成→ダウンロード→スピーカーノート挿入→バッチ結合までを一気通貫で自動実行する。notebooklm-prepareスキルで作成済みのプロンプトとスピーカーノートを入力として、完成版PPTXを出力する。Use when user says 'notebooklm-generate', 'スライド生成実行', 'NotebookLMで生成', 'MCPでスライド作って', 'スライドをNotebookLMで作って', 'プロンプトからスライド生成', or when notebooklm_slides_prompt.md exists and user wants to generate the actual slides. Also trigger when user has just finished running notebooklm-prepare and wants to proceed to generation."
---

NotebookLM MCP（このリポジトリの fork: takachaa/notebooklm-mcp-secure）経由でスライドを自動生成し、スピーカーノート付きの完成版PPTXを出力するスキル。

Phase 1（プロンプト生成）は`notebooklm-prepare`スキルが担当し、このスキルはPhase 2（実行）を担当する。

## 前提条件

- 本リポジトリの notebooklm MCP が Claude Desktop / Claude Code に登録・認証済み
  - `mcp__notebooklm__get_health` が `authenticated: true` を返す状態
  - 未認証なら `mcp__notebooklm__setup_auth` を呼んで Google ログインしてもらう
- 利用可能なツール: `get_health`, `create_notebook`, `add_source`, `list_sources`, `generate_slides`, `get_slides_status`, `download_slides`, `revise_slides`
- `python-pptx` がインストール済み（後処理で使用）
- 以下のファイルが事前に作成済み:
  - `notebooklm_slides_prompt.md` -- スライド生成プロンプト（notebooklm-prepareの出力）
  - `speaker_notes.md` -- スピーカーノート（【Slide N｜タイトル】形式）

## ツール命名の差分（旧 notebooklm-mcp-cli → 本 fork）

このスキルを以前 cli 版で使っていた場合、以下が変わっている:

| 用途 | 旧 | 本 fork |
|---|---|---|
| 接続確認 | `server_info` | `get_health` |
| ノートブック作成 | `notebook_create` | `create_notebook` (sources を配列で同時投入可) |
| ソース追加 | `source_add(...wait=True)` | `add_source(notebook_id, source: {type,value,title?})` |
| スライド生成 | `studio_create(slide_format="detailed_deck", focus_prompt=..., confirm=True)` | `generate_slides(format="detailed", description=...)` |
| 状態確認 | `studio_status` | `get_slides_status` |
| ダウンロード | `download_artifact(slide_deck_format="pptx")` | `download_slides(format="pptx", output_path=...)` |
| リビジョン | `studio_revise(slide_instructions=[{slide,instruction},...])` | `revise_slides(instructions: string)` ※自然文1本 |

## ワークフロー

### Step 1: MCP接続確認

`mcp__notebooklm__get_health` を呼び出して接続を確認する。

- `authenticated: true` → Step 2へ
- `authenticated: false` → 「`mcp__notebooklm__setup_auth` を実行して、ブラウザで Google ログインしてください」と案内
- ツールが見つからない → 「Claude Desktop / Claude Code の MCP 設定に notebooklm が登録されているか確認してください」と案内

### Step 2: ソースファイルの自動検出

カレントディレクトリと関連パスから以下を探す:

| ファイル | 検索パターン | 必須 |
|---------|------------|------|
| Note記事 | `note_article_ren_style.md` → `note_article.md` | Yes（動画構成の場合は`yt_video_structure.md`） |
| スピーカーノート | `speaker_notes.md` | Yes |
| キャラクター画像 | カレントディレクトリにあるキャラクター画像（.png/.jpg）があればソースに含める | No |
| スライドプロンプト | `notebooklm_slides_prompt.md` | Yes |
| Insertスライド | `~/.claude/skills/notebooklm-generate/templates/Insert.pptx` または プロジェクト直下の `.claude/skills/notebooklm-generate/templates/Insert.pptx` | No（あれば自動マージ） |

検出結果を一覧表示し、ユーザーに確認してから次へ進む。キャラクター画像が見つからない場合はスキップ可能。ユーザーが追加ソースを指定したい場合も受け付ける。

### Step 3: ノートブック作成 + 全ソースを同時投入

本 fork の `create_notebook` は `sources` 配列で複数ソースを一括登録できるので、Step 4 を分けず一回の呼び出しで完結させる:

```jsonc
mcp__notebooklm__create_notebook({
  "name": "<プロジェクト名>",
  "sources": [
    { "type": "file", "value": "<絶対パス>/note_article.md", "title": "記事" },
    { "type": "file", "value": "<絶対パス>/notebooklm_slides_prompt.md", "title": "notebooklm_slides_prompt" },
    { "type": "file", "value": "<絶対パス>/speaker_notes.md", "title": "speaker_notes" }
    // キャラクター画像があればここに追加
  ],
  "description": "Auto-generated from notebooklm-generate skill",
  "topics": ["slides", "presentation"]
})
```

返ってくる `notebook_id` / `notebook_url` を以降のステップで使う。

### Step 4: 追加ソースが後出しになった場合のみ

Step 3 で全部投入できなかったソース（後から思い出した画像・補助資料など）は `add_source` で個別に追加:

```jsonc
mcp__notebooklm__add_source({
  "notebook_id": "<id>",
  "source": { "type": "file", "value": "<絶対パス>/extra.png", "title": "キャラクター" }
})
```

並列呼び出しは可能（ブラウザの newPage で複数タブが立ち上がる）だが、実装が click 駆動なので**最初は逐次で動かす**。

### Step 5: スライド生成（バッチ対応）

`notebooklm_slides_prompt.md` を解析してスライド総数を把握する（`Slide N` の最大番号を検出）。

**バッチ分割ルール（均等2分割優先）:**
- 10枚以下 → 1バッチ
- 11〜40枚 → 2バッチに均等分割（例: 22枚→11+11、30枚→15+15）
- 41枚以上 → 3バッチ以上に均等分割（1バッチ最大20枚）

**各バッチの `generate_slides` 呼び出し:**

```jsonc
mcp__notebooklm__generate_slides({
  "notebook_id": "<id>",
  "format": "detailed",
  "language": "日本語",
  "description": "ソースの「notebooklm_slides_prompt」に書かれた指示に完全に従って、Slide {start}〜Slide {end}を生成してください。プロンプト内のレイアウト指示、配色、テキスト内容をすべて忠実に再現してください。【キャラクター画像のルール】ソースにキャラクター画像がアップロードされている場合は、Slide 1（始まりのあいさつ）と最終 Slide（おわかれのあいさつ）の 2 枚にだけ配置してください。それ以外の中間スライドにはキャラクターを一切登場させないでください（中間に出すと NotebookLM 側の再描画で再現度が大きく落ちるため、出番を絞って忠実度を担保します）。配置するときは、ソースとして与えられたキャラクター画像をそのまま忠実に使い、アレンジ・色変更・ポーズ変更・サイズ変更・再描画を一切行わないでください。各スライドのキャラ役は確定スライド一覧の『キャラ：』欄の指示に従ってください。"
})
```

**重要な制約:**
- 本 fork の `generate_slides` は枚数指定パラメータがないので、**枚数コントロールは `description` 内の自然文と元プロンプトに依存**する。生成枚数が指定通りにならないことがある（NotebookLM 側の解釈次第）。
- `format` は `detailed` (詳細なスライド) / `presenter` (プレゼンターのスライド) の二択。
- `length` は `default` / `short` の二択（任意）。

**並列バッチ生成（試験的）:** 同じ notebook に対して `generate_slides` を複数並列で呼び出すことは技術的には可能（各呼び出しが新しいブラウザページを開く）。ただし:
- 本 fork での同時並列実行は未検証。最初は**逐次（バッチ1完了 → バッチ2開始）で動かして安定化させる**。
- 並列に切り替えるなら、複数の `generate_slides` をひとつのアシスタント応答で同時に投げる。NotebookLM 側でロックされる場合は逐次に戻す。

### Step 6: ステータスポーリング

`get_slides_status` で完了を監視する。

```jsonc
mcp__notebooklm__get_slides_status({ "notebook_id": "<id>" })
// → { status: "generating" | "ready" | "failed" | "not_started" | "unknown", title: "..." }
```

- ポーリング間隔: 最初の3分は30秒おき、その後は60秒おき
- `status === "ready"` で完了
- 60分経過で打ち切り、ユーザーに状況を報告して判断を仰ぐ

ポーリング中はユーザーのメッセージに応答できる状態を保つ。長 sleep で会話をブロックしない。

**バッチ間で同じ notebook を共有している場合:** `get_slides_status` は最新の artifact 1 件を返す仕様。複数バッチを並列で走らせている場合は、どの artifact が「最新」になるか順序が読みにくい。逐次運用なら問題なし。

### Step 7: ダウンロード

各バッチ完了後、PPTX 形式でダウンロードする:

```jsonc
mcp__notebooklm__download_slides({
  "notebook_id": "<id>",
  "format": "pptx",
  "output_path": "<絶対パス>/slides_batch{N}_slide{start}-{end}.pptx"
})
```

**ファイル名は `slides_batch{N}_slide{start}-{end}.pptx` を厳守**。後処理スクリプトがファイル名からスライド番号範囲を自動検出する。

並列バッチを走らせた場合は、最新 artifact しかダウンロードできない既知制約があるので、各バッチ完了 → 即ダウンロードを 1 セットで運ぶ。

### Step 8: 後処理（スピーカーノート挿入 + バッチ結合 + Insertマージ）

`scripts/postprocess_slides.py` を使って一括処理する:

```bash
python3 .claude/skills/notebooklm-generate/scripts/postprocess_slides.py \
  --speaker-notes speaker_notes.md \
  --insert .claude/skills/notebooklm-generate/templates/Insert.pptx \
  --insert-after 3 \
  --output {フォルダ名}.pptx \
  slides_batch1_slide1-20.pptx slides_batch2_slide21-32.pptx
```

スクリプトが行うこと:
1. `speaker_notes.md` を解析（【Slide N｜タイトル】区切り）
2. 各バッチPPTXにスピーカーノートを挿入（ファイル名からスライド番号を自動検出）
3. 複数バッチを1つのPPTXに結合（バッチ1をベースに、バッチ2以降の画像を抽出→再追加）
4. Insert.pptxのスライドをマージ:
   - Insert Slide 1 → `--insert-after` で指定した位置の後に挿入（デフォルト: 3 = イントロ後）
   - Insert Slide 2以降 → 末尾に追加

出力ファイル名はプロジェクトフォルダ名をベースにする（例: `MyProject.pptx`）。

Insert.pptxが `templates/` に存在しない場合は `--insert` オプションを省略する。

### Step 9: 完了報告 ＋ 自動オープン

`open` コマンドで完成PPTXを自動的に開く:

```bash
open {出力ファイルパス}
```

その後、以下を報告する:

```
## 生成完了

| ファイル | 枚数 | サイズ |
|---------|------|-------|
| {フォルダ名}.pptx | {N}枚 | {size} MB |

- ノートブック: <notebook_url>
- スピーカーノート: 全{N}枚に挿入済み
- Insertスライド: {挿入枚数}枚マージ済み（Slide 1→{insert_after}枚目の後、残り→末尾）

### 修正が必要な場合
- mcp__notebooklm__revise_slides({ instructions: "..." }) で再生成可能
- 本 fork の revise_slides は単一の自然文を受け付ける（複数スライドへの指示はカンマ区切りで一文にまとめる）
- 修正後は新しい artifact として生成されるので、再度 download_slides して該当バッチを差し替える
```

## 技術的な注意事項

### NotebookLMスライドの構造
- 各スライドは1枚のPNG画像としてPPTXに埋め込まれている（テキストボックスではない）
- PowerPoint上でテキストを直接編集することはできない
- 修正は `revise_slides`（再生成）または PNG 画像の差し替えで行う

### `revise_slides` の仕様（cli 版との差分）
- cli 版: `slide_instructions: [{slide: 3, instruction: "..."}]` の構造化配列
- 本 fork: `instructions: string` の単一文字列
- 複数スライド修正は1つの指示文にまとめる:

```jsonc
mcp__notebooklm__revise_slides({
  "notebook_id": "<id>",
  "instructions": "Slide 3 のタイトルを「AIタスク管理の全体像」に変更し、Slide 7 の本文に具体的な使用例を1つ追加してください。"
})
```

### MCP 認証エラー時の案内
- `get_health` で `authenticated: false` → ユーザーに `mcp__notebooklm__setup_auth` の実行を案内
- ツール自体が見つからない → Claude Desktop / Claude Code の再起動（pin 変更直後など）を案内

### 制約
- NotebookLM は非公式 API ではないので、UI 仕様変更で動かなくなる可能性がある
- 無料版で約50クエリ/日の制限
- スライド生成は1バッチ2〜10分かかることがある（枚数・サーバー負荷による）
- 本 fork の Studio 系（slides / infographic）は customize dialog を経由する設計。プロンプトはダイアログの「説明テキスト」textarea に入る

## 関連スキル

| スキル | 役割 | 関係 |
|-------|------|------|
| `notebooklm-prepare` | プロンプト + スピーカーノート生成 | 上流（このスキルの入力を作る） |
