const runButton = document.getElementById('run-button');

const resetButton = document.getElementById('reset-button');

const summaryContainer = document.getElementById('summary');

const logsContainer = document.getElementById('logs');

const statusPill = document.getElementById('status-pill');

const MAX_LOG_ENTRIES = 400;

const formatter = new Intl.NumberFormat('pt-BR', {

  maximumFractionDigits: 2,

});

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {

  dateStyle: 'short',

  timeStyle: 'medium',

});

const formatTimestamp = (value) => {

  if (!value) {

    return '-';

  }

  const date = typeof value === 'string' ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {

    return '-';

  }

  return dateFormatter.format(date);

};

const formatDuration = (ms) => {

  if (ms == null) {

    return '-';

  }

  if (ms < 1000) {

    return `${ms.toFixed(0)} ms`;

  }

  const seconds = ms / 1000;

  if (seconds < 60) {

    return `${seconds.toFixed(2)} s`;

  }

  const minutes = Math.floor(seconds / 60);

  const remainingSeconds = seconds % 60;

  return `${minutes} min ${remainingSeconds.toFixed(2)} s`;

};

const setStatus = (status) => {

  const statuses = {

    IDLE: { text: 'Aguardando execução', className: 'status-idle' },

    RUNNING: { text: 'Processando...', className: 'status-running' },

    COMPLETED: { text: 'Processo concluído', className: 'status-completed' },

    FAILED: { text: 'Processo com falha', className: 'status-failed' },

  };

  const entry = statuses[status] ?? statuses.IDLE;

  statusPill.textContent = entry.text;

  statusPill.className = `status-pill ${entry.className}`;

};

const renderSummary = (summary) => {

  if (!summary) {

    summaryContainer.className = 'empty-state';

    summaryContainer.textContent = 'Execute o processamento para visualizar os resultados.';

    setStatus('IDLE');

    return;

  }

  setStatus(summary.status);

  const generation = summary.generation;

  const vip = summary.processing.vip;

  const normal = summary.processing.normal;

  summaryContainer.className = 'summary-grid';

  summaryContainer.innerHTML = `

    <div class="card">

      <h3>Geração de Pedidos</h3>

      <div class="metric"><span>Total:</span><span>${formatter.format(generation.totalOrders)}</span></div>

      <div class="metric"><span>VIP:</span><span>${formatter.format(generation.vipOrders)}</span></div>

      <div class="metric"><span>Normais:</span><span>${formatter.format(generation.normalOrders)}</span></div>

      <div class="metric"><span>Batch Size:</span><span>${formatter.format(generation.batchSize)}</span></div>

      <div class="metric"><span>Inicio:</span><span>${formatTimestamp(generation.startedAt)}</span></div>

      <div class="metric"><span>Fim:</span><span>${formatTimestamp(generation.completedAt)}</span></div>

      <div class="metric"><span>Duração:</span><span>${formatDuration(generation.durationMs)}</span></div>

    </div>

    <div class="card">

      <h3>Processamento VIP</h3>

      <div class="metric"><span>Processados:</span><span>${formatter.format(vip.processedCount)}</span></div>

      <div class="metric"><span>Inicio:</span><span>${formatTimestamp(vip.startedAt)}</span></div>

      <div class="metric"><span>Fim:</span><span>${formatTimestamp(vip.completedAt)}</span></div>

      <div class="metric"><span>Duração:</span><span>${formatDuration(vip.durationMs)}</span></div>

    </div>

    <div class="card">

      <h3>Processamento Normal</h3>

      <div class="metric"><span>Processados:</span><span>${formatter.format(normal.processedCount)}</span></div>

      <div class="metric"><span>Inicio:</span><span>${formatTimestamp(normal.startedAt)}</span></div>

      <div class="metric"><span>Fim:</span><span>${formatTimestamp(normal.completedAt)}</span></div>

      <div class="metric"><span>Duração:</span><span>${formatDuration(normal.durationMs)}</span></div>

    </div>

    <div class="card">

      <h3>Tempo Total</h3>

      <div class="metric"><span>Processamento:</span><span>${formatDuration(summary.processing.totalDurationMs)}</span></div>

      <div class="metric"><span>Execução completa:</span><span>${formatDuration(summary.totalDurationMs)}</span></div>

      <div class="metric"><span>Status atual:</span><span>${summary.status}</span></div>

      <div class="metric"><span>ID da execução:</span><span>${summary.runId}</span></div>

    </div>

  `;

};

const appendLog = (entry) => {

  const element = document.createElement('div');

  element.classList.add('log-entry');

  element.innerHTML = `

    <small class="timestamp">${formatTimestamp(entry.timestamp)}</small>

    <span class="level-${entry.level}">${entry.level.toUpperCase()}</span>

    <span>${entry.message}</span>

  `;

  if (entry.context && Object.keys(entry.context).length > 0) {

    const context = document.createElement('pre');

    context.classList.add('log-context');

    context.textContent = JSON.stringify(entry.context, null, 2);

    element.appendChild(context);

  }

  logsContainer.prepend(element);

  while (logsContainer.childNodes.length > MAX_LOG_ENTRIES) {

    logsContainer.removeChild(logsContainer.lastChild);

  }

};

const fetchSummary = async () => {

  try {

    const response = await fetch('/pedidos');

    if (response.status === 204) {

      renderSummary(null);

      return;

    }

    if (!response.ok) {

      throw new Error('Erro ao obter resumo');

    }

    const data = await response.json();

    renderSummary(data);

  } catch (error) {

    console.error(error);

  }

};

const toggleControls = (disabled) => {

  runButton.disabled = disabled;

  resetButton.disabled = disabled;

};

const executePipeline = async () => {

  toggleControls(true);

  setStatus('RUNNING');

  try {

    const response = await fetch('/run', { method: 'POST' });

    if (!response.ok) {

      const { message } = await response.json().catch(() => ({ message: 'Falha ao iniciar processamento' }));

      alert(message);

      setStatus('FAILED');

      return;

    }

    const { runId } = await response.json();

    appendLog({

      timestamp: new Date().toISOString(),

      level: 'info',

      message: `Processamento iniciado. Execução ${runId}`,

    });

  } catch (error) {

    console.error(error);

    alert('Não foi possível iniciar o processamento. Verifique o backend.');

    setStatus('FAILED');

  } finally {

    toggleControls(false);

  }

};

const resetPipeline = async () => {

  if (!confirm('Deseja realmente limpar os dados e reiniciar?')) {

    return;

  }

  toggleControls(true);

  try {

    const response = await fetch('/reset', { method: 'POST' });

    if (!response.ok) {

      const { message } = await response.json().catch(() => ({ message: 'Falha ao resetar' }));

      alert(message);

      return;

    }

    logsContainer.innerHTML = '';

    renderSummary(null);

    appendLog({

      timestamp: new Date().toISOString(),

      level: 'info',

      message: 'Ambiente resetado com sucesso.',

    });

  } catch (error) {

    console.error(error);

    alert('Não foi possível resetar.');

  } finally {

    toggleControls(false);

  }

};

const bootstrapLogs = () => {

  let eventSource = new EventSource('/api/logs/stream');

  eventSource.onmessage = (event) => {

    try {

      const data = JSON.parse(event.data);

      appendLog(data);

      if (data.level === 'error') {

        setStatus('FAILED');

        void fetchSummary();

      }

      if (typeof data.message === 'string' && data.message.includes('Execução concluída')) {

        setStatus('COMPLETED');

        void fetchSummary();

      }

    } catch (error) {

      console.error('Erro ao ler log SSE', error);

    }

  };

  eventSource.onerror = () => {

    eventSource.close();

    setTimeout(() => {

      eventSource = bootstrapLogs();

    }, 3000);

  };

  return eventSource;

};

const init = () => {

  runButton.addEventListener('click', () => void executePipeline());

  resetButton.addEventListener('click', () => void resetPipeline());

  void fetchSummary();

  bootstrapLogs();

  setInterval(fetchSummary, 15000);

};

init();




