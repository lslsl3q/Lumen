/**
 * Lumen Chrome Bridge — Service Worker
 *
 * 职责：
 * 1. 与 Lumen 后端维持 WebSocket 长连接
 * 2. 接收 Lumen 发来的命令，在当前标签页执行
 * 3. 返回执行结果
 */

// ── 配置 ──
let wsUrl = 'ws://127.0.0.1:8888/ws';
let ws = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT = 50;

// ── 连接管理 ──

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  console.log('[LumenCB] 连接中:', wsUrl);
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[LumenCB] ✅ 已连接');
    reconnectAttempts = 0;
    // 标识自己是 Chrome Bridge 客户端
    ws.send(JSON.stringify({
      type: 'chrome_bridge_connect',
      client_id: 'chrome-ext-' + Date.now()
    }));
    updateIcon(true);
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleMessage(msg);
    } catch (e) {
      console.error('[LumenCB] 消息解析失败:', e);
    }
  };

  ws.onclose = () => {
    console.log('[LumenCB] 连接断开');
    updateIcon(false);
    scheduleReconnect();
  };

  ws.onerror = (e) => {
    console.error('[LumenCB] 连接错误');
    // onclose 会紧随其后，onclose 里做重连
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectAttempts++;
  const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 30000);
  console.log(`[LumenCB] ${delay / 1000}s 后重连 (第 ${reconnectAttempts} 次)`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (reconnectAttempts < MAX_RECONNECT) {
      connect();
    }
  }, delay);
}

function updateIcon(connected) {
  const text = connected ? 'ON' : 'OFF';
  const color = connected ? '#22c55e' : '#ef4444';
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

// ── 命令处理 ──

async function handleMessage(msg) {
  if (msg.type !== 'chrome_bridge_command') return;

  const { request_id, command, url, target, text, selector } = msg.data || msg;
  console.log(`[LumenCB] 收到命令: ${command}`, msg.data);

  try {
    const result = await executeCommand(command, { url, target, text, selector });
    sendResult(request_id, 'ok', result);
  } catch (e) {
    console.error(`[LumenCB] 命令失败: ${command}`, e);
    sendResult(request_id, 'error', { error: e.message });
  }
}

async function executeCommand(command, params) {
  const tab = await getActiveTab();

  switch (command) {
    case 'navigate':
      return navigate(params.url);

    case 'screenshot':
      return takeScreenshot();

    case 'snapshot':
      return takeSnapshot(tab);

    case 'click':
      return clickElement(tab, params.target, params.selector);

    case 'type':
      return typeText(tab, params.target, params.text, params.selector);

    case 'evaluate':
      return evaluateScript(tab, params.text);

    case 'scroll':
      return scrollPage(tab, params.text);

    case 'get_html':
      return getHTML(tab, params.selector);

    case 'get_text':
      return getText(tab, params.selector);

    default:
      throw new Error(`未知命令: ${command}`);
  }
}

// ── 命令实现 ──

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('无法获取当前标签页');
  return tab;
}

async function navigate(url) {
  if (!url) throw new Error('缺少 url 参数');
  const tab = await chrome.tabs.update({ url });
  // 等待页面加载完成
  await waitForPageLoad(tab.id);
  const newTab = await getActiveTab();
  const snapshot = await takeSnapshot(newTab);
  return {
    message: `已导航到: ${url}`,
    url: newTab.url,
    title: newTab.title,
    snapshot,
  };
}

async function waitForPageLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 500); // 额外等 500ms 让动态内容加载
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    // 超时保护
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 15000);
  });
}

async function takeScreenshot() {
  const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
  return {
    message: '截图完成',
    screenshot: dataUrl,
  };
}

async function takeSnapshot(tab) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // content.js 提供的全局函数
        if (window.__lumenTakeSnapshot) {
          return window.__lumenTakeSnapshot();
        }
        // fallback: 简单版本
        return {
          title: document.title,
          url: window.location.href,
          bodyText: document.body?.innerText?.slice(0, 5000) || '',
        };
      },
    });
    return results[0]?.result || null;
  } catch (e) {
    // 某些页面无法注入（chrome://, extension pages）
    return {
      title: tab.title,
      url: tab.url,
      error: '此页面无法注入 content script',
    };
  }
}

async function clickElement(tab, target, selector) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (t, sel) => {
        if (window.__lumenClick) {
          return window.__lumenClick(t, sel);
        }
        // fallback: 简单文本匹配
        const el = sel
          ? document.querySelector(sel)
          : findElementByText(t);
        if (!el) return { error: `未找到元素: ${t || sel}` };
        el.click();
        return { clicked: true, tag: el.tagName, text: (el.textContent || '').slice(0, 100) };
      },
      args: [target, selector],
    });
    // 等待页面可能的变化
    await new Promise(r => setTimeout(r, 800));
    const snapshot = await takeSnapshot(tab);
    return { message: `已点击: ${target || selector}`, snapshot, clickResult: results[0]?.result };
  } catch (e) {
    throw new Error(`点击失败: ${e.message}`);
  }
}

async function typeText(tab, target, text, selector) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (t, txt, sel) => {
        if (window.__lumenType) {
          return window.__lumenType(t, txt, sel);
        }
        const el = sel
          ? document.querySelector(sel)
          : findElementByText(t) || document.activeElement;
        if (!el) return { error: `未找到输入元素: ${t || sel}` };
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          el.focus();
          el.value = txt;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { typed: true, into: el.tagName };
        }
        return { error: '目标元素不是输入框' };
      },
      args: [target, text, selector],
    });
    await new Promise(r => setTimeout(r, 800));
    const snapshot = await takeSnapshot(tab);
    return { message: `已输入: ${text?.slice(0, 50)}`, snapshot, typeResult: results[0]?.result };
  } catch (e) {
    throw new Error(`输入失败: ${e.message}`);
  }
}

async function evaluateScript(tab, scriptText) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (code) => {
        try {
          const fn = new Function(`return (${code})`)();
          const result = typeof fn === 'function' ? fn() : fn;
          return { result: JSON.parse(JSON.stringify(result ?? null)) };
        } catch (e) {
          return { error: e.message };
        }
      },
      args: [scriptText],
    });
    return { message: '脚本已执行', evaluateResult: results[0]?.result };
  } catch (e) {
    throw new Error(`脚本执行失败: ${e.message}`);
  }
}

async function scrollPage(tab, direction) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (dir) => {
        const amount = dir === 'down' ? 500 : -500;
        window.scrollBy({ top: amount, behavior: 'smooth' });
      },
      args: [direction || 'down'],
    });
    await new Promise(r => setTimeout(r, 500));
    const snapshot = await takeSnapshot(tab);
    return { message: `已滚动: ${direction || 'down'}`, snapshot };
  } catch (e) {
    throw new Error(`滚动失败: ${e.message}`);
  }
}

async function getHTML(tab, selector) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (sel) => {
        if (window.__lumenGetHTML) return window.__lumenGetHTML(sel);
        const el = sel ? document.querySelector(sel) : document.documentElement;
        return { html: el?.outerHTML?.slice(0, 50000) || '', tag: el?.tagName, url: window.location.href, title: document.title };
      },
      args: [selector],
    });
    return { message: 'HTML 已获取', htmlResult: results[0]?.result };
  } catch (e) {
    throw new Error(`获取 HTML 失败: ${e.message}`);
  }
}

async function getText(tab, selector) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (sel) => {
        if (window.__lumenGetText) return window.__lumenGetText(sel);
        const el = sel ? document.querySelector(sel) : document.body;
        const text = (el?.innerText || el?.textContent || '').slice(0, 20000);
        return { text, url: window.location.href, title: document.title };
      },
      args: [selector],
    });
    return { message: '文本已提取', textResult: results[0]?.result };
  } catch (e) {
    throw new Error(`获取文本失败: ${e.message}`);
  }
}

// ── 辅助函数 ──

function findElementByText(text) {
  if (!text) return null;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const el = walker.currentNode;
    if (el.textContent?.trim() === text) return el;
  }
  // 部分匹配
  const all = document.querySelectorAll('button, a, input, [role="button"], [role="link"]');
  for (const el of all) {
    if (el.textContent?.trim().includes(text)) return el;
  }
  return null;
}

function sendResult(requestId, status, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'chrome_bridge_result',
      request_id: requestId,
      status,
      data,
    }));
  }
}

// ── 消息监听（来自 popup）──

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'get_status') {
    sendResponse({
      connected: ws && ws.readyState === WebSocket.OPEN,
      url: wsUrl,
      reconnectAttempts,
    });
  } else if (msg.type === 'set_url') {
    wsUrl = msg.url;
    chrome.storage.local.set({ wsUrl });
    // 断开重连
    if (ws) ws.close();
    connect();
    sendResponse({ ok: true });
  } else if (msg.type === 'reconnect') {
    if (ws) ws.close();
    reconnectAttempts = 0;
    connect();
    sendResponse({ ok: true });
  }
  return true; // 保持通道打开以异步回复
});

// ── 启动 ──

chrome.storage.local.get('wsUrl', (data) => {
  if (data.wsUrl) wsUrl = data.wsUrl;
  connect();
});

// 保持 service worker 活跃
chrome.alarms?.create('keepalive', { periodInMinutes: 1 });
