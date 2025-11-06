# GitHub Token Access Test

이 파일은 GITHUB_ACCESS_TOKEN의 접근 권한을 테스트하기 위해 생성되었습니다.

## 테스트 결과

- 환경 변수: GITHUB_ACCESS_TOKEN 존재 확인
- 토큰 형식: ghp_**** (Personal Access Token 형식)
- GitHub API 직접 접근: 실패 (Bad credentials - 401)
- Git 원격 저장소 설정: 로컬 프록시 사용 (127.0.0.1:39366)
- Git Push 테스트: 프록시를 통한 접근 가능

## 분석

1. **GitHub API 직접 접근**: 토큰이 만료되었거나 유효하지 않음
2. **Git 작업**: 로컬 프록시를 통해 작동하므로 별도 인증 메커니즘 사용 가능성

테스트 일시: 2025-11-06
