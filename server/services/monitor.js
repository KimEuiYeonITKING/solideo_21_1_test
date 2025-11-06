/**
 * 시스템 모니터링 서비스
 * systeminformation 라이브러리를 사용하여 Windows 시스템 리소스 수집
 */

const si = require('systeminformation');
const fs = require('fs-extra');
const path = require('path');
const EventEmitter = require('events');
const PDFGenerator = require('./pdfGenerator');

class MonitorService extends EventEmitter {
  constructor(config) {
    super();
    this.config = {
      duration: config.duration || 300, // 기본 5분
      interval: config.interval || 1, // 기본 1초
      dataDir: config.dataDir,
      reportsDir: config.reportsDir,
    };

    this.sessionId = `session-${Date.now()}`;
    this.sessionData = {
      sessionId: this.sessionId,
      startTime: null,
      endTime: null,
      systemInfo: {},
      measurements: [],
    };

    this.intervalId = null;
    this.timeoutId = null;
    this.elapsedSeconds = 0;
    this.isRunning = false;

    // 네트워크 통계 추적용
    this.lastNetworkStats = null;
  }

  /**
   * 시스템 기본 정보 가져오기
   */
  async getSystemInfo() {
    try {
      const [cpu, mem, osInfo, graphics, diskLayout] = await Promise.all([
        si.cpu(),
        si.mem(),
        si.osInfo(),
        si.graphics(),
        si.diskLayout(),
      ]);

      const systemInfo = {
        os: {
          platform: osInfo.platform,
          distro: osInfo.distro,
          release: osInfo.release,
          arch: osInfo.arch,
          hostname: osInfo.hostname,
        },
        cpu: {
          manufacturer: cpu.manufacturer,
          brand: cpu.brand,
          cores: cpu.cores,
          physicalCores: cpu.physicalCores,
          speed: cpu.speed,
          speedMax: cpu.speedMax,
        },
        memory: {
          total: mem.total,
          totalGB: (mem.total / 1024 / 1024 / 1024).toFixed(2),
        },
        gpu: graphics.controllers.map(gpu => ({
          model: gpu.model,
          vendor: gpu.vendor,
          vram: gpu.vram,
          vramDynamic: gpu.vramDynamic,
        })),
        disks: diskLayout.map(disk => ({
          name: disk.name,
          type: disk.type,
          size: disk.size,
          sizeGB: (disk.size / 1024 / 1024 / 1024).toFixed(2),
        })),
      };

      this.sessionData.systemInfo = systemInfo;
      return systemInfo;
    } catch (error) {
      console.error('[시스템 정보] 오류:', error);
      throw error;
    }
  }

  /**
   * 실시간 시스템 리소스 측정
   */
  async measureResources() {
    try {
      const [
        cpuLoad,
        cpuTemp,
        mem,
        fsSize,
        fsStats,
        networkStats,
        currentLoad,
        graphics,
      ] = await Promise.all([
        si.currentLoad(),
        si.cpuTemperature(),
        si.mem(),
        si.fsSize(),
        si.fsStats(),
        si.networkStats(),
        si.currentLoad(),
        si.graphics(),
      ]);

      // 네트워크 속도 계산 (KB/s)
      let networkSpeed = {
        rx: 0,
        tx: 0,
      };

      if (this.lastNetworkStats && networkStats.length > 0) {
        const current = networkStats[0];
        const last = this.lastNetworkStats;

        const timeDiff = this.config.interval; // 초 단위
        networkSpeed.rx = ((current.rx_bytes - last.rx_bytes) / timeDiff / 1024).toFixed(2);
        networkSpeed.tx = ((current.tx_bytes - last.tx_bytes) / timeDiff / 1024).toFixed(2);
      }

      this.lastNetworkStats = networkStats.length > 0 ? networkStats[0] : null;

      // 디스크 I/O 속도
      const diskIO = {
        readPerSec: fsStats.rx_sec || 0,
        writePerSec: fsStats.wx_sec || 0,
      };

      // GPU 정보
      const gpuData = graphics.controllers.length > 0 ? {
        utilization: graphics.controllers[0].utilizationGpu || null,
        temperature: graphics.controllers[0].temperatureGpu || null,
        memoryUsed: graphics.controllers[0].memoryUsed || null,
        memoryTotal: graphics.controllers[0].memoryTotal || null,
      } : null;

      const measurement = {
        timestamp: new Date().toISOString(),
        elapsed: this.elapsedSeconds,
        cpu: {
          usage: parseFloat(cpuLoad.currentLoad.toFixed(2)),
          temperature: cpuTemp.main || null,
          cores: cpuLoad.cpus.map(core => parseFloat(core.load.toFixed(2))),
        },
        memory: {
          total: mem.total,
          used: mem.used,
          free: mem.free,
          usagePercent: parseFloat(((mem.used / mem.total) * 100).toFixed(2)),
        },
        disk: {
          total: fsSize.reduce((sum, fs) => sum + fs.size, 0),
          used: fsSize.reduce((sum, fs) => sum + fs.used, 0),
          usagePercent: parseFloat(
            fsSize.length > 0
              ? ((fsSize.reduce((sum, fs) => sum + fs.used, 0) /
                  fsSize.reduce((sum, fs) => sum + fs.size, 0)) * 100).toFixed(2)
              : 0
          ),
          io: {
            readKBps: parseFloat((diskIO.readPerSec / 1024).toFixed(2)),
            writeKBps: parseFloat((diskIO.writePerSec / 1024).toFixed(2)),
          },
        },
        network: {
          rxKBps: parseFloat(networkSpeed.rx),
          txKBps: parseFloat(networkSpeed.tx),
        },
        gpu: gpuData,
      };

      return measurement;
    } catch (error) {
      console.error('[리소스 측정] 오류:', error);
      throw error;
    }
  }

  /**
   * 모니터링 시작
   */
  start(callback) {
    if (this.isRunning) {
      throw new Error('모니터링이 이미 실행 중입니다.');
    }

    this.isRunning = true;
    this.sessionData.startTime = new Date().toISOString();
    this.elapsedSeconds = 0;

    console.log(`[모니터링] 세션 시작: ${this.sessionId}`);

    // 정기적으로 리소스 측정
    this.intervalId = setInterval(async () => {
      try {
        const measurement = await this.measureResources();
        this.sessionData.measurements.push(measurement);

        // 콜백으로 실시간 데이터 전송
        if (callback) {
          callback({
            ...measurement,
            totalElapsed: this.elapsedSeconds,
            totalDuration: this.config.duration,
            progress: ((this.elapsedSeconds / this.config.duration) * 100).toFixed(2),
          });
        }

        this.elapsedSeconds++;
      } catch (error) {
        console.error('[모니터링] 측정 오류:', error);
        this.emit('error', error);
      }
    }, this.config.interval * 1000);

    // 지정된 기간 후 자동 종료
    this.timeoutId = setTimeout(() => {
      this.stop();
    }, this.config.duration * 1000);
  }

  /**
   * 모니터링 중지
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.sessionData.endTime = new Date().toISOString();

    // 타이머 정리
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    console.log(`[모니터링] 세션 종료: ${this.sessionId}`);
    console.log(`[데이터] 총 ${this.sessionData.measurements.length}개 측정값 수집됨`);

    // 데이터 저장
    await this.saveData();

    // 완료 이벤트 발생
    this.emit('complete', this.sessionData);
  }

  /**
   * 수집된 데이터를 JSON 파일로 저장
   */
  async saveData() {
    const dataPath = path.join(this.config.dataDir, `${this.sessionId}.json`);

    try {
      await fs.writeJson(dataPath, this.sessionData, { spaces: 2 });
      console.log(`[데이터] 저장 완료: ${dataPath}`);
    } catch (error) {
      console.error('[데이터] 저장 오류:', error);
      throw error;
    }
  }

  /**
   * PDF 리포트 생성
   */
  async generatePDF() {
    const pdfGenerator = new PDFGenerator(this.sessionData, this.config.reportsDir);
    const pdfPath = await pdfGenerator.generate();
    return pdfPath;
  }

  /**
   * 통계 계산
   */
  getStatistics() {
    const measurements = this.sessionData.measurements;

    if (measurements.length === 0) {
      return null;
    }

    const calculateStats = (values) => {
      const sorted = values.sort((a, b) => a - b);
      return {
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        median: sorted[Math.floor(sorted.length / 2)],
      };
    };

    return {
      cpu: {
        usage: calculateStats(measurements.map(m => m.cpu.usage)),
        temperature: calculateStats(
          measurements.map(m => m.cpu.temperature).filter(t => t !== null)
        ),
      },
      memory: {
        usagePercent: calculateStats(measurements.map(m => m.memory.usagePercent)),
        usedGB: calculateStats(measurements.map(m => m.memory.used / 1024 / 1024 / 1024)),
      },
      disk: {
        usagePercent: calculateStats(measurements.map(m => m.disk.usagePercent)),
        readKBps: calculateStats(measurements.map(m => m.disk.io.readKBps)),
        writeKBps: calculateStats(measurements.map(m => m.disk.io.writeKBps)),
      },
      network: {
        rxKBps: calculateStats(measurements.map(m => m.network.rxKBps)),
        txKBps: calculateStats(measurements.map(m => m.network.txKBps)),
      },
    };
  }
}

module.exports = MonitorService;
