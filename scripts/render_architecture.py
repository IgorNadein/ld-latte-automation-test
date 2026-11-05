from pathlib import Path
from html import escape
D=Path.home()/'Dev/ld-latte-automation-test/docs'
cards=[
 (20,125,'01','Владелец аккаунта','Professional IG, consent'),
 (263,125,'02','Meta Developer App','OAuth, scopes, App Review'),
 (506,125,'03','OAuth callback','state → code → token'),
 (749,125,'04','Secret Vault','token, expiry, account ID'),
 (20,358,'05','Планировщик','n8n / cron, per account'),
 (263,358,'06','Instagram Graph API','account + media insights'),
 (506,358,'07','Нормализация','validation, retries, UPSERT'),
 (749,358,'08','PostgreSQL','metrics, snapshots, audit'),
 (992,358,'09','Отчётность','BI / Dashboard')
]
parts=['''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1240 560" role="img" aria-label="Архитектура Instagram интеграции LD LATTE">
<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#a07875"/></marker></defs>
<rect width="1240" height="560" rx="20" fill="#f8f6f3"/>
<text x="28" y="40" fill="#513a38" font-family="Arial,sans-serif" font-size="20" font-weight="700">INSTAGRAM INSIGHTS  /  ARCHITECTURE</text>
<text x="28" y="70" fill="#8d817a" font-family="Arial,sans-serif" font-size="13">LD LATTE  ·  Токены только на сервере  ·  Сбор по расписанию  ·  Данные по нескольким аккаунтам</text>
''']
for x,y,num,title,subtitle in cards:
 w=222
 parts.extend([f'<rect x="{x}" y="{y}" width="{w}" height="126" rx="12" fill="#fff" stroke="#ddd6d0" stroke-width="1.3"/>',
 f'<rect x="{x+16}" y="{y+17}" width="32" height="27" rx="7" fill="#e9dfdc"/>',
 f'<text x="{x+23}" y="{y+35}" fill="#634944" font-family="Arial,sans-serif" font-size="12" font-weight="700">{num}</text>',
 f'<text x="{x+17}" y="{y+74}" fill="#382e2b" font-family="Arial,sans-serif" font-size="16" font-weight="700">{escape(title)}</text>',
 f'<text x="{x+17}" y="{y+100}" fill="#8b7d77" font-family="Arial,sans-serif" font-size="12">{escape(subtitle)}</text>'
 ])
def arrow(x1,y1,x2,y2):
 parts.append(f'<path d="M{x1} {y1}L{x2} {y2}" fill="none" stroke="#a07875" stroke-width="2.2" marker-end="url(#arrow)"/>')
for x in [242,485,728]: arrow(x,188,x+19,188)
for x in [242,485,728,971]: arrow(x,420,x+19,420)
parts.append('<path d="M860 251 V305 H130 V350" fill="none" stroke="#a07875" stroke-width="2.2" stroke-dasharray="5 4" marker-end="url(#arrow)"/>')
parts.append('<text x="488" y="286" fill="#907771" font-family="Arial,sans-serif" font-size="13">Закрытое хранилище → безопасный сбор по расписанию</text>')
parts.append('<text x="30" y="520" fill="#a69b95" font-family="Arial,sans-serif" font-size="12">No production credentials in this diagram · Meta API version and metrics checked at integration time</text></svg>')
(D/'instagram-architecture.svg').write_text('\n'.join(parts),encoding='utf8')
print(str(D/'instagram-architecture.svg'))
