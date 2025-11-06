/**
 * PDF 리포트 생성 서비스
 * PDFKit과 ChartJS-node-canvas를 사용하여 PDF 생성
 */

const PDFDocument = require('pdfkit');
const fs = require('fs-extra');
const path = require('path');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

class PDFGenerator {
  constructor(sessionData, reportsDir) {
    this.sessionData = sessionData;
    this.reportsDir = reportsDir;
    this.pdfPath = path.join(reportsDir, `${sessionData.sessionId}.pdf`);

    // 차트 생성기 설정
    this.chartJSNodeCanvas = new ChartJSNodeCanvas({
      width: 800,
      height: 400,
      backgroundColour: 'white',
    });
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
    await this.addHeader(doc);
    this.addSystemInfo(doc);
    this.addMonitoringInfo(doc);
    await this.addStatistics(doc);
    await this.addCharts(doc);
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
  async addHeader(doc) {
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

    // CPU 정보
    doc.font('Helvetica-Bold').text('CPU:', { continued: true });
    doc.font('Helvetica').text(` ${info.cpu.brand}`);
    doc.text(`  - 코어: ${info.cpu.physicalCores}개 (논리: ${info.cpu.cores}개)`);
    doc.text(`  - 기본 속도: ${info.cpu.speed} GHz (최대: ${info.cpu.speedMax} GHz)`);

    // 메모리 정보
    doc.font('Helvetica-Bold').text('메모리:', { continued: true });
    doc.font('Helvetica').text(` ${info.memory.totalGB} GB`);

    // GPU 정보
    if (info.gpu && info.gpu.length > 0) {
      doc.font('Helvetica-Bold').text('GPU:');
      info.gpu.forEach((gpu, idx) => {
        doc.font('Helvetica').text(`  ${idx + 1}. ${gpu.model} (${gpu.vendor})`);
        if (gpu.vram) {
          doc.text(`     VRAM: ${gpu.vram} MB`);
        }
      });
    }

    // 디스크 정보
    if (info.disks && info.disks.length > 0) {
      doc.font('Helvetica-Bold').text('디스크:');
      info.disks.forEach((disk, idx) => {
        doc.font('Helvetica').text(`  ${idx + 1}. ${disk.name || disk.type}`);
        doc.text(`     용량: ${disk.sizeGB} GB`);
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

    doc.moveDown(1);
  }

  /**
   * 통계 추가
   */
  async addStatistics(doc) {
    const measurements = this.sessionData.measurements;

    if (measurements.length === 0) {
      doc.text('측정 데이터가 없습니다.');
      return;
    }

    doc.fontSize(16).font('Helvetica-Bold').text('3. 리소스 사용률 통계');
    doc.moveDown(0.5);

    const calculateStats = (values) => {
      const filtered = values.filter(v => v !== null && !isNaN(v));
      if (filtered.length === 0) return { min: 0, max: 0, avg: 0 };

      const sorted = [...filtered].sort((a, b) => a - b);
      return {
        min: Math.min(...filtered).toFixed(2),
        max: Math.max(...filtered).toFixed(2),
        avg: (filtered.reduce((a, b) => a + b, 0) / filtered.length).toFixed(2),
      };
    };

    // CPU 통계
    const cpuStats = calculateStats(measurements.map(m => m.cpu.usage));
    doc.fontSize(12).font('Helvetica-Bold').text('CPU 사용률 (%)');
    doc.fontSize(10).font('Helvetica');
    doc.text(`  최소: ${cpuStats.min}% | 최대: ${cpuStats.max}% | 평균: ${cpuStats.avg}%`);
    doc.moveDown(0.5);

    // CPU 온도 통계
    const tempValues = measurements.map(m => m.cpu.temperature).filter(t => t !== null);
    if (tempValues.length > 0) {
      const tempStats = calculateStats(tempValues);
      doc.fontSize(12).font('Helvetica-Bold').text('CPU 온도 (°C)');
      doc.fontSize(10).font('Helvetica');
      doc.text(`  최소: ${tempStats.min}°C | 최대: ${tempStats.max}°C | 평균: ${tempStats.avg}°C`);
      doc.moveDown(0.5);
    }

    // 메모리 통계
    const memStats = calculateStats(measurements.map(m => m.memory.usagePercent));
    doc.fontSize(12).font('Helvetica-Bold').text('메모리 사용률 (%)');
    doc.fontSize(10).font('Helvetica');
    doc.text(`  최소: ${memStats.min}% | 최대: ${memStats.max}% | 평균: ${memStats.avg}%`);
    doc.moveDown(0.5);

    // 디스크 I/O 통계
    const diskReadStats = calculateStats(measurements.map(m => m.disk.io.readKBps));
    const diskWriteStats = calculateStats(measurements.map(m => m.disk.io.writeKBps));
    doc.fontSize(12).font('Helvetica-Bold').text('디스크 I/O (KB/s)');
    doc.fontSize(10).font('Helvetica');
    doc.text(`  읽기 - 최소: ${diskReadStats.min} | 최대: ${diskReadStats.max} | 평균: ${diskReadStats.avg}`);
    doc.text(`  쓰기 - 최소: ${diskWriteStats.min} | 최대: ${diskWriteStats.max} | 평균: ${diskWriteStats.avg}`);
    doc.moveDown(0.5);

    // 네트워크 통계
    const netRxStats = calculateStats(measurements.map(m => m.network.rxKBps));
    const netTxStats = calculateStats(measurements.map(m => m.network.txKBps));
    doc.fontSize(12).font('Helvetica-Bold').text('네트워크 트래픽 (KB/s)');
    doc.fontSize(10).font('Helvetica');
    doc.text(`  수신 - 최소: ${netRxStats.min} | 최대: ${netRxStats.max} | 평균: ${netRxStats.avg}`);
    doc.text(`  전송 - 최소: ${netTxStats.min} | 최대: ${netTxStats.max} | 평균: ${netTxStats.avg}`);

    doc.moveDown(1);
  }

  /**
   * 차트 추가
   */
  async addCharts(doc) {
    doc.fontSize(16).font('Helvetica-Bold').text('4. 리소스 사용 추이 그래프');
    doc.moveDown(0.5);

    const measurements = this.sessionData.measurements;
    const labels = measurements.map(m => {
      const date = new Date(m.timestamp);
      return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
    });

    // 샘플링 (데이터가 너무 많으면 차트가 복잡해지므로)
    const maxDataPoints = 60;
    const step = Math.ceil(measurements.length / maxDataPoints);
    const sampledLabels = labels.filter((_, idx) => idx % step === 0);

    // CPU 사용률 차트
    await this.addLineChart(doc, {
      title: 'CPU 사용률 (%)',
      labels: sampledLabels,
      data: measurements.filter((_, idx) => idx % step === 0).map(m => m.cpu.usage),
      color: 'rgb(75, 192, 192)',
    });

    doc.addPage();

    // 메모리 사용률 차트
    await this.addLineChart(doc, {
      title: '메모리 사용률 (%)',
      labels: sampledLabels,
      data: measurements.filter((_, idx) => idx % step === 0).map(m => m.memory.usagePercent),
      color: 'rgb(255, 99, 132)',
    });

    // 디스크 I/O 차트
    await this.addMultiLineChart(doc, {
      title: '디스크 I/O (KB/s)',
      labels: sampledLabels,
      datasets: [
        {
          label: '읽기',
          data: measurements.filter((_, idx) => idx % step === 0).map(m => m.disk.io.readKBps),
          borderColor: 'rgb(54, 162, 235)',
        },
        {
          label: '쓰기',
          data: measurements.filter((_, idx) => idx % step === 0).map(m => m.disk.io.writeKBps),
          borderColor: 'rgb(255, 159, 64)',
        },
      ],
    });

    doc.addPage();

    // 네트워크 트래픽 차트
    await this.addMultiLineChart(doc, {
      title: '네트워크 트래픽 (KB/s)',
      labels: sampledLabels,
      datasets: [
        {
          label: '수신',
          data: measurements.filter((_, idx) => idx % step === 0).map(m => m.network.rxKBps),
          borderColor: 'rgb(153, 102, 255)',
        },
        {
          label: '전송',
          data: measurements.filter((_, idx) => idx % step === 0).map(m => m.network.txKBps),
          borderColor: 'rgb(255, 205, 86)',
        },
      ],
    });
  }

  /**
   * 단일 라인 차트 추가
   */
  async addLineChart(doc, config) {
    const configuration = {
      type: 'line',
      data: {
        labels: config.labels,
        datasets: [
          {
            label: config.title,
            data: config.data,
            borderColor: config.color,
            backgroundColor: config.color.replace('rgb', 'rgba').replace(')', ', 0.2)'),
            tension: 0.1,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: config.title,
            font: { size: 16 },
          },
          legend: {
            display: false,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
          },
        },
      },
    };

    const imageBuffer = await this.chartJSNodeCanvas.renderToBuffer(configuration);
    doc.image(imageBuffer, {
      fit: [500, 300],
      align: 'center',
    });

    doc.moveDown(1);
  }

  /**
   * 다중 라인 차트 추가
   */
  async addMultiLineChart(doc, config) {
    const configuration = {
      type: 'line',
      data: {
        labels: config.labels,
        datasets: config.datasets.map(ds => ({
          label: ds.label,
          data: ds.data,
          borderColor: ds.borderColor,
          backgroundColor: ds.borderColor.replace('rgb', 'rgba').replace(')', ', 0.2)'),
          tension: 0.1,
          fill: false,
        })),
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: config.title,
            font: { size: 16 },
          },
          legend: {
            display: true,
            position: 'top',
          },
        },
        scales: {
          y: {
            beginAtZero: true,
          },
        },
      },
    };

    const imageBuffer = await this.chartJSNodeCanvas.renderToBuffer(configuration);
    doc.image(imageBuffer, {
      fit: [500, 300],
      align: 'center',
    });

    doc.moveDown(1);
  }

  /**
   * 푸터 추가
   */
  addFooter(doc) {
    const pageCount = doc.bufferedPageRange().count;

    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);

      doc.fontSize(8).text(
        `페이지 ${i + 1} / ${pageCount}`,
        50,
        doc.page.height - 50,
        { align: 'center' }
      );
    }
  }
}

module.exports = PDFGenerator;
