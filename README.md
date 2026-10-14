# 뚝 카이로 클리닉

폰을 가로로 쥐고 환자 목 각도를 맞춘 뒤 손목을 툭 꺾어 교정하는 3D 모바일 웹 게임 프로토타입.

- 플레이: https://gooreum.github.io/ttuk-chiro-clinic/ (센서는 HTTPS에서만 동작)
- 아이폰: 세로 화면 고정을 켜고 플레이(게임이 스스로 가로로 그림).
- 개발: `npm install` → `npm run dev` / `npm test` / `npm run build`(`dist/`, 정적 파일만)
- 배포: main에 push하면 GitHub Actions가 Pages로 배포. `dist/`를 Netlify Drop에 올려도 된다.
- 스크린샷 검증: `npm run build:shot && .venv/bin/python -I scripts/shot.py dist-shot`
- 개발 가이드: `AGENTS.md`
