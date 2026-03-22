#!/usr/bin/env python3
"""
Run this script from the OICC folder after adding a new article to articles/.

    python generate-articles-index.py

Article format
--------------
Save files as:  articles/YYYY-MM-DD-your-title.txt
                (date prefix is used for ordering)

Optional headers at the top of the file (blank line separates them from the body):

    Title: Your Article Title
    Category: Match Report
    Author: James Henderson
    Date: 2026-03-18          (overrides filename date)
    Image: images/photo.jpg   (relative to OICC root; leave blank for placeholder)
    Excerpt: Custom summary.  (auto-generated from first paragraph if omitted)

    Article body starts here after the blank line...

Headers are optional — a plain text file with no headers works fine.
"""

import os
import json
import re
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ARTICLES_DIR = os.path.join(SCRIPT_DIR, 'articles')
INDEX_FILE = os.path.join(ARTICLES_DIR, 'index.json')

HEADER_KEYS = {'title', 'category', 'author', 'date', 'image', 'excerpt'}


def parse_article(filename, filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    lines = content.split('\n')
    headers = {}
    body_start = 0

    # Parse optional Key: Value headers at the top of the file
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped == '':
            if headers:
                body_start = i + 1  # blank line ends the header block
            break
        colon = stripped.find(':')
        if colon > 0 and stripped[:colon].strip().lower() in HEADER_KEYS:
            key = stripped[:colon].strip().lower()
            headers[key] = stripped[colon + 1:].strip()
            body_start = i + 1
        else:
            break  # not a header line — body starts from the beginning

    body = '\n'.join(lines[body_start:]).strip()

    # Date: header > filename prefix > file modification time
    date_match = re.match(r'^(\d{4}-\d{2}-\d{2})', filename)
    file_date = date_match.group(1) if date_match else None
    date = headers.get('date') or file_date
    if not date:
        mtime = os.path.getmtime(filepath)
        date = datetime.fromtimestamp(mtime).strftime('%Y-%m-%d')

    # Title: header > slug derived from filename
    title = headers.get('title')
    if not title:
        slug = filename[:-4]  # strip .txt
        if date_match:
            slug = slug[len(date_match.group(1)) + 1:]  # strip YYYY-MM-DD-
        title = slug.replace('-', ' ').replace('_', ' ').title()

    # Excerpt: header > first paragraph (max 200 chars)
    excerpt = headers.get('excerpt')
    if not excerpt:
        first_para = next((p.strip() for p in body.split('\n\n') if p.strip()), '')
        first_para = first_para.replace('\n', ' ')
        excerpt = (first_para[:200] + '...') if len(first_para) > 200 else first_para

    return {
        'file': filename,
        'date': date,
        'title': title,
        'category': headers.get('category', 'Club News'),
        'author': headers.get('author', ''),
        'image': headers.get('image', ''),
        'excerpt': excerpt,
    }


def main():
    if not os.path.exists(ARTICLES_DIR):
        os.makedirs(ARTICLES_DIR)
        print('Created articles/ directory')

    articles = []
    for filename in sorted(os.listdir(ARTICLES_DIR)):
        if not filename.endswith('.txt'):
            continue
        filepath = os.path.join(ARTICLES_DIR, filename)
        try:
            article = parse_article(filename, filepath)
            articles.append(article)
            print(f'  + {article["date"]}  {article["title"]}')
        except Exception as e:
            print(f'  ! Error reading {filename}: {e}')

    articles.sort(key=lambda x: x['date'], reverse=True)

    with open(INDEX_FILE, 'w', encoding='utf-8') as f:
        json.dump(articles, f, indent=2, ensure_ascii=False)

    print(f'\nDone — {len(articles)} article(s) written to articles/index.json')


if __name__ == '__main__':
    main()
