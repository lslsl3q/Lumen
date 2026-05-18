"""
Chrome Bridge Agent 工具

让 AI Agent 能够浏览和控制 Chrome 浏览器：
- 导航到 URL
- 截取页面截图
- 获取页面快照（a11y 树）
- 点击元素
- 输入文本
- 执行 JS 脚本
"""

from lumen.services.chrome_bridge import get_chrome_bridge


def execute_chrome_bridge(params: dict) -> dict:
    """执行 Chrome Bridge 命令

    支持的命令：
        navigate  — 导航到 URL
        snapshot  — 获取 a11y 页面快照
        screenshot — 截取可见区域
        click     — 点击元素
        type      — 输入文本
        evaluate  — 执行 JS
        scroll    — 滚动页面
        chain     — 串行执行多个命令

    Tool 格式：commands 模式
    """
    import asyncio

    bridge = get_chrome_bridge()
    command = params.get("command", "")

    async def _run():
        if command == "navigate":
            return await bridge.navigate_and_snapshot(params.get("url", ""))

        elif command == "snapshot":
            return await bridge.get_page_info()

        elif command == "screenshot":
            return await bridge.take_screenshot()

        elif command == "click":
            return await bridge.click_and_snapshot(
                target=params.get("target", ""),
                selector=params.get("selector", ""),
            )

        elif command == "type":
            return await bridge.type_and_snapshot(
                text=params.get("text", ""),
                target=params.get("target", ""),
                selector=params.get("selector", ""),
            )

        elif command == "evaluate":
            return await bridge.evaluate(params.get("text", ""))

        elif command == "scroll":
            return await bridge.execute("scroll", text=params.get("text", "down"))

        elif command == "get_html":
            return await bridge.execute(
                "get_html", selector=params.get("selector", "")
            )

        elif command == "get_text":
            return await bridge.execute(
                "get_text", selector=params.get("selector", "")
            )

        elif command == "chain":
            cmds = params.get("commands", [])
            if not cmds:
                raise ValueError("chain 命令需要 commands 参数（命令列表）")
            return await bridge.execute_chain(cmds)

        else:
            raise ValueError(
                f"未知命令: {command}。"
                f"支持: navigate, snapshot, screenshot, click, type, evaluate, scroll, get_html, get_text, chain"
            )

    # 在同步上下文中运行异步函数
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # 在事件循环中，创建新的 future
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, _run())
                return future.result(timeout=60)
        else:
            return loop.run_until_complete(_run())
    except RuntimeError:
        return asyncio.run(_run())
