# 케이스 영상 녹화

재녹화: `npm run dev -- --port 5181 & npm run dev -- --mode shot --port 5182 & node scripts/cases/run.mjs --out <출력폴더> --dev http://127.0.0.1:5181 --shot http://127.0.0.1:5182`

- `cases.mjs` 케이스 정의, `run.mjs` Playwright 녹화(영상+소리 mp4), `cases.json` 녹화 결과 메타(영상 파일 제외).
