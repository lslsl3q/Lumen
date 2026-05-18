/**
 * Lumen Chrome Bridge — Content Script
 *
 * 注入到每个页面，提供快照和操作能力。
 * 通过 window.__lumenXxx 暴露给 background.js 的 executeScript 调用。
 */

// ══════════════════════════════════════════
// Snapshot — a11y 树快照（仿 Chrome DevTools MCP）
// ══════════════════════════════════════════

window.__lumenTakeSnapshot = function (options = {}) {
  const verbose = options.verbose || false;
  const elements = [];
  let uid = 0;

  function collect(node, depth) {
    if (depth > 50) return; // 防止无限递归
    if (!node) return;

    const role = getRole(node);
    const name = getAccessibleName(node);

    // 跳过不可见和纯布局元素
    if (!verbose && !role && !name) {
      // 仍然遍历子元素
      for (const child of node.children) {
        collect(child, depth + 1);
      }
      return;
    }

    const id = ++uid;
    const rect = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
    const visible = rect ? (rect.width > 0 && rect.height > 0) : false;

    const el = {
      uid: id,
      tag: node.tagName?.toLowerCase() || undefined,
      role: role || undefined,
      name: name?.slice(0, 200) || undefined,
    };

    if (visible && rect) {
      el.pos = { x: Math.round(rect.x), y: Math.round(rect.y) };
      el.size = { w: Math.round(rect.width), h: Math.round(rect.height) };
    }

    if (!visible) el.hidden = true;

    elements.push(el);

    // 递归子元素
    for (const child of node.children) {
      collect(child, depth + 1);
    }
  }

  collect(document.body, 0);

  return {
    title: document.title,
    url: window.location.href,
    elements: elements.slice(0, verbose ? 5000 : 500),
    totalElements: elements.length,
    truncated: elements.length > (verbose ? 5000 : 500),
  };
};

function getRole(el) {
  const explicit = el.getAttribute('role');
  if (explicit) return explicit;

  const tag = el.tagName?.toLowerCase();
  const type = el.type?.toLowerCase();

  if (tag === 'button') return 'button';
  if (tag === 'a' && el.href) return 'link';
  if (tag === 'input') {
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'submit' || type === 'button') return 'button';
    return 'textbox';
  }
  if (tag === 'textarea') return 'textbox';
  if (tag === 'select') return 'combobox';
  if (tag === 'img') return 'img';
  if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') return 'heading';
  if (tag === 'nav') return 'navigation';
  if (tag === 'main') return 'main';
  if (tag === 'article') return 'article';
  if (tag === 'section') return 'region';
  if (tag === 'form') return 'form';
  if (tag === 'table') return 'table';

  if (el.hasAttribute && el.hasAttribute('contenteditable')) return 'textbox';

  return null;
}

function getAccessibleName(el) {
  const ariaLabel = el.getAttribute?.('aria-label');
  if (ariaLabel) return ariaLabel;

  const ariaLabelledBy = el.getAttribute?.('aria-labelledby');
  if (ariaLabelledBy) {
    const labelEl = document.getElementById(ariaLabelledBy);
    if (labelEl) return labelEl.textContent?.trim();
  }

  // 对于按钮和链接，取文本内容
  const tag = el.tagName?.toLowerCase();
  if (['button', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
    return el.textContent?.trim().slice(0, 200);
  }

  const placeholder = el.getAttribute?.('placeholder');
  if (placeholder) return placeholder;

  return null;
}

// ══════════════════════════════════════════
// 操作函数
// ══════════════════════════════════════════

window.__lumenClick = function (target, selector) {
  const el = selector
    ? document.querySelector(selector)
    : findElementByText(target);
  if (!el) return { error: `未找到元素: ${target || selector}` };
  el.click();
  el.focus?.();
  return { clicked: true, tag: el.tagName, text: (el.textContent || '').slice(0, 100) };
};

window.__lumenType = function (target, text, selector) {
  const el = selector
    ? document.querySelector(selector)
    : findElementByText(target) || document.activeElement;
  if (!el) return { error: `未找到输入元素: ${target || selector}` };

  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.getAttribute?.('contenteditable')) {
    el.focus();
    if (el.getAttribute?.('contenteditable')) {
      el.textContent = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return { typed: true, into: el.tagName };
  }
  return { error: '目标元素不支持输入' };
};

window.__lumenScroll = function (amount) {
  window.scrollBy({ top: amount || 500, behavior: 'smooth' });
  return { scrolled: amount || 500 };
};

// ══════════════════════════════════════════
// HTML / Text 抓取
// ══════════════════════════════════════════

window.__lumenGetHTML = function (selector) {
  const el = selector ? document.querySelector(selector) : document.documentElement;
  if (!el) return { error: `未找到元素: ${selector}` };
  return {
    html: el.outerHTML.slice(0, 50000),
    truncated: el.outerHTML.length > 50000,
    tag: el.tagName,
    url: window.location.href,
    title: document.title,
  };
};

window.__lumenGetText = function (selector) {
  const el = selector ? document.querySelector(selector) : document.body;
  if (!el) return { error: `未找到元素: ${selector}` };
  const text = el.innerText || el.textContent || '';
  return {
    text: text.slice(0, 20000),
    truncated: text.length > 20000,
    url: window.location.href,
    title: document.title,
  };
};

// ══════════════════════════════════════════
// 辅助
// ══════════════════════════════════════════

function findElementByText(text) {
  if (!text) return null;
  const all = document.querySelectorAll('button, a, input, [role="button"], [role="link"], [role="textbox"]');
  for (const el of all) {
    const content = (el.textContent || el.getAttribute('placeholder') || el.getAttribute('aria-label') || '').trim();
    if (content === text) return el;
  }
  for (const el of all) {
    const content = (el.textContent || el.getAttribute('placeholder') || el.getAttribute('aria-label') || '').trim();
    if (content.includes(text)) return el;
  }
  return null;
}
