/**
 * Windows System Monitor - 서버 진입점
 * Express + Socket.io를 사용한 실시간 시스템 모니터링 서버
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs-extra');
require('dotenv').config();

const MonitorService = require('./services/monitor');
const apiRoutes = require('./routes/api');

// 환경 변수 설정
const PORT = process.env.PORT || 3000;
const MONITORING_DURATION = parseInt(process.env.MONITORING_DURATION) || 300; // 5분 (초)
const MONITORING_INTERVAL = parseInt(process.env.MONITORING_INTERVAL) || 1; // 1초

// Express 앱 및 HTTP 서버 생성
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 미들웨어 설정
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// API 라우트
app.use('/api', apiRoutes);

// 데이터 저장 디렉터리 확인
const dataDir = path.join(__dirname, '../data');
const reportsDir = path.join(__dirname, '../reports');
fs.ensureDirSync(dataDir);
fs.ensureDirSync(reportsDir);

// 모니터링 서비스 인스턴스
let monitorService = null;
let monitoringActive = false;

// Socket.io 연결 처리
io.on('connection', (socket) => {
  console.log(`[Socket.io] 클라이언트 연결됨: ${socket.id}`);

  // 클라이언트가 모니터링 시작 요청
  socket.on('start-monitoring', async (config = {}) => {
    if (monitoringActive) {
      socket.emit('error', { message: '이미 모니터링이 실행 중입니다.' });
      return;
    }

    const duration = config.duration || MONITORING_DURATION;
    const interval = config.interval || MONITORING_INTERVAL;

    console.log(`[모니터링] 시작 - 기간: ${duration}초, 간격: ${interval}초`);

    monitoringActive = true;
    monitorService = new MonitorService({
      duration,
      interval,
      dataDir,
      reportsDir,
    });

    // 시스템 정보 가져오기
    const systemInfo = await monitorService.getSystemInfo();
    socket.emit('system-info', systemInfo);

    // 모니터링 시작
    monitorService.start((data) => {
      // 실시간 데이터 전송
      io.emit('monitoring-data', data);
    });

    // 모니터링 완료 콜백
    monitorService.on('complete', async (sessionData) => {
      console.log('[모니터링] 완료됨');
      monitoringActive = false;

      // PDF 생성 시작
      io.emit('monitoring-complete', {
        message: 'PDF 리포트를 생성하는 중입니다...',
        sessionId: sessionData.sessionId,
      });

      try {
        const pdfPath = await monitorService.generatePDF();
        console.log(`[PDF] 생성 완료: ${pdfPath}`);

        io.emit('pdf-ready', {
          message: 'PDF 리포트가 생성되었습니다.',
          downloadUrl: `/api/download-pdf/${sessionData.sessionId}`,
          pdfFileName: path.basename(pdfPath),
        });
      } catch (error) {
        console.error('[PDF] 생성 오류:', error);
        io.emit('error', { message: 'PDF 생성 중 오류가 발생했습니다.' });
      }
    });

    // 오류 처리
    monitorService.on('error', (error) => {
      console.error('[모니터링] 오류:', error);
      io.emit('error', { message: error.message });
      monitoringActive = false;
    });
  });

  // 모니터링 중지 요청
  socket.on('stop-monitoring', () => {
    if (monitorService) {
      monitorService.stop();
      monitoringActive = false;
      console.log('[모니터링] 사용자 요청으로 중지됨');
    }
  });

  // 연결 해제
  socket.on('disconnect', () => {
    console.log(`[Socket.io] 클라이언트 연결 해제: ${socket.id}`);
  });
});

// 서버 시작
server.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('  Windows 시스템 리소스 모니터링 서버 시작됨');
  console.log('='.repeat(60));
  console.log(`  URL: http://localhost:${PORT}`);
  console.log(`  모니터링 기간: ${MONITORING_DURATION}초 (${MONITORING_DURATION / 60}분)`);
  console.log(`  측정 간격: ${MONITORING_INTERVAL}초`);
  console.log('='.repeat(60));
  console.log('  브라우저에서 위 URL로 접속하세요.');
  console.log('  종료하려면 Ctrl+C를 누르세요.');
  console.log('='.repeat(60));
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n서버를 종료합니다...');
  if (monitorService) {
    monitorService.stop();
  }
  server.close(() => {
    console.log('서버가 종료되었습니다.');
    process.exit(0);
  });
});
