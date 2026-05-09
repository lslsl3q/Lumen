"""Design Token 主题系统 — 类型定义与校验注册表"""

import re
from typing import TypedDict, Optional


class ThemeInfo(TypedDict):
    id: str
    name: str
    is_builtin: bool


class TokenError(TypedDict):
    token: str
    value: str
    message: str


VALID_TOKENS: dict[str, tuple[str, str, str]] = {
    "primary":            ("color",    "", "主交互色"),
    "primaryDim":         ("color",    "", "深一级 accent"),
    "primaryDeep":        ("color",    "", "最深 accent"),
    "primarySubtle":      ("color",    "", "极淡 accent 背景"),
    "primaryForeground":  ("color",    "", "accent 色上文字"),
    "success":            ("color",    "", "成功状态色"),
    "successLight":       ("color",    "", "成功浅色"),
    "error":              ("color",    "", "错误状态色"),
    "errorLight":         ("color",    "", "错误浅色"),
    "warning":            ("color",    "", "警告状态色"),
    "surfaceDeep":        ("color",    "", "最深背景色"),
    "surfaceBase":        ("color",    "", "标准背景色"),
    "surface":            ("color",    "", "表面层背景色"),
    "surfaceElevated":    ("color",    "", "提升层背景色"),
    "surfaceRail":        ("color",    "", "ActivityBar 背景"),
    "surfacePanel":       ("color",    "", "侧栏面板背景"),
    "surfaceCanvas":      ("color",    "", "内容区域背景"),
    "textPrimary":        ("color",    "", "主文字色"),
    "textSecondary":      ("color",    "", "次要文字色"),
    "textMuted":          ("color",    "", "弱化文字色"),
    "textDim":            ("color",    "", "最弱文字色"),
    "borderDefault":      ("color",    "", "默认边框色"),
    "borderSubtle":       ("color",    "", "淡边框色"),
    "glowPrimary":        ("color",    "", "主发光效果色"),
    "glowSubtle":         ("color",    "", "微发光效果色"),
    "spacingTight":       ("length",   r"^\d+(\.\d+)?(px|rem|em|vh|vw|%)$", "紧凑间距"),
    "spacingNormal":      ("length",   r"^\d+(\.\d+)?(px|rem|em|vh|vw|%)$", "标准间距"),
    "spacingRelaxed":     ("length",   r"^\d+(\.\d+)?(px|rem|em|vh|vw|%)$", "舒适间距"),
    "spacingSpacious":    ("length",   r"^\d+(\.\d+)?(px|rem|em|vh|vw|%)$", "大间距"),
    "shadowSubtle":       ("shadow",   "", "微弱阴影"),
    "shadowCard":         ("shadow",   "", "标准卡片阴影"),
    "shadowModal":        ("shadow",   "", "弹窗阴影"),
    "shadowDeep":         ("shadow",   "", "深层阴影"),
    "radiusSm":           ("length",   r"^\d+(\.\d+)?(px|rem|em|%)$", "小圆角"),
    "radiusMd":           ("length",   r"^\d+(\.\d+)?(px|rem|em|%)$", "中圆角"),
    "radiusLg":           ("length",   r"^\d+(\.\d+)?(px|rem|em|%)$", "大圆角"),
    "radiusFull":         ("length",   r"^\d+(\.\d+)?(px|rem|em|%)$", "圆形"),
    "blurSubtle":         ("length",   r"^\d+(\.\d+)?(px|rem|em)$", "微模糊"),
    "blurOverlay":        ("length",   r"^\d+(\.\d+)?(px|rem|em)$", "遮罩模糊"),
    "durationInstant":    ("time",     r"^\d+(\.\d+)?(ms|s)$", "瞬时动画"),
    "durationFast":       ("time",     r"^\d+(\.\d+)?(ms|s)$", "快速动画"),
    "durationNormal":     ("time",     r"^\d+(\.\d+)?(ms|s)$", "标准动画"),
    "durationSlow":       ("time",     r"^\d+(\.\d+)?(ms|s)$", "慢速动画"),
    "easeDefault":        ("easing",   "", "标准缓动"),
    "easeSpring":         ("easing",   "", "弹性缓动"),
    "easeDecelerate":     ("easing",   "", "减速缓动"),
    "textXs":             ("fontSize", r"^\d+(\.\d+)?px(\/\d+(\.\d+)?)?$", "极小文字"),
    "textSm":             ("fontSize", r"^\d+(\.\d+)?px(\/\d+(\.\d+)?)?$", "小文字"),
    "textBase":           ("fontSize", r"^\d+(\.\d+)?px(\/\d+(\.\d+)?)?$", "正文"),
    "textLg":             ("fontSize", r"^\d+(\.\d+)?px(\/\d+(\.\d+)?)?$", "大正文"),
    "textXl":             ("fontSize", r"^\d+(\.\d+)?px(\/\d+(\.\d+)?)?$", "小标题"),
    "text2xl":            ("fontSize", r"^\d+(\.\d+)?px(\/\d+(\.\d+)?)?$", "标题"),
}

_COLOR_RE = re.compile(
    r"^(#([0-9a-fA-F]{3,8})\b|"
    r"rgb(a?\s*\([^)]+\))?|"
    r"hsl(a?\s*\([^)]+\))?|"
    r"transparent|currentColor|inherit)$",
    re.IGNORECASE,
)

_EASING_RE = re.compile(r"^(linear|cubic-bezier\([^)]+\))$", re.IGNORECASE)
_SHADOW_RE = re.compile(r"^(none|inset?.*\d+.*(?:px|rem|em|#|rgb|hsl))", re.IGNORECASE)


def validate_token(name: str, value: str) -> Optional[str]:
    if name not in VALID_TOKENS:
        return f"Unknown token: {name}"
    token_type, pattern, _ = VALID_TOKENS[name]
    stripped = value.strip()
    if token_type == "color":
        if not _COLOR_RE.match(stripped):
            return f"'{stripped}' is not a valid CSS color."
    elif token_type == "length":
        if not re.match(pattern, stripped):
            return f"'{stripped}' is not a valid CSS length."
    elif token_type == "shadow":
        if not _SHADOW_RE.match(stripped):
            return f"'{stripped}' is not a valid CSS shadow."
    elif token_type == "time":
        if not re.match(pattern, stripped):
            return f"'{stripped}' is not a valid CSS time."
    elif token_type == "easing":
        if not _EASING_RE.match(stripped):
            return f"'{stripped}' is not a valid CSS easing."
    elif token_type == "fontSize":
        if not re.match(pattern, stripped):
            return f"'{stripped}' is not a valid font-size."
    return None


def validate_tokens(tokens: dict[str, str]) -> tuple[dict[str, str], list[TokenError]]:
    valid: dict[str, str] = {}
    errors: list[TokenError] = []
    for name, value in tokens.items():
        err = validate_token(name, value)
        if err:
            errors.append({"token": name, "value": value, "message": err})
        else:
            valid[name] = value
    return valid, errors
