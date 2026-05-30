"""
Creates a docxtemplater-compatible placeholder version of
Client_Communication_Framework.docx for the Expectation Setting Canvas.

docxtemplater uses SINGLE curly braces: {var_name}

Replacements:
  Account name / Date line  → {account_name} / {date}
  Cell 1 instruction text   → {will_deliver}
  Cell 2 instruction text   → {will_not_deliver}
  Cell 3 instruction text   → {need_from_client}
  Cell 4 instruction text   → {consequences}
"""

import zipfile, io, re

SRC  = 'public/templates/Client_Communication_Framework.docx'
DEST = 'public/templates/filled/Client_Communication_Framework.docx'

with zipfile.ZipFile(SRC, 'r') as z:
    xml = z.read('word/document.xml').decode('utf-8')

# ── 1. Account name & date ────────────────────────────────────────────────────
xml = re.sub(
    r'Account name: _{3,}\s+Date: _{3,}',
    'Account name: {account_name}     Date: {date}',
    xml
)

# ── 2. Canvas cell instructions ───────────────────────────────────────────────
CELLS = [
    ('List specific commi',       '{will_deliver}'),
    ('Define explicit out-of-scope', '{will_not_deliver}'),
    ('Access, approvals, data',   '{need_from_client}'),
    ('Escalation path, remediation', '{consequences}'),
]

for fragment, placeholder in CELLS:
    pattern = r'(<w:p\b[^>]*>(?:(?!</w:p>).)*?' + re.escape(fragment) + r'.*?</w:p>)'
    match = re.search(pattern, xml, re.DOTALL)
    if match:
        old_para = match.group(0)
        ppr      = re.search(r'<w:pPr>.*?</w:pPr>', old_para, re.DOTALL)
        ppr_str  = ppr.group(0) if ppr else ''
        open_tag = re.match(r'(<w:p\b[^>]*>)', old_para)
        open_str = open_tag.group(1) if open_tag else '<w:p>'
        new_para = f'{open_str}{ppr_str}<w:r><w:t>{placeholder}</w:t></w:r></w:p>'
        xml = xml.replace(old_para, new_para, 1)
        print(f'  OK  {fragment[:35]}... → {placeholder}')
    else:
        print(f'  WARN: not found — {fragment}')

# ── 3. Write back ─────────────────────────────────────────────────────────────
buf = io.BytesIO()
with zipfile.ZipFile(SRC, 'r') as zin:
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            if item.filename == 'word/document.xml':
                zout.writestr(item, xml.encode('utf-8'))
            else:
                zout.writestr(item, zin.read(item.filename))

with open(DEST, 'wb') as f:
    f.write(buf.getvalue())

# ── 4. Verify ─────────────────────────────────────────────────────────────────
with zipfile.ZipFile(DEST, 'r') as z:
    xml_check = z.read('word/document.xml').decode('utf-8')

placeholders = re.findall(r'\{[a-z_]+\}', xml_check)
print(f'\nSaved → {DEST}')
print(f'Placeholders found ({len(placeholders)}): {placeholders}')
