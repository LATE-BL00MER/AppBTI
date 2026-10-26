# 프론트엔드 API

`client.ts`는 Vite 프록시를 통해 Spring API를 호출한다. 브라우저에서 집단 지표나 유사도를 재계산하지 않는다.
`types.ts`는 `docs/API.md`와 Python `profiles.json`의 계약에 대응한다.
실제 데이터가 없으면 서버의 가상 데이터 산출물을 쓴다. 요청 오류를 가짜 결과로 대체하지 않는다.
