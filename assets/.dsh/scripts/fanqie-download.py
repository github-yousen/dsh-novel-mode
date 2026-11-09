#!/usr/bin/env python3
"""
fanqie-download.py — 番茄小说下载脚本
用于 .dsh/commands 中的拆书命令调用

使用方式:
  python3 fanqie-download.py <book_id_or_url> [--output-dir <dir>] [--chapters <N>]

示例:
  python3 fanqie-download.py 7143038691944959011 --output-dir novel/source --chapters 30
  python3 fanqie-download.py https://fanqienovel.com/page/7143038691944959011
"""

import json, sys, os, re, time, argparse, urllib.request, ssl
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE = "https://fanqienovel.com"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

# 字符映射表路径（解密必需）
# charset.json 放在 .dsh/ 目录下，子项目复制 .dsh 后路径仍然正确
CHARSET_FILE = Path(__file__).parent.parent / 'charset.json'

CHARSET_MAP = [[], []]
# 番茄小说加密Unicode码点范围
CHARSET_CODE = [[58344, 58715], [58345, 58716]]


def load_charset():
    """加载字符映射表（两个列表格式）"""
    global CHARSET_MAP
    if CHARSET_FILE.exists():
        with open(CHARSET_FILE, 'r', encoding='utf-8') as f:
            CHARSET_MAP = json.load(f)
    else:
        print(f"WARNING: charset.json 未找到（搜索路径: {CHARSET_FILE}），加密章节内容可能有乱码", file=sys.stderr)
        print("请将 charset.json 放到项目根目录或脚本同级目录", file=sys.stderr)


def decrypt_content(content, mode=0):
    """解密番茄小说的加密文字"""
    if not CHARSET_MAP or not CHARSET_MAP[0]:
        return content
    result = []
    for char in content:
        uni = ord(char)
        if CHARSET_CODE[mode][0] <= uni <= CHARSET_CODE[mode][1]:
            bias = uni - CHARSET_CODE[mode][0]
            if 0 <= bias < len(CHARSET_MAP[mode]) and CHARSET_MAP[mode][bias] != '?':
                result.append(CHARSET_MAP[mode][bias])
            else:
                result.append(char)
        else:
            result.append(char)
    return ''.join(result)


def api_get(path, params=None):
    """发起API请求"""
    url = BASE + path
    if params:
        url += '?' + '&'.join(f'{k}={v}' for k, v in params.items())
    req = urllib.request.Request(url, headers={
        'User-Agent': UA,
        'Accept': 'application/json, text/plain, */*',
    })
    with urllib.request.urlopen(req, context=CTX, timeout=15) as resp:
        return json.loads(resp.read().decode())


def get_book_info(book_id):
    """获取小说基本信息"""
    url = f"{BASE}/page/{book_id}"
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, context=CTX, timeout=15) as resp:
        html = resp.read().decode('utf-8', errors='ignore')

    info = {'book_id': book_id}

    # 从title提取书名
    m = re.search(r'<title>(.*?)</title>', html)
    if m:
        title = m.group(1)
        for s in ['_番茄小说官网', '完整版在线免费阅读', '在线免费阅读']:
            title = title.replace(s, '')
        info['title'] = title.split('_')[0].strip()

    # 从DOM提取作者
    m2 = re.search(r'class="author-name"[^>]*>(.*?)</div>', html, re.DOTALL)
    if m2:
        info['author'] = re.sub(r'<[^>]+>', '', m2.group(1)).strip()

    return info


def get_chapter_list(book_id):
    """获取章节列表"""
    data = api_get('/api/reader/directory/detail', {'bookId': book_id})
    if data.get('code') != 0:
        return []

    chapters = []
    volume_list = data.get('data', {}).get('chapterListWithVolume', [])
    for volume in volume_list:
        # volume 是一个 list[dict]，每个 dict 是一个章节
        if isinstance(volume, list):
            for ch in volume:
                chapters.append({
                    'chapter_id': ch.get('itemId', ''),
                    'title': ch.get('title', ''),
                    'need_pay': ch.get('needPay', 0),
                })
        elif isinstance(volume, dict):
            # 兼容可能的 {chapterList: [...]} 格式
            for ch in volume.get('chapterList', []):
                chapters.append({
                    'chapter_id': ch.get('itemId', ''),
                    'title': ch.get('title', ''),
                    'need_pay': ch.get('needPay', 0),
                })
    return chapters


def download_chapter(chapter_id):
    """
    下载单个章节内容（三层API回退策略）
    
    优先级：
    1. fanqieopen SDK API（无需登录态，但可能被云服务器IP封禁）
    2. snssdk API（旧版接口，兼容性好）
    3. fanqienovel HTML SSR（最后手段，依赖服务端渲染）
    
    注意：以上所有接口从云服务器IP请求可能返回空body，
          建议在本地Windows/Mac上运行此脚本。
    """
    apis = [
        # API 1: fanqieopen SDK（油猴脚本使用的接口，无需登录）
        f'https://sdkapi.fanqieopen.com/open_sdk/reader/content/v2?novelsdk_aid=596084&sdk_type=1&item_id={chapter_id}',
        # API 2: snssdk 旧版接口
        f'https://novel.snssdk.com/api/novel/book/reader/full/v1/?device_platform=android&parent_enterfrom=novel_channel_search.tab.&aid=2329&platform_id=1&group_id={chapter_id}&item_id={chapter_id}',
        # API 3: fanqienovel 官方内容接口
        f'{BASE}/api/reader/full/content?item_ids={chapter_id}',
    ]

    # 加载鉴权（API 3 需要 cookie）
    auth_file = Path(__file__).parent / 'fanqie-auth.json'
    cookie = ''
    if auth_file.exists():
        auth = json.load(open(auth_file))
        parts = []
        if auth.get('session_id'): parts.append(f'sessionid={auth["session_id"]}')
        if auth.get('user_id'): parts.append(f'uid_tt={auth["user_id"]}')
        if auth.get('web_id'): parts.append(f'novel_web_id={auth["web_id"]}')
        if auth.get('msToken'): parts.append(f'msToken={auth["msToken"]}')
        cookie = '; '.join(parts)

    for url in apis:
        try:
            headers = {'User-Agent': 'okhttp/4.9.3'}
            # 官方API需要浏览器UA和cookie
            if 'fanqienovel.com' in url:
                headers = {
                    'User-Agent': UA,
                    'Cookie': cookie,
                    'Accept': 'application/json',
                    'Referer': f'{BASE}/reader/{chapter_id}',
                }
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, context=CTX, timeout=15) as resp:
                raw = resp.read().decode('utf-8', errors='ignore')

            if not raw or len(raw) < 10:
                continue

            data = json.loads(raw)
            if data.get('code') != 0:
                continue

            # 提取 content 字段（HTML格式的章节内容）
            content_html = ''
            d = data.get('data', {})
            if isinstance(d, dict):
                content_html = d.get('content', '')
                # 有些API是 data.data[0].content 格式
                if not content_html and isinstance(d.get('data'), list):
                    for item in d['data']:
                        content_html = item.get('content', '')
                        if content_html:
                            break
                # 有些是 data.novel_data 格式
                if not content_html:
                    content_html = d.get('novel_data', '')

            if not content_html or len(content_html) < 50:
                continue

            # 从HTML内容中提取段落文本
            paragraphs = re.findall(r'<p[^>]*>(.*?)</p>', content_html, re.DOTALL)
            if not paragraphs:
                # 兼容无<p>标签的纯文本
                text = re.sub(r'<[^>]+>', '\n', content_html).strip()
                paragraphs = [p.strip() for p in text.split('\n') if p.strip()]

            if not paragraphs:
                continue

            content = '\n'.join(
                re.sub(r'<[^>]+>', '', p).strip() for p in paragraphs if p.strip()
            )

            if len(content) < 50:
                continue

            # 解密（先试mode 0，残留多再试mode 1）
            decoded = decrypt_content(content, mode=0)
            pua_count = sum(1 for c in decoded if 58344 <= ord(c) <= 58716)
            if pua_count > len(decoded) * 0.1:
                decoded = decrypt_content(content, mode=1)
            return decoded

        except Exception:
            continue

    # 所有API都失败，最后尝试HTML SSR方式
    try:
        url = f"{BASE}/reader/{chapter_id}"
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        with urllib.request.urlopen(req, context=CTX, timeout=15) as resp:
            html = resp.read().decode('utf-8', errors='ignore')

        reader_match = re.search(
            r'<div[^>]*class="muye-reader-content[^"]*"[^>]*>(.*?)</div>\s*</div>',
            html, re.DOTALL
        )
        if reader_match:
            paragraphs = re.findall(r'<p[^>]*>(.*?)</p>', reader_match.group(1), re.DOTALL)
            if paragraphs:
                content = '\n'.join(
                    re.sub(r'<[^>]+>', '', p).strip() for p in paragraphs if p.strip()
                )
                if len(content) > 50:
                    decoded = decrypt_content(content, mode=0)
                    if sum(1 for c in decoded if 58344 <= ord(c) <= 58716) > len(decoded) * 0.1:
                        decoded = decrypt_content(content, mode=1)
                    return decoded
    except Exception:
        pass

    return None


def download_book(book_id, output_dir, max_chapters=None, workers=3):
    """下载整本书"""
    load_charset()

    # 获取书籍信息
    info = get_book_info(book_id)
    title = info.get('title', book_id)
    author = info.get('author', '未知')
    print(f"📖 《{title}》 by {author}", file=sys.stderr)

    # 获取章节列表
    chapters = get_chapter_list(book_id)
    if not chapters:
        print(f"ERROR: 无法获取章节列表", file=sys.stderr)
        return None

    if max_chapters:
        chapters = chapters[:max_chapters]

    print(f"📑 共 {len(chapters)} 章", file=sys.stderr)

    # 创建输出目录
    out_path = Path(output_dir)
    chapters_dir = out_path / 'chapters'
    chapters_dir.mkdir(parents=True, exist_ok=True)

    # 保存书籍元信息
    meta = {
        'book_id': book_id,
        'title': title,
        'author': author,
        'total_chapters': len(chapters),
        'chapter_list': chapters,
    }
    with open(out_path / 'meta.json', 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    # 下载各章节
    success = 0
    failed = 0

    def download_one(idx_ch):
        idx, ch = idx_ch
        content = download_chapter(ch['chapter_id'])
        return idx, ch, content

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(download_one, (i, ch)): i for i, ch in enumerate(chapters)}
        for future in as_completed(futures):
            idx, ch, content = future.result()
            if content and len(content) > 50:
                # 保存章节
                ch_dir = chapters_dir / f'{idx+1:03d}'
                ch_dir.mkdir(exist_ok=True)
                with open(ch_dir / 'content.md', 'w', encoding='utf-8') as f:
                    f.write(f"# {ch['title']}\n\n{content}")
                success += 1
                if success % 10 == 0:
                    print(f"  进度: {success}/{len(chapters)}", file=sys.stderr)
            else:
                failed += 1

    # 同时生成一个合并的TXT文件
    txt_path = out_path / f'{title}.txt'
    with open(txt_path, 'w', encoding='utf-8') as f:
        f.write(f"《{title}》\n作者：{author}\n\n")
        for i in range(len(chapters)):
            ch_file = chapters_dir / f'{i+1:03d}' / 'content.md'
            if ch_file.exists():
                with open(ch_file, 'r', encoding='utf-8') as cf:
                    f.write(cf.read() + '\n\n')

    print(f"\n✅ 下载完成: 成功 {success} / 失败 {failed} / 总计 {len(chapters)} 章", file=sys.stderr)
    print(f"📁 输出目录: {output_dir}", file=sys.stderr)
    print(f"📄 合并TXT: {txt_path}", file=sys.stderr)

    return {
        'book_id': book_id,
        'title': title,
        'author': author,
        'total': len(chapters),
        'success': success,
        'failed': failed,
        'output_dir': str(output_dir),
        'txt_file': str(txt_path),
    }


def extract_book_id(input_str):
    """从URL或纯ID提取book_id"""
    # URL格式: https://fanqienovel.com/page/7143038691944959011
    m = re.search(r'(?:page|book|novel)[/=](\d{10,})', input_str)
    if m:
        return m.group(1)
    # 纯数字
    if re.match(r'^\d{10,}$', input_str.strip()):
        return input_str.strip()
    return None


def main():
    parser = argparse.ArgumentParser(description='番茄小说下载器')
    parser.add_argument('book', help='小说ID或URL')
    parser.add_argument('--output-dir', '-o', default='novel/source', help='输出目录')
    parser.add_argument('--chapters', '-n', type=int, help='最多下载章数（不指定则下载全部）')
    parser.add_argument('--workers', '-w', type=int, default=3, help='并发线程数')
    args = parser.parse_args()

    book_id = extract_book_id(args.book)
    if not book_id:
        print(f"ERROR: 无法识别小说ID: {args.book}", file=sys.stderr)
        sys.exit(1)

    result = download_book(book_id, args.output_dir, args.chapters, args.workers)
    if result:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        sys.exit(1)


if __name__ == '__main__':
    main()
