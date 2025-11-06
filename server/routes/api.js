/**
 * API 라우트
 * PDF 다운로드 및 기타 API 엔드포인트
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// PDF 다운로드
router.get('/download-pdf/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const reportsDir = path.join(__dirname, '../../reports');
  const pdfPath = path.join(reportsDir, `${sessionId}.pdf`);

  // 파일 존재 확인
  if (!fs.existsSync(pdfPath)) {
    return res.status(404).json({
      error: 'PDF 파일을 찾을 수 없습니다.',
    });
  }

  // PDF 파일 다운로드
  res.download(pdfPath, `system-monitor-report-${sessionId}.pdf`, (err) => {
    if (err) {
      console.error('[PDF 다운로드] 오류:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'PDF 다운로드 중 오류가 발생했습니다.' });
      }
    }
  });
});

// 저장된 리포트 목록 조회
router.get('/reports', (req, res) => {
  const reportsDir = path.join(__dirname, '../../reports');

  fs.readdir(reportsDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: '리포트 목록을 가져오는 중 오류가 발생했습니다.' });
    }

    const pdfFiles = files
      .filter(file => file.endsWith('.pdf'))
      .map(file => {
        const stats = fs.statSync(path.join(reportsDir, file));
        return {
          filename: file,
          sessionId: file.replace('.pdf', ''),
          size: stats.size,
          createdAt: stats.birthtime,
          downloadUrl: `/api/download-pdf/${file.replace('.pdf', '')}`,
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt); // 최신순 정렬

    res.json({
      count: pdfFiles.length,
      reports: pdfFiles,
    });
  });
});

// 세션 데이터 조회 (JSON)
router.get('/session-data/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const dataDir = path.join(__dirname, '../../data');
  const dataPath = path.join(dataDir, `${sessionId}.json`);

  if (!fs.existsSync(dataPath)) {
    return res.status(404).json({
      error: '세션 데이터를 찾을 수 없습니다.',
    });
  }

  fs.readFile(dataPath, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: '세션 데이터를 읽는 중 오류가 발생했습니다.' });
    }

    try {
      const jsonData = JSON.parse(data);
      res.json(jsonData);
    } catch (parseErr) {
      res.status(500).json({ error: 'JSON 파싱 오류가 발생했습니다.' });
    }
  });
});

// 헬스 체크
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

module.exports = router;
