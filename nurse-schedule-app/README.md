# 看護師勤務表管理システム

看護師の勤務表作成・管理を効率化するWebアプリケーションです。

## 機能

- 👥 職員管理（Excel一括読み込み対応）
- 📅 休み希望入力（職員用画面）
- 🤖 勤務表自動生成
  - 週ごとの夜勤人数設定（隔週3人/4人など）
  - 日勤者数設定（平日/土日/年末年始）
  - 前月データ連携
- 📊 統計表示（個人別・日別）
- 📥 Excel出力

## 技術スタック

- React 18 + TypeScript
- Vite
- Tailwind CSS
- Lucide React (アイコン)
- SheetJS (Excel操作)

## ローカル開発

```bash
npm install
npm run dev
```

## デプロイ

Vercelで自動デプロイ可能です。
