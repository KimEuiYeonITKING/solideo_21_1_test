/**
 * PDF 리포트 생성 서비스 (간소화 버전)
 * PDFKit을 사용하여 통계 데이터가 포함된 PDF 생성
 */

const PDFDocument = require('pdfkit');
const fs = require('fs-extra');
const path = require('path');

class PDFGenerator {
  constructor(sessionData, reportsDir) {
    this.sessionData = sessionData;
    this.reportsDir = reportsDir;
    this.pdfPath = path.join(reportsDir, `${sessionData.sessionId}.pdf`);
  }

  /**
   * PDF 생성
   */
  async generate() {
    console.log('[PDF] 생성 시작...');

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    });

    const stream = fs.createWriteStream(this.pdfPath);
    doc.pipe(stream);

    // PDF 내용 작성
    this.addHeader(doc);
    this.addSystemInfo(doc);
    this.addMonitoringInfo(doc);
    this.addStatistics(doc);
    this.addDetailedStats(doc);
    this.addDataSummary(doc);
    this.addFooter(doc);

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        console.log('[PDF] 생성 완료:', this.pdfPath);
        resolve(this.pdfPath);
      });
      stream.on('error', reject);
    });
  }

  /**
   * 헤더 추가
   */
  addHeader(doc) {
    doc
      .fontSize(24)
      .font('Helvetica-Bold')
      .text('시스템 모니터링 리포트', { align: 'center' });

    doc.moveDown(0.5);

    doc
      .fontSize(12)
      .font('Helvetica')
      .text(`생성 날짜: ${new Date().toLocaleString('ko-KR')}`, { align: 'center' });

    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(1);
  }

  /**
   * 시스템 정보 추가
   */
  addSystemInfo(doc) {
    const info = this.sessionData.systemInfo;

    doc.fontSize(16).font('Helvetica-Bold').text('1. 시스템 정보');
    doc.moveDown(0.5);

    doc.fontSize(10).font('Helvetica');

    // OS 정보
    doc.font('Helvetica-Bold').text('운영 체제:', { continued: true });
    doc.font('Helvetica').text(` ${info.os.distro} ${info.os.release} (${info.os.arch})`);
    doc.text(`  호스트명: ${info.os.hostname}`);

    doc.moveDown(0.3);

    // CPU 정보
    doc.font('Helvetica-Bold').text('CPU:', { continued: true });
    doc.font('Helvetica').text(` ${info.cpu.brand}`);
    doc.text(`  - 제조사: ${info.cpu.manufacturer}`);
    doc.text(`  - 코어: ${info.cpu.physicalCores}개 (논리: ${info.cpu.cores}개)`);
    doc.text(`  - 기본 속도: ${info.cpu.speed} GHz (최대: ${info.cpu.speedMax} GHz)`);

    doc.moveDown(0.3);

    // 메모리 정보
    doc.font('Helvetica-Bold').text('메모리:', { continued: true });
    doc.font('Helvetica').text(` ${info.memory.totalGB} GB`);

    doc.moveDown(0.3);

    // GPU 정보
    if (info.gpu && info.gpu.length > 0) {
      doc.font('Helvetica-Bold').text('GPU:');
      info.gpu.forEach((gpu, idx) => {
        doc.font('Helvetica').text(`  ${idx + 1}. ${gpu.model} (${gpu.vendor})`);
        if (gpu.vram) {
          doc.text(`     VRAM: ${gpu.vram} MB`);
        }
      });
    } else {
      doc.font('Helvetica-Bold').text('GPU:', { continued: true });
      doc.font('Helvetica').text(' 정보 없음');
    }

    doc.moveDown(0.3);

    // 디스크 정보
    if (info.disks && info.disks.length > 0) {
      doc.font('Helvetica-Bold').text('디스크:');
      info.disks.forEach((disk, idx) => {
        doc.font('Helvetica').text(`  ${idx + 1}. ${disk.name || disk.type}`);
        doc.text(`     용량: ${disk.sizeGB} GB (${disk.type})`);
      });
    }

    doc.moveDown(1);
  }

  /**
   * 모니터링 정보 추가
   */
  addMonitoringInfo(doc) {
    const { startTime, endTime, measurements } = this.sessionData;

    doc.fontSize(16).font('Helvetica-Bold').text('2. 모니터링 정보');
    doc.moveDown(0.5);

    doc.fontSize(10).font('Helvetica');

    doc.font('Helvetica-Bold').text('시작 시각:', { continued: true });
    doc.font('Helvetica').text(` ${new Date(startTime).toLocaleString('ko-KR')}`);

    doc.font('Helvetica-Bold').text('종료 시각:', { continued: true });
    doc.font('Helvetica').text(` ${new Date(endTime).toLocaleString('ko-KR')}`);

    const duration = (new Date(endTime) - new Date(startTime)) / 1000;
    doc.font('Helvetica-Bold').text('모니터링 시간:', { continued: true });
    doc.font('Helvetica').text(` ${Math.floor(duration / 60)}분 ${Math.floor(duration % 60)}초`);

    doc.font('Helvetica-Bold').text('측정 횟수:', { continued: true });
    doc.font('Helvetica').text(` ${measurements.length}회`);

    doc.font('Helvetica-Bold').text('측정 간격:', { continued: true });
    doc.font('Helvetica').text(` 약 ${(duration / measurements.length).toFixed(1)}초`);

    doc.moveDown(1);
  }

  /**
   * 통계 추가
   */
  addStatistics(doc) {
    const measurements = this.sessionData.measurements;

    if (measurements.length === 0) {
      doc.text('측정 데이터가 없습니다.');
      return;
    }

    doc.fontSize(16).font('Helvetica-Bold').text('3. 리소스 사용률 통계 요약');
    doc.moveDown(0.5);

    const calculateStats = (values) => {
      const filtered = values.filter(v => v !== null && !isNaN(v));
      if (filtered.length === 0) return { min: 0, max: 0, avg: 0, median: 0 };

      const sorted = [...filtered].sort((a, b) => a - b);
      return {
        min: Math.min(...filtered),
        max: Math.max(...filtered),
        avg: filtered.reduce((a, b) => a + b, 0) / filtered.length,
        median: sorted[Math.floor(sorted.length / 2)],
      };
    };

    // CPU 통계
    const cpuStats = calculateStats(measurements.map(m => m.cpu.usage));
    doc.fontSize(12).font('Helvetica-Bold').text('CPU 사용률 (%)');
    doc.fontSize(10).font('Helvetica');
    doc.text(`  최소: ${cpuStats.min.toFixed(2)}%`);
    doc.text(`  최대: ${cpuStats.max.toFixed(2)}%`);
    doc.text(`  평균: ${cpuStats.avg.toFixed(2)}%`);
    doc.text(`  중간값: ${cpuStats.median.toFixed(2)}%`);
    doc.moveDown(0.5);

    // CPU 온도 통계
    const tempValues = measurements.map(m => m.cpu.temperature).filter(t => t !== null);
    if (tempValues.length > 0) {
      const tempStats = calculateStats(tempValues);
      doc.fontSize(12).font('Helvetica-Bold').text('CPU 온도 (°C)');
      doc.fontSize(10).font('Helvetica');
      doc.text(`  최소: ${tempStats.min.toFixed(2)}°C`);
      doc.text(`  최대: ${tempStats.max.toFixed(2)}°C`);
      doc.text(`  평균: ${tempStats.avg.toFixed(2)}°C`);
      doc.text(`  중간값: ${tempStats.median.toFixed(2)}°C`);
      doc.moveDown(0.5);
    }

    // 메모리 통계
    const memStats = calculateStats(measurements.map(m => m.memory.usagePercent));
    const memUsedStats = calculateStats(measurements.map(m => m.memory.used / 1024 / 1024 / 1024));
    doc.fontSize(12).font('Helvetica-Bold').text('메모리 사용률 (%)');
    doc.fontSize(10).font('Helvetica');
    doc.text(`  최소: ${memStats.min.toFixed(2)}%`);
    doc.text(`  최대: ${memStats.max.toFixed(2)}%`);
    doc.text(`  평균: ${memStats.avg.toFixed(2)}%`);
    doc.text(`  중간값: ${memStats.median.toFixed(2)}%`);
    doc.moveDown(0.3);
    doc.text(`  평균 사용량: ${memUsedStats.avg.toFixed(2)} GB`);
    doc.moveDown(0.5);

    // 디스크 통계
    const diskStats = calculateStats(measurements.map(m => m.disk.usagePercent));
    const diskReadStats = calculateStats(measurements.map(m => m.disk.io.readKBps));
    const diskWriteStats = calculateStats(measurements.map(m => m.disk.io.writeKBps));
    doc.fontSize(12).font('Helvetica-Bold').text('디스크 사용률 (%)');
    doc.fontSize(10).font('Helvetica');
    doc.text(`  평균: ${diskStats.avg.toFixed(2)}%`);
    doc.moveDown(0.3);
    doc.fontSize(12).font('Helvetica-Bold').text('디스크 I/O (KB/s)');
    doc.fontSize(10).font('Helvetica');
    doc.text(`  읽기 - 최소: ${diskReadStats.min.toFixed(2)} | 최대: ${diskReadStats.max.toFixed(2)} | 평균: ${diskReadStats.avg.toFixed(2)}`);
    doc.text(`  쓰기 - 최소: ${diskWriteStats.min.toFixed(2)} | 최대: ${diskWriteStats.max.toFixed(2)} | 평균: ${diskWriteStats.avg.toFixed(2)}`);
    doc.moveDown(0.5);

    // 네트워크 통계
    const netRxStats = calculateStats(measurements.map(m => m.network.rxKBps));
    const netTxStats = calculateStats(measurements.map(m => m.network.txKBps));
    doc.fontSize(12).font('Helvetica-Bold').text('네트워크 트래픽 (KB/s)');
    doc.fontSize(10).font('Helvetica');
    doc.text(`  수신 - 최소: ${netRxStats.min.toFixed(2)} | 최대: ${netRxStats.max.toFixed(2)} | 평균: ${netRxStats.avg.toFixed(2)}`);
    doc.text(`  전송 - 최소: ${netTxStats.min.toFixed(2)} | 최대: ${netTxStats.max.toFixed(2)} | 평균: ${netTxStats.avg.toFixed(2)}`);

    doc.moveDown(1);
  }

  /**
   * 상세 통계 추가
   */
  addDetailedStats(doc) {
    doc.addPage();
    doc.fontSize(16).font('Helvetica-Bold').text('4. 상세 통계 분석');
    doc.moveDown(0.5);

    const measurements = this.sessionData.measurements;
    if (measurements.length === 0) return;

    doc.fontSize(10).font('Helvetica');

    // 피크 사용 시점 찾기
    const peakCpuIdx = measurements.reduce((maxIdx, curr, idx, arr) =>
      curr.cpu.usage > arr[maxIdx].cpu.usage ? idx : maxIdx, 0);
    const peakMemIdx = measurements.reduce((maxIdx, curr, idx, arr) =>
      curr.memory.usagePercent > arr[maxIdx].memory.usagePercent ? idx : maxIdx, 0);

    doc.font('Helvetica-Bold').text('피크 사용 시점:');
    doc.font('Helvetica');
    doc.text(`  CPU 최대 사용 시각: ${new Date(measurements[peakCpuIdx].timestamp).toLocaleTimeString('ko-KR')}`);
    doc.text(`    사용률: ${measurements[peakCpuIdx].cpu.usage.toFixed(2)}%`);
    doc.moveDown(0.3);
    doc.text(`  메모리 최대 사용 시각: ${new Date(measurements[peakMemIdx].timestamp).toLocaleTimeString('ko-KR')}`);
    doc.text(`    사용률: ${measurements[peakMemIdx].memory.usagePercent.toFixed(2)}%`);
    doc.text(`    사용량: ${(measurements[peakMemIdx].memory.used / 1024 / 1024 / 1024).toFixed(2)} GB`);

    doc.moveDown(1);

    // GPU 통계 (있는 경우)
    const gpuMeasurements = measurements.filter(m => m.gpu && m.gpu.utilization !== null);
    if (gpuMeasurements.length > 0) {
      doc.font('Helvetica-Bold').text('GPU 통계:');
      doc.font('Helvetica');
      const gpuUtils = gpuMeasurements.map(m => m.gpu.utilization);
      const avgGpu = gpuUtils.reduce((a, b) => a + b, 0) / gpuUtils.length;
      const maxGpu = Math.max(...gpuUtils);
      doc.text(`  평균 사용률: ${avgGpu.toFixed(2)}%`);
      doc.text(`  최대 사용률: ${maxGpu.toFixed(2)}%`);

      const gpuTemps = gpuMeasurements.map(m => m.gpu.temperature).filter(t => t !== null);
      if (gpuTemps.length > 0) {
        const avgTemp = gpuTemps.reduce((a, b) => a + b, 0) / gpuTemps.length;
        const maxTemp = Math.max(...gpuTemps);
        doc.text(`  평균 온도: ${avgTemp.toFixed(2)}°C`);
        doc.text(`  최대 온도: ${maxTemp.toFixed(2)}°C`);
      }
      doc.moveDown(1);
    }
  }

  /**
   * 데이터 샘플 추가
   */
  addDataSummary(doc) {
    const measurements = this.sessionData.measurements;
    if (measurements.length === 0) return;

    doc.fontSize(16).font('Helvetica-Bold').text('5. 측정 데이터 샘플 (처음 10개)');
    doc.moveDown(0.5);

    doc.fontSize(8).font('Courier');

    // 테이블 헤더
    const header = 'Time'.padEnd(12) + 'CPU%'.padEnd(8) + 'Mem%'.padEnd(8) + 'Disk%'.padEnd(8) + 'Net↓'.padEnd(10) + 'Net↑'.padEnd(10);
    doc.text(header);
    doc.text('-'.repeat(header.length));

    // 최대 10개 샘플
    const samples = measurements.slice(0, Math.min(10, measurements.length));
    samples.forEach(m => {
      const time = new Date(m.timestamp).toLocaleTimeString('ko-KR');
      const row = time.padEnd(12) +
                  m.cpu.usage.toFixed(1).padEnd(8) +
                  m.memory.usagePercent.toFixed(1).padEnd(8) +
                  m.disk.usagePercent.toFixed(1).padEnd(8) +
                  m.network.rxKBps.toString().padEnd(10) +
                  m.network.txKBps.toString().padEnd(10);
      doc.text(row);
    });

    if (measurements.length > 10) {
      doc.moveDown(0.5);
      doc.fontSize(8).font('Helvetica');
      doc.text(`... 외 ${measurements.length - 10}개 데이터 포인트`);
    }

    doc.moveDown(1);
    doc.fontSize(10).font('Helvetica');
    doc.text(`전체 데이터는 세션 ID "${this.sessionData.sessionId}"로 저장되었습니다.`);
  }

  /**
   * 푸터 추가
   */
  addFooter(doc) {
    const pageCount = doc.bufferedPageRange().count;

    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);

      // 페이지 번호
      doc.fontSize(8).text(
        `페이지 ${i + 1} / ${pageCount}`,
        50,
        doc.page.height - 50,
        { align: 'center' }
      );

      // 세션 ID (하단 왼쪽)
      doc.fontSize(7).text(
        `세션: ${this.sessionData.sessionId}`,
        50,
        doc.page.height - 30,
        { align: 'left' }
      );
    }
  }
}

module.exports = PDFGenerator;
