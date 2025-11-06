/**
 * Windows 시스템 모니터링 - 프론트엔드 애플리케이션
 * Socket.io를 통한 실시간 데이터 수신 및 Chart.js로 시각화
 */

// DOM 요소
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const downloadBtn = document.getElementById('downloadBtn');
const statusText = document.getElementById('statusText');
const elapsedTime = document.getElementById('elapsedTime');
const progress = document.getElementById('progress');
const progressBar = document.getElementById('progressBar');
const systemInfoSection = document.getElementById('systemInfoSection');
const realtimeSection = document.getElementById('realtimeSection');
const dataTableSection = document.getElementById('dataTableSection');
const pdfModal = document.getElementById('pdfModal');
const modalTitle = document.getElementById('modalTitle');
const modalMessage = document.getElementById('modalMessage');
const errorAlert = document.getElementById('errorAlert');
const errorMessage = document.getElementById('errorMessage');

// Socket.io 연결
const socket = io();

// 애플리케이션 상태
let isMonitoring = false;
let downloadUrl = null;
let measurements = [];
let charts = {};

// 최대 데이터 포인트 (차트에 표시할 최대 개수)
const MAX_DATA_POINTS = 60;

/**
 * 초기화
 */
function init() {
  console.log('애플리케이션 초기화 중...');

  // 차트 초기화
  initCharts();

  // 이벤트 리스너 등록
  startBtn.addEventListener('click', startMonitoring);
  stopBtn.addEventListener('click', stopMonitoring);
  downloadBtn.addEventListener('click', downloadPDF);

  // Socket.io 이벤트 리스너
  socket.on('connect', () => {
    console.log('서버에 연결되었습니다.');
    updateStatus('서버에 연결됨');
  });

  socket.on('disconnect', () => {
    console.log('서버와의 연결이 끊어졌습니다.');
    updateStatus('서버 연결 끊김', true);
  });

  socket.on('system-info', handleSystemInfo);
  socket.on('monitoring-data', handleMonitoringData);
  socket.on('monitoring-complete', handleMonitoringComplete);
  socket.on('pdf-ready', handlePDFReady);
  socket.on('error', handleError);
}

/**
 * 차트 초기화
 */
function initCharts() {
  const chartConfig = (label, color) => ({
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: label,
        data: [],
        borderColor: color,
        backgroundColor: color.replace('rgb', 'rgba').replace(')', ', 0.2)'),
        tension: 0.4,
        fill: true,
        pointRadius: 0,
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      animation: {
        duration: 0, // 실시간 업데이트를 위해 애니메이션 비활성화
      },
      scales: {
        x: {
          display: true,
          ticks: {
            maxTicksLimit: 10,
          },
        },
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return value.toFixed(1);
            },
          },
        },
      },
      plugins: {
        legend: {
          display: false,
        },
      },
    },
  });

  // CPU 차트
  charts.cpu = new Chart(
    document.getElementById('cpuChart'),
    chartConfig('CPU 사용률 (%)', 'rgb(75, 192, 192)')
  );

  // 메모리 차트
  charts.memory = new Chart(
    document.getElementById('memoryChart'),
    chartConfig('메모리 사용률 (%)', 'rgb(255, 99, 132)')
  );

  // 디스크 I/O 차트 (읽기/쓰기)
  charts.disk = new Chart(document.getElementById('diskChart'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: '읽기 (KB/s)',
          data: [],
          borderColor: 'rgb(54, 162, 235)',
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
          tension: 0.4,
          fill: false,
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: '쓰기 (KB/s)',
          data: [],
          borderColor: 'rgb(255, 159, 64)',
          backgroundColor: 'rgba(255, 159, 64, 0.2)',
          tension: 0.4,
          fill: false,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      animation: { duration: 0 },
      scales: {
        x: {
          display: true,
          ticks: { maxTicksLimit: 10 },
        },
        y: {
          beginAtZero: true,
        },
      },
    },
  });

  // 네트워크 차트 (수신/전송)
  charts.network = new Chart(document.getElementById('networkChart'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: '수신 (KB/s)',
          data: [],
          borderColor: 'rgb(153, 102, 255)',
          backgroundColor: 'rgba(153, 102, 255, 0.2)',
          tension: 0.4,
          fill: false,
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: '전송 (KB/s)',
          data: [],
          borderColor: 'rgb(255, 205, 86)',
          backgroundColor: 'rgba(255, 205, 86, 0.2)',
          tension: 0.4,
          fill: false,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      animation: { duration: 0 },
      scales: {
        x: {
          display: true,
          ticks: { maxTicksLimit: 10 },
        },
        y: {
          beginAtZero: true,
        },
      },
    },
  });
}

/**
 * 모니터링 시작
 */
function startMonitoring() {
  console.log('모니터링 시작 요청...');
  isMonitoring = true;
  measurements = [];

  // UI 업데이트
  startBtn.disabled = true;
  stopBtn.disabled = false;
  downloadBtn.disabled = true;
  updateStatus('모니터링 시작 중...');

  // 차트 초기화
  resetCharts();

  // 섹션 표시
  systemInfoSection.style.display = 'block';
  realtimeSection.style.display = 'block';
  dataTableSection.style.display = 'block';

  // 서버에 시작 요청
  socket.emit('start-monitoring');
}

/**
 * 모니터링 중지
 */
function stopMonitoring() {
  console.log('모니터링 중지 요청...');
  isMonitoring = false;

  startBtn.disabled = false;
  stopBtn.disabled = true;
  updateStatus('모니터링 중지됨');

  socket.emit('stop-monitoring');
}

/**
 * 시스템 정보 처리
 */
function handleSystemInfo(data) {
  console.log('시스템 정보 수신:', data);

  document.getElementById('osInfo').textContent =
    `${data.os.distro} ${data.os.release} (${data.os.arch})`;

  document.getElementById('cpuInfo').textContent =
    `${data.cpu.brand} (${data.cpu.cores} 코어)`;

  document.getElementById('memoryInfo').textContent =
    `${data.memory.totalGB} GB`;

  if (data.gpu && data.gpu.length > 0) {
    document.getElementById('gpuInfo').textContent =
      data.gpu.map(g => `${g.model}`).join(', ');
  } else {
    document.getElementById('gpuInfo').textContent = '정보 없음';
  }

  // 메모리 총량 저장 (카드에 표시용)
  window.memoryTotal = parseFloat(data.memory.totalGB);
}

/**
 * 모니터링 데이터 처리
 */
function handleMonitoringData(data) {
  console.log('모니터링 데이터 수신:', data);

  // 측정 데이터 저장
  measurements.push(data);

  // 상태 업데이트
  updateStatus('모니터링 중...');
  elapsedTime.textContent = `${data.totalElapsed}초 / ${data.totalDuration}초`;
  progress.textContent = `${data.progress}%`;
  progressBar.style.width = `${data.progress}%`;

  // 카드 값 업데이트
  updateCards(data);

  // 차트 업데이트
  updateCharts(data);

  // 테이블 업데이트
  updateTable(data);
}

/**
 * 카드 값 업데이트
 */
function updateCards(data) {
  // CPU
  document.getElementById('cpuValue').textContent = `${data.cpu.usage.toFixed(1)}%`;
  document.getElementById('cpuTemp').textContent =
    data.cpu.temperature ? `${data.cpu.temperature.toFixed(1)}°C` : 'N/A';

  // 메모리
  const memoryUsedGB = (data.memory.used / 1024 / 1024 / 1024).toFixed(2);
  const memoryTotalGB = (data.memory.total / 1024 / 1024 / 1024).toFixed(2);
  document.getElementById('memoryValue').textContent = `${data.memory.usagePercent.toFixed(1)}%`;
  document.getElementById('memoryUsed').textContent = memoryUsedGB;
  document.getElementById('memoryTotal').textContent = memoryTotalGB;

  // 디스크
  document.getElementById('diskValue').textContent = `${data.disk.usagePercent.toFixed(1)}%`;
  document.getElementById('diskIO').textContent =
    `R: ${data.disk.io.readKBps} KB/s | W: ${data.disk.io.writeKBps} KB/s`;

  // 네트워크
  const totalNetwork = parseFloat(data.network.rxKBps) + parseFloat(data.network.txKBps);
  document.getElementById('networkValue').textContent = `${totalNetwork.toFixed(1)} KB/s`;
  document.getElementById('networkRx').textContent = data.network.rxKBps;
  document.getElementById('networkTx').textContent = data.network.txKBps;
}

/**
 * 차트 업데이트
 */
function updateCharts(data) {
  const timeLabel = new Date(data.timestamp).toLocaleTimeString('ko-KR');

  // 데이터 포인트 제한 (최대 MAX_DATA_POINTS개)
  const shouldShift = charts.cpu.data.labels.length >= MAX_DATA_POINTS;

  // CPU 차트
  if (shouldShift) charts.cpu.data.labels.shift();
  charts.cpu.data.labels.push(timeLabel);
  if (shouldShift) charts.cpu.data.datasets[0].data.shift();
  charts.cpu.data.datasets[0].data.push(data.cpu.usage);
  charts.cpu.update('none');

  // 메모리 차트
  if (shouldShift) charts.memory.data.labels.shift();
  charts.memory.data.labels.push(timeLabel);
  if (shouldShift) charts.memory.data.datasets[0].data.shift();
  charts.memory.data.datasets[0].data.push(data.memory.usagePercent);
  charts.memory.update('none');

  // 디스크 I/O 차트
  if (shouldShift) charts.disk.data.labels.shift();
  charts.disk.data.labels.push(timeLabel);
  if (shouldShift) {
    charts.disk.data.datasets[0].data.shift();
    charts.disk.data.datasets[1].data.shift();
  }
  charts.disk.data.datasets[0].data.push(data.disk.io.readKBps);
  charts.disk.data.datasets[1].data.push(data.disk.io.writeKBps);
  charts.disk.update('none');

  // 네트워크 차트
  if (shouldShift) charts.network.data.labels.shift();
  charts.network.data.labels.push(timeLabel);
  if (shouldShift) {
    charts.network.data.datasets[0].data.shift();
    charts.network.data.datasets[1].data.shift();
  }
  charts.network.data.datasets[0].data.push(parseFloat(data.network.rxKBps));
  charts.network.data.datasets[1].data.push(parseFloat(data.network.txKBps));
  charts.network.update('none');
}

/**
 * 테이블 업데이트 (최근 10개)
 */
function updateTable(data) {
  const tbody = document.getElementById('dataTableBody');
  const row = tbody.insertRow(0); // 맨 위에 삽입

  const timeCell = row.insertCell(0);
  const cpuCell = row.insertCell(1);
  const memoryCell = row.insertCell(2);
  const diskCell = row.insertCell(3);
  const networkCell = row.insertCell(4);

  timeCell.textContent = new Date(data.timestamp).toLocaleTimeString('ko-KR');
  cpuCell.textContent = `${data.cpu.usage.toFixed(1)}%`;
  memoryCell.textContent = `${data.memory.usagePercent.toFixed(1)}%`;
  diskCell.textContent = `${data.disk.usagePercent.toFixed(1)}%`;
  networkCell.textContent = `↓${data.network.rxKBps} | ↑${data.network.txKBps}`;

  // 최대 10개 행만 유지
  while (tbody.rows.length > 10) {
    tbody.deleteRow(10);
  }
}

/**
 * 모니터링 완료 처리
 */
function handleMonitoringComplete(data) {
  console.log('모니터링 완료:', data);
  isMonitoring = false;

  startBtn.disabled = false;
  stopBtn.disabled = true;
  updateStatus('모니터링 완료');

  // PDF 생성 모달 표시
  modalTitle.textContent = '모니터링 완료';
  modalMessage.textContent = data.message;
  pdfModal.style.display = 'flex';
}

/**
 * PDF 준비 완료 처리
 */
function handlePDFReady(data) {
  console.log('PDF 준비 완료:', data);

  downloadUrl = data.downloadUrl;

  // 모달 업데이트
  modalMessage.textContent = data.message;

  // 스피너 숨기고 다운로드 버튼 활성화
  const spinner = pdfModal.querySelector('.spinner');
  if (spinner) spinner.style.display = 'none';

  // 모달 닫기
  setTimeout(() => {
    pdfModal.style.display = 'none';
  }, 1500);

  // 다운로드 버튼 활성화
  downloadBtn.disabled = false;
}

/**
 * PDF 다운로드
 */
function downloadPDF() {
  if (downloadUrl) {
    console.log('PDF 다운로드:', downloadUrl);
    window.location.href = downloadUrl;
  }
}

/**
 * 오류 처리
 */
function handleError(data) {
  console.error('오류 발생:', data);

  errorMessage.textContent = data.message;
  errorAlert.style.display = 'flex';

  // 3초 후 알림 숨기기
  setTimeout(() => {
    errorAlert.style.display = 'none';
  }, 5000);

  // UI 초기화
  if (isMonitoring) {
    isMonitoring = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    updateStatus('오류 발생', true);
  }
}

/**
 * 상태 업데이트
 */
function updateStatus(text, isError = false) {
  statusText.textContent = text;
  statusText.style.color = isError ? 'var(--danger-color)' : 'var(--primary-color)';
}

/**
 * 차트 초기화
 */
function resetCharts() {
  Object.values(charts).forEach(chart => {
    chart.data.labels = [];
    chart.data.datasets.forEach(dataset => {
      dataset.data = [];
    });
    chart.update('none');
  });

  // 테이블 초기화
  const tbody = document.getElementById('dataTableBody');
  tbody.innerHTML = '';
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', init);
