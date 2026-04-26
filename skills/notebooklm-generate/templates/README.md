# templates フォルダ

このフォルダに `Insert.pptx` を配置すると、スライド生成時に自動で挿入されます。

## Insert.pptx の使い方

チャンネル紹介やCTAスライドを自動挿入したい場合に使います。

- **Slide 1**: イントロ後（`--insert-after 3` で3枚目の後）に挿入されます
- **Slide 2以降**: スライドデッキの末尾に追加されます

### 用途の例

- チャンネル紹介スライド
- メンバーシップ案内
- CTA（Call to Action）
- 自己紹介スライド
- スポンサー紹介

### 作り方

1. PowerPointで定型スライドを作成
2. `Insert.pptx` として保存
3. このフォルダ（`~/.claude/skills/notebooklm-generate/templates/`）に配置

Insert.pptxが存在しない場合、挿入処理はスキップされます（エラーにはなりません）。
