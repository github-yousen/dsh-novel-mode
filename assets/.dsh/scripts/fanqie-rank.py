#!/usr/bin/env python3
"""
fanqie-rank.py — 番茄小说新书排行榜抓取脚本（纯标准库，无需额外依赖）
用于 .dsh/commands 中的命令调用

原理：
  排行榜页面 SSR 的 book_list JSON 中，bookName/author 是用番茄字体加密的，
  通过仓库内的 charset.json 映射表直接解密，完全不需要请求书籍详情页。
  这样本地 Windows 和云端开发机上效果完全一致。

使用方式:
  python3 fanqie-rank.py                      # 获取全部男频新书榜 Top10
  python3 fanqie-rank.py --gender male         # 男频
  python3 fanqie-rank.py --gender female       # 女频
  python3 fanqie-rank.py --top 5               # 每分类取Top5
  python3 fanqie-rank.py --output rank.json    # 同时输出到JSON文件
  python3 fanqie-rank.py --format json         # 只输出JSON

依赖：纯Python标准库 + 仓库内 charset.json（无需 pip install 任何包）
"""

import json, sys, time, re, argparse, urllib.request, ssl
from pathlib import Path
from datetime import datetime

# 修复 Windows 默认 GBK 编码导致 emoji/中文输出崩溃
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

BASE = "https://fanqienovel.com"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

# 文件路径
SCRIPT_DIR = Path(__file__).parent          # .dsh/scripts/
AUTH_FILE = SCRIPT_DIR / 'fanqie-auth.json'
# charset.json 放在 .dsh/ 目录下，子项目复制 .dsh 后路径仍然正确
CHARSET_FILE = SCRIPT_DIR.parent / 'charset.json'

# 番茄字体加密的 Unicode 私有区码点范围
CHARSET_CODE = [[58344, 58715], [58345, 58716]]

# 全局 charset（懒加载）
_CHARSET = None


def load_charset():
    """加载字体解密映射表"""
    global _CHARSET
    if _CHARSET is not None:
        return _CHARSET
    if CHARSET_FILE.exists():
        with open(CHARSET_FILE, 'r', encoding='utf-8') as f:
            _CHARSET = json.load(f)
    else:
        print(f"WARNING: charset.json 未找到（{CHARSET_FILE}），书名/作者可能显示乱码", file=sys.stderr)
        _CHARSET = [[], []]
    return _CHARSET


def decrypt(text, mode=0):
    """用 charset.json 解密番茄字体加密文字"""
    charset = load_charset()
    if not charset or not charset[mode]:
        return text
    result = []
    for c in text:
        u = ord(c)
        if CHARSET_CODE[mode][0] <= u <= CHARSET_CODE[mode][1]:
            bias = u - CHARSET_CODE[mode][0]
            if 0 <= bias < len(charset[mode]) and charset[mode][bias] != '?':
                result.append(charset[mode][bias])
            else:
                result.append(c)
        else:
            result.append(c)
    return ''.join(result)


# 男频分类映射（catId → 名称）
MALE_CATEGORIES = [
    {'catId': '1141', 'name': '西方奇幻'},
    {'catId': '1140', 'name': '东方仙侠'},
    {'catId': '258',  'name': '传统玄幻'},
    {'catId': '257',  'name': '玄幻脑洞'},
    {'catId': '8',    'name': '科幻末世'},
    {'catId': '261',  'name': '都市日常'},
    {'catId': '124',  'name': '都市修真'},
    {'catId': '1014', 'name': '都市高武'},
    {'catId': '262',  'name': '都市脑洞'},
    {'catId': '263',  'name': '都市种田'},
    {'catId': '273',  'name': '历史古代'},
    {'catId': '272',  'name': '历史脑洞'},
    {'catId': '27',   'name': '战神赘婿'},
    {'catId': '539',  'name': '悬疑脑洞'},
    {'catId': '751',  'name': '悬疑灵异'},
    {'catId': '504',  'name': '抗战谍战'},
    {'catId': '746',  'name': '游戏体育'},
    {'catId': '718',  'name': '动漫衍生'},
    {'catId': '1016', 'name': '男频衍生'},
]

# 女频分类映射
FEMALE_CATEGORIES = [
    {'catId': '1139', 'name': '古风世情'},
    {'catId': '248',  'name': '玄幻言情'},
    {'catId': '23',   'name': '种田'},
    {'catId': '79',   'name': '年代'},
    {'catId': '267',  'name': '现言脑洞'},
    {'catId': '246',  'name': '宫斗宅斗'},
    {'catId': '539',  'name': '悬疑脑洞'},
    {'catId': '253',  'name': '古言脑洞'},
    {'catId': '24',   'name': '快穿'},
    {'catId': '749',  'name': '青春甜宠'},
    {'catId': '745',  'name': '星光璀璨'},
    {'catId': '747',  'name': '女频悬疑'},
    {'catId': '750',  'name': '职场婚恋'},
    {'catId': '748',  'name': '豪门总裁'},
    {'catId': '1015', 'name': '女频衍生'},
    {'catId': '1017', 'name': '民国言情'},
    {'catId': '8',    'name': '科幻末世'},
    {'catId': '746',  'name': '游戏体育'},
]


def load_auth():
    """加载鉴权信息"""
    if AUTH_FILE.exists():
        with open(AUTH_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {'msToken': '', 'session_id': '', 'device_id': '', 'user_id': ''}


def build_cookie(auth):
    """构建 Cookie 字符串"""
    parts = []
    if auth.get('session_id'):
        parts.append(f'sessionid={auth["session_id"]}')
        parts.append(f'sid_guard={auth["session_id"]}')
    if auth.get('user_id'):
        parts.append(f'uid_tt={auth["user_id"]}')
    if auth.get('msToken'):
        parts.append(f'msToken={auth["msToken"]}')
    if auth.get('device_id'):
        parts.append(f'device_id={auth["device_id"]}')
    return '; '.join(parts)


def http_get(url, cookie=''):
    """发起 HTTP GET 请求，返回响应文本"""
    headers = {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': BASE,
    }
    if cookie:
        headers['Cookie'] = cookie
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, context=CTX, timeout=15) as resp:
        return resp.read().decode('utf-8', errors='ignore')


def extract_json_array(html, key):
    """
    用括号计数法从 HTML 中提取指定 key 对应的完整 JSON 数组。
    比正则更可靠——避免书名/简介中含有 ] 字符时被截断。
    """
    m = re.search(f'"{key}"\\s*:\\s*', html)
    if not m:
        return None
    start = m.end()
    if start >= len(html) or html[start] != '[':
        return None
    depth = 0
    in_str = False
    escape = False
    for i in range(start, len(html)):
        c = html[i]
        if escape:
            escape = False
            continue
        if c == '\\' and in_str:
            escape = True
            continue
        if c == '"' and not escape:
            in_str = not in_str
            continue
        if in_str:
            continue
        if c == '[':
            depth += 1
        elif c == ']':
            depth -= 1
            if depth == 0:
                return html[start:i + 1]
    return None


def parse_book_list_from_html(html, top_n=10):
    """
    从排行榜页面 SSR HTML 中解析 book_list，
    返回: [{rank, book_id, title, author, abstract, url}, ...]

    关键：bookName/author 字段是字体加密的，用 charset.json 直接解密，
    完全不需要请求书籍详情页，本地和云端效果一致。
    """
    raw = extract_json_array(html, 'book_list')
    if not raw:
        return []

    # 番茄 SSR JSON 混入 JS 字面量（undefined/NaN），先清洗为 null 再解析
    raw = re.sub(r'([:,\[]\s*)(undefined|NaN|Infinity)\b', r'\1null', raw)

    try:
        book_list = json.loads(raw)
    except Exception:
        return []

    books = []
    for i, b in enumerate(book_list[:top_n], 1):
        # book_id 字段兼容多种命名
        bid = str(b.get('bookId') or b.get('itemId') or b.get('book_id') or '')
        if not bid or len(bid) < 15:
            continue

        # 书名/作者：用 charset.json 解密
        raw_name = b.get('bookName') or b.get('book_name') or b.get('title') or ''
        raw_author = b.get('author') or b.get('authorName') or ''
        raw_abstract = b.get('abstract') or b.get('intro') or ''

        title = decrypt(raw_name).strip()
        author = decrypt(raw_author).strip()
        abstract = decrypt(str(raw_abstract))[:120].strip()

        books.append({
            'rank': i,
            'book_id': bid,
            'title': title or '未知',
            'author': author or '未知',
            'abstract': abstract,
            'url': f'{BASE}/page/{bid}',
            # 热度数据（字段值可能是字符串，统一转int）
            'read_count': int(b.get('read_count') or b.get('readCount') or 0),
            'word_number': int(b.get('wordNumber') or 0),
            'rank_diff': int(b.get('rankPosDiff') or 0),   # 排名变化：正=上升，负=下降，0=持平
            'status': '完结' if str(b.get('creationStatus')) == '0' else '连载',
            'last_chapter': b.get('lastChapterTitle') or '',
        })

    return books


def scrape_category_rank(gender_code, cat_id, cat_name, top_n, cookie):
    """抓取单个分类的新书榜，直接解密 SSR 书名，无需请求详情页"""
    url = f"{BASE}/rank/{gender_code}_1_{cat_id}"
    try:
        html = http_get(url, cookie)
        books = parse_book_list_from_html(html, top_n)
        if books:
            print(f"  ✅ {cat_name}: {len(books)}本", file=sys.stderr)
        else:
            print(f"  ❌ {cat_name}: 无数据（HTML={len(html)}字节）", file=sys.stderr)
        return books
    except Exception as e:
        print(f"  ❌ {cat_name}: {str(e)[:60]}", file=sys.stderr)
        return []


def scrape_rank(gender='male', top_n=10):
    """
    抓取番茄小说新书排行榜
    返回: {分类名: [{rank, book_id, title, author, abstract, url}, ...]}
    """
    auth = load_auth()
    cookie = build_cookie(auth)
    gender_code = '1' if gender == 'male' else '0'
    categories = MALE_CATEGORIES if gender == 'male' else FEMALE_CATEGORIES

    result = {}
    for cat in categories:
        books = scrape_category_rank(gender_code, cat['catId'], cat['name'], top_n, cookie)
        if books:
            result[cat['name']] = books
        time.sleep(0.3)  # 限速，避免触发反爬

    return result


def main():
    parser = argparse.ArgumentParser(
        description='番茄小说新书排行榜抓取（纯标准库 + charset.json 解密，无需 pip install）'
    )
    parser.add_argument('--gender', choices=['male', 'female', 'all'], default='male',
                        help='频道: male=男频, female=女频, all=全部（默认: male）')
    parser.add_argument('--top', type=int, default=10,
                        help='每分类取Top N（默认: 10）')
    parser.add_argument('--output', type=str,
                        help='同时保存到JSON文件路径')
    parser.add_argument('--format', choices=['json', 'text'], default='text',
                        help='终端输出格式（默认: text）')
    args = parser.parse_args()

    genders = ['male', 'female'] if args.gender == 'all' else [args.gender]
    all_results = {}

    for g in genders:
        label = '男频' if g == 'male' else '女频'
        print(f"\n抓取{label}新书榜...", file=sys.stderr)
        data = scrape_rank(gender=g, top_n=args.top)
        for cat_name, books in data.items():
            all_results[f"{label}·{cat_name}"] = books

    # 保存 JSON 文件
    if args.output:
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(all_results, f, ensure_ascii=False, indent=2)
        print(f"\n数据已保存到: {args.output}", file=sys.stderr)

    # 终端输出
    if args.format == 'json':
        print(json.dumps(all_results, ensure_ascii=False, indent=2))
    else:
        print(f"\n{'='*62}")
        print(f"  🏆 番茄小说新书排行榜")
        print(f"  📅 {datetime.now().strftime('%Y-%m-%d %H:%M')}")
        print(f"{'='*62}")

        for cat_full, books in all_results.items():
            if not books:
                continue
            print(f"\n  📚 【{cat_full}】新书榜 TOP{len(books)}")
            print(f"  {'-'*52}")
            for b in books:
                # 排名变化标记
                diff = b.get('rank_diff', 0)
                diff_str = f'↑{diff}' if diff > 0 else (f'↓{abs(diff)}' if diff < 0 else '—')
                # 阅读数格式化
                rc = b.get('read_count', 0)
                rc_str = f'{rc/10000:.1f}万' if rc >= 10000 else str(rc)
                # 字数格式化
                wn = b.get('word_number', 0)
                wn_str = f'{wn/10000:.1f}万字' if wn >= 10000 else f'{wn}字'

                print(f"  {b['rank']:2d}. 《{b['title']}》 {b['author']}  "
                      f"[{b['status']}] 📖{rc_str} 📝{wn_str} {diff_str}")
                if b['abstract']:
                    print(f"      └ {b['abstract'][:60]}...")

        total = sum(len(books) for books in all_results.values())
        print(f"\n  📊 共 {len(all_results)} 个分类, {total} 本书")


if __name__ == '__main__':
    main()
