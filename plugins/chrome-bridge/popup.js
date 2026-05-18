/**
 * Lumen Chrome Bridge — Popup
 */

const dot = document.getElementById('dot');
const statusText = document.getElementById('statusText');
const wsUrlInput = document.getElementById('wsUrl');
const btnSave = document.getElementById('btnSave');
const btnReconnect = document.getElementById('btnReconnect');

// 查询状态
function refreshStatus() {
  chrome.runtime.sendMessage({ type: 'get_status' }, (resp) => {
    if (chrome.runtime.lastError) {
      statusText.textContent = '扩展未就绪';
      return;
    }
    if (resp.connected) {
      dot.className = 'dot on';
      statusText.textContent = '已连接';
    } else {
      dot.className = 'dot off';
      statusText.textContent = resp.reconnectAttempts > 0
        ? `断开 (重连 ${resp.reconnectAttempts} 次中)`
        : '未连接';
    }
    wsUrlInput.value = resp.url || 'ws://127.0.0.1:8888/ws';
  });
}

btnSave.addEventListener('click', () => {
  const url = wsUrlInput.value.trim();
  if (!url) return;
  chrome.runtime.sendMessage({ type: 'set_url', url });
});

btnReconnect.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'reconnect' }, () => {
    setTimeout(refreshStatus, 800);
  });
});

// 初始刷新
refreshStatus();

// 定时刷新状态
setInterval(refreshStatus, 3000);
