# Windows 시스템 모니터링 애플리케이션 - 코드 보안 리뷰

**리뷰 날짜:** 2025-11-06
**리뷰 대상:** Windows System Monitor with PDF Report Generator
**심각도 등급:** 🔴 High | 🟠 Medium | 🟡 Low | 🟢 Info

---

## 목차
1. [보안 취약점](#1-보안-취약점)
2. [인증 및 권한 관리](#2-인증-및-권한-관리)
3. [입력 검증 및 데이터 무결성](#3-입력-검증-및-데이터-무결성)
4. [리소스 관리](#4-리소스-관리)
5. [에러 처리 및 로깅](#5-에러-처리-및-로깅)
6. [코드 품질 및 유지보수성](#6-코드-품질-및-유지보수성)
7. [네트워크 보안](#7-네트워크-보안)
8. [권장사항 요약](#8-권장사항-요약)

---

## 1. 보안 취약점

### 🔴 1.1 Path Traversal 취약점 (CRITICAL)

**위치:** `server/routes/api.js:12-33`

```javascript
router.get('/download-pdf/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const reportsDir = path.join(__dirname, '../../reports');
  const pdfPath = path.join(reportsDir, `${sessionId}.pdf`);
  // sessionId에 대한 검증 없음!
```

**문제점:**
- `sessionId` 파라미터에 대한 검증이 전혀 없음
- `../../../etc/passwd` 같은 경로 조작 시도가 가능
- 임의의 시스템 파일 읽기 가능

**악용 예시:**
```bash
curl http://localhost:3000/api/download-pdf/../../../etc/passwd
curl http://localhost:3000/api/download-pdf/../../package.json
```

**영향:**
- 서버의 모든 파일에 무단 접근 가능
- 설정 파일, 소스 코드, 환경 변수 노출 위험
- 시스템 정보 유출

**권장 수정:**
```javascript
// sessionId 형식 검증 (타임스탬프 기반)
if (!/^session-\d+$/.test(sessionId)) {
  return res.status(400).json({ error: '잘못된 세션 ID 형식입니다.' });
}

// path.resolve로 절대 경로 검증
const pdfPath = path.resolve(reportsDir, `${sessionId}.pdf`);
if (!pdfPath.startsWith(path.resolve(reportsDir))) {
  return res.status(403).json({ error: '접근 권한이 없습니다.' });
}
```

---

### 🔴 1.2 세션 데이터 무단 접근 (CRITICAL)

**위치:** `server/routes/api.js:66-89`

```javascript
router.get('/session-data/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  // 검증 없이 모든 세션 데이터 제공
```

**문제점:**
- 누구나 다른 사용자의 세션 데이터에 접근 가능
- 시스템 정보, 사용 패턴 등 민감한 정보 노출
- sessionId 추측이 쉬움 (타임스탬프 기반)

**영향:**
- 개인정보 침해
- 시스템 구성 정보 노출
- 사용자 행동 패턴 분석 가능

---

### 🟠 1.3 DoS (서비스 거부) 취약점 (HIGH)

**위치:** `server/index.js:48-65`

```javascript
socket.on('start-monitoring', async (config = {}) => {
  const duration = config.duration || MONITORING_DURATION;
  const interval = config.interval || MONITORING_INTERVAL;
  // 값 검증 없음!
```

**문제점:**
- 클라이언트가 임의로 큰 `duration` 값 전송 가능
- 매우 작은 `interval` 값으로 서버 과부하 유도 가능
- 동시 다중 세션 시작 가능

**악용 예시:**
```javascript
// 24시간 모니터링, 0.01초 간격
socket.emit('start-monitoring', {
  duration: 86400,  // 24시간
  interval: 0.01    // 100번/초
});

// 동시에 100개 세션 시작
for(let i = 0; i < 100; i++) {
  socket.emit('start-monitoring', { duration: 3600 });
}
```

**영향:**
- 서버 메모리 고갈
- CPU 과부하
- 디스크 공간 소진 (대량의 로그 파일)

---

### 🟠 1.4 파일 시스템 고갈 (HIGH)

**위치:** `server/services/monitor.js:270-280`

```javascript
async saveData() {
  const dataPath = path.join(this.config.dataDir, `${this.sessionId}.json`);
  await fs.writeJson(dataPath, this.sessionData, { spaces: 2 });
  // 파일 삭제 메커니즘 없음!
}
```

**문제점:**
- 생성된 파일들이 자동으로 삭제되지 않음
- `data/`, `reports/` 디렉터리가 무한정 증가
- 파일 크기 제한 없음

**영향:**
- 디스크 공간 소진
- 시스템 다운
- 백업 실패

**예상 파일 크기:**
- 5분 모니터링 (300개 데이터 포인트): ~100KB JSON
- 하루 100회 실행: ~10MB
- 1년: ~3.6GB

---

### 🟡 1.5 XSS (Cross-Site Scripting) 가능성 (MEDIUM)

**위치:** `public/js/app.js:260-280`

```javascript
function handleSystemInfo(data) {
  document.getElementById('osInfo').textContent =
    `${data.os.distro} ${data.os.release} (${data.os.arch})`;
  // textContent 사용으로 XSS 방지되지만...
}
```

**현재 상태:**
- `textContent` 사용으로 기본적인 XSS 방지됨 ✅
- 하지만 서버에서 받은 데이터를 맹목적으로 신뢰

**잠재적 위험:**
- `systeminformation` 라이브러리가 악의적인 시스템 정보 반환 시
- 향후 `innerHTML` 사용으로 변경 시 취약

---

## 2. 인증 및 권한 관리

### 🔴 2.1 인증 메커니즘 부재 (CRITICAL)

**문제점:**
- 웹 애플리케이션에 접근 제어 없음
- Socket.io 연결에 인증 없음
- API 엔드포인트 공개 접근 가능

**영향:**
- 네트워크 접근 가능한 누구나 시스템 정보 열람
- 무단 모니터링 세션 시작 가능
- 다른 사용자의 리포트 다운로드 가능

**권장사항:**
```javascript
// 1. 기본 인증 추가
const basicAuth = require('express-basic-auth');
app.use(basicAuth({
  users: { 'admin': process.env.ADMIN_PASSWORD },
  challenge: true
}));

// 2. Socket.io 인증
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (isValidToken(token)) {
    next();
  } else {
    next(new Error('Authentication error'));
  }
});

// 3. 세션 기반 인증
const session = require('express-session');
app.use(session({ /* config */ }));
```

---

### 🟠 2.2 CORS 설정 부재 (HIGH)

**위치:** `server/index.js:22-24`

```javascript
const io = new Server(server);
// CORS 설정 없음!
```

**문제점:**
- 모든 오리진에서 접근 가능
- CSRF 공격에 취약

**권장사항:**
```javascript
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});
```

---

## 3. 입력 검증 및 데이터 무결성

### 🔴 3.1 사용자 입력 검증 부족 (CRITICAL)

**위치:** `server/index.js:48-65`

**검증 필요 항목:**

| 파라미터 | 현재 상태 | 권장 제한 |
|---------|---------|---------|
| `duration` | ❌ 검증 없음 | 60 ~ 3600초 (1분~1시간) |
| `interval` | ❌ 검증 없음 | 1 ~ 10초 |
| `sessionId` | ❌ 검증 없음 | 정규식: `^session-\d{13}$` |

**권장 검증 코드:**
```javascript
socket.on('start-monitoring', async (config = {}) => {
  // 입력 검증
  const duration = parseInt(config.duration) || MONITORING_DURATION;
  const interval = parseInt(config.interval) || MONITORING_INTERVAL;

  // 범위 검증
  if (duration < 60 || duration > 3600) {
    return socket.emit('error', {
      message: '모니터링 기간은 60~3600초 범위여야 합니다.'
    });
  }

  if (interval < 1 || interval > 10) {
    return socket.emit('error', {
      message: '측정 간격은 1~10초 범위여야 합니다.'
    });
  }

  // 타입 검증
  if (!Number.isInteger(duration) || !Number.isInteger(interval)) {
    return socket.emit('error', {
      message: '정수 값만 허용됩니다.'
    });
  }
});
```

---

### 🟠 3.2 환경 변수 타입 안전성 (MEDIUM)

**위치:** `server/index.js:17-19`

```javascript
const MONITORING_DURATION = parseInt(process.env.MONITORING_DURATION) || 300;
const MONITORING_INTERVAL = parseInt(process.env.MONITORING_INTERVAL) || 1;
// NaN 체크 없음!
```

**문제점:**
- `parseInt("abc")`는 `NaN` 반환
- `NaN || 300`은 `300`이 되어 버그 숨김
- 환경 변수 오타 감지 불가

**권장사항:**
```javascript
const parseDuration = parseInt(process.env.MONITORING_DURATION);
const MONITORING_DURATION = Number.isNaN(parseDuration) ? 300 : parseDuration;

// 또는 검증 라이브러리 사용
const { z } = require('zod');
const envSchema = z.object({
  PORT: z.coerce.number().int().min(1024).max(65535).default(3000),
  MONITORING_DURATION: z.coerce.number().int().min(60).max(3600).default(300),
  MONITORING_INTERVAL: z.coerce.number().int().min(1).max(10).default(1),
});
```

---

## 4. 리소스 관리

### 🔴 4.1 메모리 누수 위험 (CRITICAL)

**위치:** `server/services/monitor.js:196-234`

**문제점:**

1. **측정 데이터 무한 증가:**
```javascript
this.sessionData.measurements.push(measurement);
// 5분 = 300개, 1시간 = 3600개, 제한 없음!
```

2. **전역 상태 관리 문제:**
```javascript
// server/index.js:40-41
let monitorService = null;
let monitoringActive = false;
// 단일 인스턴스만 관리, 이전 세션 정리 불확실
```

3. **이벤트 리스너 누적:**
```javascript
monitorService.on('complete', async (sessionData) => { ... });
monitorService.on('error', (error) => { ... });
// removeAllListeners 호출 없음
```

**메모리 예상치:**
- 1개 측정 데이터: ~500 bytes
- 1시간 모니터링: 3600 * 500 = ~1.8MB
- 동시 10개 세션: ~18MB
- 메모리 누수 시 지속 증가

**권장사항:**
```javascript
// 1. 데이터 크기 제한
if (this.sessionData.measurements.length > 10000) {
  throw new Error('최대 데이터 포인트 초과');
}

// 2. 이벤트 리스너 정리
async stop() {
  // ... 기존 코드
  this.removeAllListeners();
}

// 3. 스트리밍 저장 (대용량 데이터)
async saveDataStreaming() {
  const stream = fs.createWriteStream(dataPath);
  stream.write('[');
  for (let i = 0; i < this.measurements.length; i++) {
    stream.write(JSON.stringify(this.measurements[i]));
    if (i < this.measurements.length - 1) stream.write(',');
  }
  stream.write(']');
  stream.end();
}
```

---

### 🟠 4.2 파일 관리 부재 (HIGH)

**문제점:**
- 오래된 세션 파일 자동 삭제 없음
- 파일 크기 제한 없음
- 디스크 공간 모니터링 없음

**권장사항:**
```javascript
// 정기적 파일 정리 (예: 7일 이상 파일 삭제)
const cleanupOldFiles = async (dir, maxAgeDays = 7) => {
  const files = await fs.readdir(dir);
  const now = Date.now();
  const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stats = await fs.stat(filePath);

    if (now - stats.mtime.getTime() > maxAge) {
      await fs.unlink(filePath);
      console.log(`[정리] 오래된 파일 삭제: ${file}`);
    }
  }
};

// 1시간마다 실행
setInterval(() => {
  cleanupOldFiles(dataDir);
  cleanupOldFiles(reportsDir);
}, 60 * 60 * 1000);

// 파일 크기 제한
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
if (Buffer.byteLength(JSON.stringify(data)) > MAX_FILE_SIZE) {
  throw new Error('파일 크기 초과');
}
```

---

### 🟡 4.3 동시 세션 제한 없음 (MEDIUM)

**위치:** `server/index.js:39-42`

```javascript
let monitorService = null;
let monitoringActive = false;
// 단일 세션만 처리, 하지만 Socket.io는 다중 연결 허용
```

**문제점:**
- 한 사용자만 모니터링 가능
- 다른 사용자가 기존 세션 중단 가능
- 멀티 유저 시나리오 미지원

**권장사항:**
```javascript
// 세션 맵 사용
const activeSessions = new Map();
const MAX_CONCURRENT_SESSIONS = 5;

socket.on('start-monitoring', async (config = {}) => {
  // 최대 동시 세션 확인
  if (activeSessions.size >= MAX_CONCURRENT_SESSIONS) {
    return socket.emit('error', {
      message: '최대 동시 세션 수 초과'
    });
  }

  // 사용자별 세션 생성
  const sessionKey = socket.id;
  const monitorService = new MonitorService(config);
  activeSessions.set(sessionKey, monitorService);

  // 완료 시 정리
  monitorService.on('complete', () => {
    activeSessions.delete(sessionKey);
  });
});
```

---

## 5. 에러 처리 및 로깅

### 🟠 5.1 민감한 정보 노출 (HIGH)

**위치:** `server/routes/api.js:26-30`

```javascript
res.download(pdfPath, `system-monitor-report-${sessionId}.pdf`, (err) => {
  if (err) {
    console.error('[PDF 다운로드] 오류:', err);
    // 전체 에러 객체가 로그에 노출
```

**문제점:**
- 에러 스택 트레이스에 파일 경로 포함
- 시스템 구조 정보 노출
- 프로덕션 환경에서 디버그 정보 노출

**권장사항:**
```javascript
// 프로덕션용 에러 핸들러
const isProd = process.env.NODE_ENV === 'production';

app.use((err, req, res, next) => {
  // 로그: 전체 에러
  console.error('[ERROR]', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    timestamp: new Date().toISOString()
  });

  // 클라이언트: 최소 정보만
  res.status(err.status || 500).json({
    error: isProd ? '서버 오류가 발생했습니다.' : err.message,
    ...(isProd ? {} : { stack: err.stack })
  });
});
```

---

### 🟡 5.2 불충분한 에러 처리 (MEDIUM)

**위치:** `server/services/monitor.js:224-227`

```javascript
} catch (error) {
  console.error('[모니터링] 측정 오류:', error);
  this.emit('error', error);
  // 측정 실패해도 계속 진행
}
```

**문제점:**
- 측정 실패해도 타이머는 계속 실행
- 연속 실패 시 처리 없음
- 부분 실패 데이터 처리 미흡

**권장사항:**
```javascript
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 5;

try {
  const measurement = await this.measureResources();
  consecutiveErrors = 0; // 성공 시 리셋
  // ...
} catch (error) {
  consecutiveErrors++;
  console.error(`[모니터링] 측정 오류 (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, error);

  if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
    this.emit('error', new Error('연속 측정 실패로 모니터링 중단'));
    this.stop();
    return;
  }
}
```

---

### 🟡 5.3 로깅 보안 (LOW)

**문제점:**
- 모든 로그가 콘솔에만 출력
- 로그 레벨 구분 없음
- 로그 파일 관리 없음
- 민감한 정보 필터링 없음

**권장사항:**
```javascript
// winston 같은 로깅 라이브러리 사용
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880,
      maxFiles: 5,
    })
  ]
});

// 민감한 정보 필터링
const sanitizeLog = (data) => {
  const sensitive = ['password', 'token', 'apiKey', 'secret'];
  const sanitized = { ...data };
  sensitive.forEach(key => {
    if (sanitized[key]) sanitized[key] = '***REDACTED***';
  });
  return sanitized;
};
```

---

## 6. 코드 품질 및 유지보수성

### 🟡 6.1 하드코딩된 값 (MEDIUM)

**문제점:**
```javascript
// server/index.js:24
const io = new Server(server);
// WebSocket 설정 하드코딩

// public/js/app.js:33
const MAX_DATA_POINTS = 60;
// 설정 파일로 분리 필요

// server/services/monitor.js:22
this.sessionId = `session-${Date.now()}`;
// UUID 사용 권장
```

**권장사항:**
```javascript
// config/default.js
module.exports = {
  server: {
    port: 3000,
    host: '0.0.0.0'
  },
  monitoring: {
    defaultDuration: 300,
    defaultInterval: 1,
    maxDuration: 3600,
    minInterval: 1,
    maxConcurrentSessions: 5
  },
  storage: {
    dataRetentionDays: 7,
    maxFileSize: 10485760, // 10MB
    reportsDir: './reports',
    dataDir: './data'
  },
  socketio: {
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e6
  }
};

// UUID 사용
const { v4: uuidv4 } = require('uuid');
this.sessionId = `session-${uuidv4()}`;
```

---

### 🟡 6.2 중복 코드 (LOW)

**위치:** `server/services/monitor.js:100-118`

```javascript
const [
  cpuLoad,
  cpuTemp,
  mem,
  fsSize,
  fsStats,
  networkStats,
  currentLoad,  // 중복: cpuLoad와 동일
  graphics,
] = await Promise.all([
  si.currentLoad(),
  si.cpuTemperature(),
  si.mem(),
  si.fsSize(),
  si.fsStats(),
  si.networkStats(),
  si.currentLoad(),  // 중복 호출!
  si.graphics(),
]);
```

**문제점:**
- `si.currentLoad()` 두 번 호출
- 불필요한 리소스 사용

---

### 🟡 6.3 타입 안정성 부족 (LOW)

**문제점:**
- JavaScript 사용으로 타입 체크 없음
- 런타임 에러 가능성

**권장사항:**
```typescript
// TypeScript 마이그레이션
interface MonitoringConfig {
  duration: number;
  interval: number;
  dataDir: string;
  reportsDir: string;
}

interface SystemInfo {
  os: OSInfo;
  cpu: CPUInfo;
  memory: MemoryInfo;
  gpu: GPUInfo[];
  disks: DiskInfo[];
}

class MonitorService extends EventEmitter {
  constructor(private config: MonitoringConfig) {
    super();
  }

  async getSystemInfo(): Promise<SystemInfo> {
    // 타입 안전성 보장
  }
}
```

---

## 7. 네트워크 보안

### 🔴 7.1 Rate Limiting 부재 (CRITICAL)

**문제점:**
- API 엔드포인트에 속도 제한 없음
- Socket.io 이벤트에 제한 없음
- 무차별 대입 공격 가능

**권장사항:**
```javascript
const rateLimit = require('express-rate-limit');

// API Rate Limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 100, // 최대 100 요청
  message: '너무 많은 요청입니다. 나중에 다시 시도하세요.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// 다운로드 Rate Limiting (더 엄격)
const downloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: '다운로드 제한 초과'
});
app.use('/api/download-pdf', downloadLimiter);

// Socket.io Rate Limiting
const socketLimiter = new Map();
socket.on('start-monitoring', async (config) => {
  const clientId = socket.handshake.address;
  const now = Date.now();
  const limit = socketLimiter.get(clientId) || { count: 0, resetTime: now };

  if (now > limit.resetTime) {
    limit.count = 0;
    limit.resetTime = now + 60000; // 1분
  }

  if (limit.count >= 5) {
    return socket.emit('error', { message: '요청 제한 초과' });
  }

  limit.count++;
  socketLimiter.set(clientId, limit);
  // ...
});
```

---

### 🟠 7.2 HTTPS 미사용 (HIGH)

**위치:** `server/index.js:127`

```javascript
server.listen(PORT, () => {
  console.log(`URL: http://localhost:${PORT}`);
  // HTTP만 지원, HTTPS 없음!
```

**문제점:**
- 평문 통신으로 데이터 노출
- 중간자 공격(MITM) 취약
- 민감한 시스템 정보 전송

**권장사항:**
```javascript
const https = require('https');
const fs = require('fs');

const options = {
  key: fs.readFileSync('certs/server-key.pem'),
  cert: fs.readFileSync('certs/server-cert.pem')
};

const server = https.createServer(options, app);

// 또는 리버스 프록시 사용 (nginx, caddy)
// nginx에서 SSL 처리, Node.js는 localhost:3000
```

---

### 🟡 7.3 헤더 보안 (MEDIUM)

**문제점:**
- 보안 헤더 미설정
- X-Powered-By 노출

**권장사항:**
```javascript
const helmet = require('helmet');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "cdn.socket.io"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "ws:", "wss:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// X-Powered-By 제거
app.disable('x-powered-by');
```

---

## 8. 권장사항 요약

### 즉시 수정 필요 (CRITICAL) 🔴

| 우선순위 | 취약점 | 조치 |
|---------|--------|------|
| 1 | Path Traversal | sessionId 검증 추가 |
| 2 | 인증 부재 | 기본 인증 또는 토큰 인증 구현 |
| 3 | DoS 취약점 | 입력 검증 및 Rate Limiting |
| 4 | 세션 데이터 무단 접근 | 권한 검증 추가 |
| 5 | 메모리 누수 | 리소스 정리 및 제한 |

### 빠른 시일 내 수정 (HIGH) 🟠

- CORS 설정
- HTTPS 적용
- 파일 관리 시스템
- 민감한 정보 노출 방지

### 권장 수정 (MEDIUM) 🟡

- 환경 변수 검증
- 동시 세션 관리
- 에러 처리 개선
- 하드코딩 제거

### 장기 개선 (LOW) 🟢

- TypeScript 마이그레이션
- 로깅 시스템 구축
- 코드 리팩토링
- 테스트 커버리지

---

## 체크리스트

### 배포 전 필수 체크리스트

```markdown
- [ ] sessionId 검증 추가
- [ ] 입력값 검증 (duration, interval)
- [ ] Rate Limiting 적용
- [ ] 인증 시스템 구현
- [ ] CORS 설정
- [ ] HTTPS 적용
- [ ] 보안 헤더 설정
- [ ] 에러 메시지 필터링
- [ ] 파일 정리 스케줄러
- [ ] 메모리 누수 방지
- [ ] 로깅 시스템
- [ ] 환경 변수 검증
- [ ] 의존성 업데이트 (npm audit)
```

### 보안 도구 실행

```bash
# 1. 의존성 취약점 스캔
npm audit
npm audit fix

# 2. 정적 분석
npm install -g eslint eslint-plugin-security
eslint . --ext .js

# 3. 비밀 정보 스캔
npm install -g trufflehog
trufflehog filesystem . --json

# 4. 보안 테스트
npm install -g snyk
snyk test

# 5. 동적 분석
# OWASP ZAP 또는 Burp Suite로 런타임 테스트
```

---

## 결론

이 애플리케이션은 **현재 상태로는 프로덕션 배포가 부적절**합니다.

### 심각도 통계
- 🔴 Critical: **5개** → 즉시 수정 필수
- 🟠 High: **5개** → 빠른 수정 권장
- 🟡 Medium: **8개** → 계획적 개선
- 🟢 Low/Info: **4개** → 장기 개선

### 핵심 보안 이슈
1. **인증/권한 부재** - 누구나 접근 가능
2. **Path Traversal** - 시스템 파일 노출
3. **DoS 취약점** - 서비스 중단 가능
4. **리소스 관리 부족** - 메모리/디스크 고갈

### 권장 배포 시나리오

**개발/테스트 환경:**
- 현재 상태 사용 가능
- 내부 네트워크만 접근
- 방화벽 보호

**프로덕션 환경:**
- 모든 Critical/High 이슈 수정 후
- 보안 테스트 완료 후
- 리버스 프록시 + HTTPS
- 모니터링 및 알림 설정

---

**리뷰 완료일:** 2025-11-06
**다음 리뷰 권장:** 수정 완료 후 또는 3개월 후

**참고 자료:**
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practices-security.html)
- [Socket.io Security](https://socket.io/docs/v4/security/)
