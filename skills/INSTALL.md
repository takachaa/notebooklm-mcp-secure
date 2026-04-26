# NotebookLM スライド自動生成スキル — このリポジトリ版

このリポジトリ (`takachaa/notebooklm-mcp-secure`) の MCP server に合わせて調整した、Claude Code 用の **2 段スキル** です。

## 何のスキルか

| スキル | 役割 |
|---|---|
| `notebooklm-prepare` | Note 記事や YouTube 動画構成から、NotebookLM に貼るスライド生成プロンプトとスピーカーノートを生成する (Phase 1) |
| `notebooklm-generate` | 本リポジトリの MCP 経由でノートブック作成 → ソース投入 → スライド生成 → ダウンロード → スピーカーノート挿入 → バッチ結合まで自動実行する (Phase 2) |

## v1.1.0 オリジナルとの違い

オリジナル系のスキル ([notebooklm-slides-skills v1.1.0](https://github.com/notebooklm-mcp/notebooklm-slides-skills) 等) は `notebooklm-mcp-cli` (`uv tool install notebooklm-mcp-cli` + `nlm login`) を前提としています。

この版は **本リポジトリの MCP fork** (`github:takachaa/notebooklm-mcp-secure#<sha>`) を使うように `notebooklm-generate/SKILL.md` を全面的に置き換えています:

| 用途 | オリジナル | この版 |
|---|---|---|
| 接続確認 | `server_info` | `mcp__notebooklm__get_health` |
| ノートブック作成 | `notebook_create` | `mcp__notebooklm__create_notebook` (sources を配列で同時投入可) |
| ソース追加 | `source_add` | `mcp__notebooklm__add_source` |
| スライド生成 | `studio_create(slide_format="detailed_deck", focus_prompt=...)` | `mcp__notebooklm__generate_slides(format="detailed", description=...)` |
| 状態確認 | `studio_status` | `mcp__notebooklm__get_slides_status` |
| ダウンロード | `download_artifact(slide_deck_format="pptx")` | `mcp__notebooklm__download_slides(format="pptx")` |
| リビジョン | `studio_revise(slide_instructions=[{slide,instruction},...])` | `mcp__notebooklm__revise_slides(instructions: string)` ※ 自然文 1 本 |

`notebooklm-prepare` は MCP を直接呼ばないので無修正。`scripts/postprocess_slides.py` も無修正。

## 前提

- 本リポジトリの notebooklm MCP が Claude Desktop / Claude Code に登録・認証済み:
  ```jsonc
  // ~/Library/Application Support/Claude/claude_desktop_config.json または ~/.claude.json
  {
    "mcpServers": {
      "notebooklm": {
        "command": "npx",
        "args": ["-y", "github:takachaa/notebooklm-mcp-secure#<最新コミット>"],
        "env": {
          "NLMCP_AUTH_ENABLED": "true",
          "NLMCP_AUTH_TOKEN": "<任意のシークレット>"
        }
      }
    }
  }
  ```
- 認証済み: `mcp__notebooklm__get_health` が `authenticated: true` を返す
- `python-pptx` 1.0+ がインストール済み: `pip install python-pptx`

## デプロイ方法

Claude Code はスキルを以下から読み込みます:

- ユーザー全体: `~/.claude/skills/`
- プロジェクト単位: `<プロジェクトルート>/.claude/skills/`

このリポジトリでは canonical な置き場所が `skills/` (このフォルダ) です。**Claude Code に認識させるには、`.claude/skills/` 配下にコピーまたはシンボリックリンクを張る必要があります。**

### 方式 A: 全プロジェクトで使う (ユーザー全体)

```bash
mkdir -p ~/.claude/skills
cp -r skills/notebooklm-prepare  ~/.claude/skills/
cp -r skills/notebooklm-generate ~/.claude/skills/
```

更新時は同じ `cp -r` を再実行。

### 方式 B: 1 プロジェクトのみで使う (プロジェクトレベル)

そのプロジェクトのルートで:

```bash
mkdir -p .claude/skills
cp -r <このリポジトリのパス>/skills/notebooklm-prepare  .claude/skills/
cp -r <このリポジトリのパス>/skills/notebooklm-generate .claude/skills/
```

### 方式 C: シンボリックリンク (更新を自動追従)

```bash
ln -s <このリポジトリのパス>/skills/notebooklm-prepare  .claude/skills/notebooklm-prepare
ln -s <このリポジトリのパス>/skills/notebooklm-generate .claude/skills/notebooklm-generate
```

シンボリックリンクなら repo 側を `git pull` するだけで反映される。Claude Code はシンボリックリンクを follow します。

## デプロイ後の確認

新しい Claude Code セッションで:

1. `mcp__notebooklm__get_health` → `authenticated: true`
2. `python3 -c "import pptx; print(pptx.__version__)"` → 1.0 以上
3. 「スライドの準備をして」と言って `notebooklm-prepare` がトリガーするか確認

## 使い方

### Phase 1: 構成案とプロンプトを作る

スライドにしたい記事やドキュメントがあるフォルダで:

> スライドの準備をして

Claude Code が記事を読んで構成案を提案します。選択するとプロンプトとスピーカーノートが自動生成されます。

### Phase 2: スライドを生成する

プロンプトとスピーカーノートができたら:

> NotebookLMでスライド生成して

MCP 経由でノートブック作成 → ソース投入 → スライド生成 → ダウンロード → スピーカーノート挿入 → バッチ結合まで自動で実行されます。

## Insert.pptx (定型スライドの自動挿入)

`skills/notebooklm-generate/templates/Insert.pptx` を配置すると、生成スライドに自動で挿入されます:

- Slide 1 → イントロ後 (`--insert-after 3` で 3 枚目の後、変更可能)
- Slide 2 以降 → スライドデッキの末尾

未配置でも問題なし (挿入処理は自動でスキップ)。

## トラブルシューティング

### MCP 認証エラー

```
mcp__notebooklm__setup_auth
```

を呼んで Google ログインしてもらう。Cookie 認証なので一定期間で切れる。

### MCP が見つからない

Claude Desktop / Claude Code の再起動。pin 更新直後は再起動が必須。

### `python-pptx` がない

```bash
pip install python-pptx
```

### スライド生成が指定枚数にならない

本 fork の `generate_slides` は枚数指定パラメータがないので、生成枚数は NotebookLM の解釈次第。ズレた場合は `revise_slides` で「追加してください / 削除してください」と指示する。

## 注意事項

- NotebookLM は非公式 API なので、Google の UI 仕様変更で動かなくなる可能性があります
- 無料版で約 50 クエリ/日 の制限
- 利用は自己責任で
