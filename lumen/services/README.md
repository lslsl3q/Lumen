# Lumen 服务层

## jieba 中文分词集成

### 为什么用 jieba

Lumen 的跨会话记忆系统需要从消息中提取关键词，然后拿关键词去数据库搜索历史消息。
之前的 bigram（两两切词）对中文效果差，jieba 是最成熟的中文分词库，精准且零延迟。

### 安装

```bash
uv pip install jieba
```

> 约 10MB，纯 Python，无编译依赖。

### 用法：三层能力

#### 第一层 — 关键词提取（替换 bigram）

用 TF-IDF 算法自动从消息中提取最重要的关键词：

```python
import jieba.analyse

keywords = jieba.analyse.extract_tags("小明去了北京的故宫博物院参观", topK=8)
# → ["北京", "故宫", "博物院", "参观", "小明"]
```

配合词性过滤，只保留名词、动词等有意义的词：

```python
keywords = jieba.analyse.extract_tags(
    text,
    topK=8,
    allowPOS=('n', 'nr', 'ns', 'nt', 'nz', 'v', 'vn', 'eng')  # 名词/人名/地名/机构/动词
)
```

#### 第二层 — 自定义词典

角色名、世界书关键词、用户常用术语加入词典，防止被错误切分：

```python
import jieba

# 运行时动态加词（角色名、地名等）
jieba.add_word("御天敌", freq=100, tag="nr")   # nr = 人名
jieba.add_word("幽冥教", freq=100, tag="ns")   # ns = 地名

# 加载词典文件（批量）
jieba.load_userdict("lumen/data/user_dict.txt")
```

词典文件格式（每行一个词）：

```
御天敌 100 nr
幽冥教 100 ns
灵气复苏 50 n
```

格式：`词语 词频(可选) 词性(可选)`，用空格或制表符分隔。

#### 第三层 — TextRank 关键词（备选）

TextRank 不依赖词频统计，而是通过词与词的共现关系提取关键词。
适合发现长文本的主题词，不依赖训练语料。

```python
keywords = jieba.analyse.textrank(text, topK=5, allowPOS=('n', 'v'))
```

### 词性标签速查

| 标签 | 含义 | 提取时要不要 |
|------|------|-------------|
| n | 普通名词 | 要 |
| nr | 人名 | 要 |
| ns | 地名 | 要 |
| nt | 机构名 | 要 |
| nz | 其他专有名词 | 要 |
| v | 动词 | 要 |
| vn | 名动词 | 要 |
| eng | 英文 | 要 |
| a / ad | 形容词 | 看需求 |
| d | 副词 | 不要 |
| p | 介词 | 不要 |
| u | 助词（的、了） | 不要 |
| m | 数词 | 不要 |

### Lumen 中的集成点

```
memory.py
  └── _extract_keywords(text)
        ├── jieba.analyse.extract_tags(text, topK=8, allowPOS=...)
        └── 返回关键词列表 → 用于 history.search_messages() 的 LIKE 搜索

  └── reload_user_dict()         （启动时 + 角色/世界书变更时调用）
        ├── 从角色名加载
        ├── 从世界书关键词加载
        └── 从 data/user_dict.txt 加载
```

### 自定义词典的数据来源

| 来源 | 何时加载 | 示例 |
|------|---------|------|
| 角色名 | 切换角色时 | "李白"、"诸葛亮" |
| 世界书关键词 | 创建/更新条目时 | "幽冥教"、"灵气" |
| 用户词典文件 | 启动时 | `data/user_dict.txt` |
| 运行时动态添加 | AI 对话中发现新词 | `add_word("新术语")` |

## jieba 完整功能清单

> 以下功能不全用在 Lumen 里，但记录下来方便以后扩展。

### 分词

| API | 说明 | 示例 |
|-----|------|------|
| `jieba.cut(text)` | 精确模式（默认） | "我/来到/北京/清华大学" |
| `jieba.cut(text, cut_all=True)` | 全模式（所有可能切法） | "我/来到/北京/清华/清华大学/华大/大学" |
| `jieba.cut_for_search(text)` | 搜索引擎模式（更细粒度） | 适合搜索索引构建 |
| `jieba.tokenize(text)` | 返回词 + 起止位置 | `("清华", 2, 4)` |

### 关键词提取

| API | 说明 | 算法原理 |
|-----|------|---------|
| `jieba.analyse.extract_tags(text, topK, withWeight, allowPOS)` | TF-IDF 关键词 | 统计词频 × 逆文档频率，词越稀有越重要 |
| `jieba.analyse.textrank(text, topK, withWeight, allowPOS)` | TextRank 关键词 | 词共现关系建图，PageRank 排序，不依赖语料 |
| `jieba.analyse.set_idf_path(path)` | 自定义 IDF 语料 | 换行业语料后关键词提取会更贴合领域 |

### 词性标注

```python
import jieba.posseg as pseg

for word in pseg.cut("我爱北京天安门"):
    print(f"{word.word} → {word.flag}")
# 我 → r（代词）
# 爱 → v（动词）
# 北京 → ns（地名）
# 天安门 → ns（地名）
```

### 词典管理

| API | 说明 |
|-----|------|
| `jieba.load_userdict(path)` | 加载自定义词典文件 |
| `jieba.add_word(word, freq, tag)` | 动态加词 |
| `jieba.del_word(word)` | 动态删词 |
| `jieba.suggest_freq(segment, tune=True)` | 调节词频（控制分词粒度） |
| `jieba.set_dictionary(path)` | 替换整个主词典 |

词典文件格式：`词语 词频(可选) 词性(可选)`，每行一条，空格或 Tab 分隔。

### 并行加速

```python
jieba.enable_parallel(4)  # 开 4 个进程并行分词
```

适合一次性处理大量文本（如启动时批量建索引）。单条消息处理用不到。

### 其他

| 功能 | 说明 |
|------|------|
| `jieba.cut(text, HMM=True)` | HMM 模型识别未登录词（默认开启） |
| `jieba.enable_paddle()` | PaddlePaddle 深度学习模式（更准但需额外安装） |
| 回调机制 | `jieba.initialize()` 时可传入自定义回调 |

---

### 潜在扩展方向

> 目前没实现，但 jieba 的能力可以支撑这些想法。

| 想法 | 用到 jieba 的什么 | 价值 |
|------|-----------------|------|
| **搜索索引** | `cut_for_search()` + `tokenize()` | 给消息建倒排索引，搜索速度和精度大幅提升 |
| **领域词典** | `set_idf_path()` 换行业语料 | 跑团/写作/编程不同场景用不同语料，关键词更准 |
| **自动术语提取** | `extract_tags()` + `allowPOS` | AI 对话中自动发现新术语，提示用户加入词典 |
| **消息分类** | `posseg.cut()` 词性分布 | 统计每条消息的词性比例，判断是闲聊/提问/指令 |
| **相似消息检测** | TF-IDF 向量 | 两段文本的关键词重叠度，找相似对话 |
| **世界书智能匹配** | `cut_for_search()` | 用 jieba 分词替代当前正则匹配，支持模糊匹配 |

---

### 配置

关键词提取的行为可在 `config.py` 或角色配置中控制：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| keyword_top_k | 8 | 提取多少个关键词 |
| keyword_method | "tfidf" | "tfidf" 或 "textrank" |
| keyword_min_len | 2 | 最短关键词长度（过滤单字） |
