# Windows 시스템 리소스 모니터링 & PDF 리포트 생성 도구

Windows 환경에서 동작하는 웹 기반 실시간 시스템 리소스 모니터링 및 PDF 리포트 생성 도구입니다.

## 주요 기능

- **실시간 모니터링**: CPU, 메모리, 디스크, 네트워크, GPU(가능 시) 등의 시스템 리소스를 실시간으로 모니터링
- **웹 기반 UI**: 브라우저에서 실시간 그래프와 데이터 테이블 확인
- **자동 PDF 리포트**: 모니터링 종료 후 통계 및 그래프가 포함된 PDF 자동 생성
- **데이터 저장**: 수집된 원시 데이터를 JSON 파일로 저장

## 기술 스택

### 백엔드
- **Node.js** & **Express**: 웹 서버
- **Socket.io**: 실시간 양방향 통신 (WebSocket)
- **systeminformation**: 크로스 플랫폼 시스템 정보 수집
- **PDFKit**: PDF 생성
- **Chart.js (node-canvas)**: 서버 사이드 차트 생성

### 프론트엔드
- **HTML5** & **CSS3**: UI 구조 및 스타일링
- **Vanilla JavaScript**: 클라이언트 로직
- **Socket.io-client**: 실시간 데이터 수신
- **Chart.js**: 실시간 차트 렌더링

## 프로젝트 구조

```
windows-system-monitor-pdf/
├── server/
│   ├── index.js                 # 서버 진입점
│   ├── services/
│   │   ├── monitor.js           # 시스템 모니터링 서비스
│   │   └── pdfGenerator.js      # PDF 리포트 생성 서비스
│   └── routes/
│       └── api.js               # API 라우트
├── public/
│   ├── index.html               # 메인 웹 페이지
│   ├── css/
│   │   └── style.css            # 스타일시트
│   └── js/
│       └── app.js               # 프론트엔드 로직
├── data/                        # 수집된 데이터 저장 (JSON)
├── reports/                     # 생성된 PDF 리포트 저장
├── package.json                 # 프로젝트 의존성
├── .gitignore
└── README.md
```

## 설치 및 실행 방법

### 1. 사전 요구사항

- **Node.js** (v16 이상 권장): [https://nodejs.org/](https://nodejs.org/)
- **Windows 10/11**
- **관리자 권한** (일부 시스템 정보 수집에 필요할 수 있음)

### 2. 프로젝트 클론 및 의존성 설치

```bash
# 프로젝트 디렉터리로 이동
cd windows-system-monitor-pdf

# 의존성 설치
npm install
```

### 3. 서버 실행

```bash
# 개발 모드 (nodemon 사용, 자동 재시작)
npm run dev

# 프로덕션 모드
npm start
```

### 4. 웹 브라우저에서 접속

서버가 정상적으로 시작되면 다음 주소로 접속하세요:

```
http://localhost:3000
```

## 사용 방법

1. **모니터링 시작**: 웹 페이지에 접속하면 자동으로 모니터링이 시작됩니다.
2. **실시간 확인**: 실시간 그래프와 데이터 테이블에서 시스템 리소스 상태를 확인합니다.
3. **모니터링 기간**: 기본값은 5분(300초)이며, 경과 시간이 실시간으로 표시됩니다.
4. **PDF 생성**: 5분이 지나면 자동으로 PDF 리포트가 생성됩니다.
5. **PDF 다운로드**: "PDF 다운로드" 버튼을 클릭하여 리포트를 저장합니다.
6. **재시작**: "모니터링 재시작" 버튼으로 새로운 세션을 시작할 수 있습니다.

## 환경 설정

서버 실행 시 환경 변수로 설정을 변경할 수 있습니다:

```bash
# 포트 번호 변경 (기본값: 3000)
PORT=8080 npm start

# 모니터링 기간 변경 (초 단위, 기본값: 300)
MONITORING_DURATION=600 npm start

# 측정 간격 변경 (초 단위, 기본값: 1)
MONITORING_INTERVAL=2 npm start
```

또는 `.env` 파일을 생성하여 설정:

```env
PORT=3000
MONITORING_DURATION=300
MONITORING_INTERVAL=1
```

## 모니터링 항목

### 기본 항목 (모든 Windows 시스템에서 지원)
- **CPU 사용률**: 전체 CPU 사용률 (%)
- **메모리**: 사용량, 여유 공간, 사용률 (%)
- **디스크**: 사용량, I/O 속도 (읽기/쓰기)
- **네트워크**: 전송/수신 속도 (KB/s)

### 추가 항목 (하드웨어 및 드라이버 지원 시)
- **CPU 온도**: 센서가 있는 경우
- **GPU 사용률**: NVIDIA/AMD GPU가 설치된 경우
- **GPU 온도**: GPU 센서가 있는 경우

> **참고**: 일부 센서는 Windows WMI, OpenHardwareMonitor 또는 GPU 제조사 드라이버가 필요할 수 있습니다. 지원되지 않는 항목은 "N/A"로 표시됩니다.

## PDF 리포트 내용

생성되는 PDF 리포트에는 다음 정보가 포함됩니다:

1. **헤더**
   - 리포트 제목
   - 생성 날짜 및 시각

2. **시스템 정보**
   - OS 버전
   - CPU 모델 및 코어 수
   - 총 메모리 용량
   - 디스크 정보

3. **모니터링 정보**
   - 모니터링 시작/종료 시각
   - 총 모니터링 시간
   - 측정 간격 및 총 데이터 포인트 수

4. **리소스별 통계**
   - 각 리소스의 최소/최대/평균값
   - 시간에 따른 변화 그래프
   - 요약 표

## 문제 해결

### Node.js 설치 확인
```bash
node --version
npm --version
```

### 포트가 이미 사용 중인 경우
```bash
# 다른 포트로 실행
PORT=8080 npm start
```

### 관리자 권한이 필요한 경우
Windows에서 명령 프롬프트 또는 PowerShell을 **관리자 권한으로 실행**한 후 서버를 시작하세요.

### Canvas 관련 오류 (PDF 생성 시)
Windows에서 `canvas` 모듈 설치 중 오류가 발생하면:

1. **Windows Build Tools** 설치:
   ```bash
   npm install --global windows-build-tools
   ```

2. 또는 **Visual Studio Build Tools** 설치:
   - [Visual Studio Downloads](https://visualstudio.microsoft.com/downloads/)에서 "Build Tools for Visual Studio" 다운로드
   - "Desktop development with C++" 워크로드 선택

## 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다.

## 기여

버그 리포트, 기능 제안 또는 풀 리퀘스트를 환영합니다!

## 연락처

문의사항이 있으시면 이슈를 등록해 주세요.

---

**개발 환경**: Node.js v16+, Windows 10/11
**마지막 업데이트**: 2025-11-06
