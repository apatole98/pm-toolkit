"""
Creates placeholder versions of all 4 DOCX templates.
Run: python3 scripts/make-all-placeholders.py
"""

import zipfile, io, re, os

os.makedirs('public/templates/filled', exist_ok=True)

# ─────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────
def load_xml(path):
    with zipfile.ZipFile(path) as z:
        return z.read('word/document.xml').decode('utf-8')

def save_docx(src_path, dest_path, new_xml):
    buf = io.BytesIO()
    with zipfile.ZipFile(src_path) as zin, \
         zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = new_xml.encode('utf-8') if item.filename == 'word/document.xml' \
                   else zin.read(item.filename)
            zout.writestr(item, data)
    with open(dest_path, 'wb') as f:
        f.write(buf.getvalue())

def replace_paragraph(xml, fragment, placeholder):
    """Replace the full <w:p>…</w:p> that contains `fragment` with a single placeholder run."""
    pattern = r'(<w:p\b[^>]*>(?:(?!</w:p>).)*?' + re.escape(fragment) + r'.*?</w:p>)'
    m = re.search(pattern, xml, re.DOTALL)
    if m:
        old = m.group(0)
        ppr = re.search(r'<w:pPr>.*?</w:pPr>', old, re.DOTALL)
        ppr_s = ppr.group(0) if ppr else ''
        o_tag = re.match(r'(<w:p\b[^>]*>)', old)
        o_s = o_tag.group(1) if o_tag else '<w:p>'
        xml = xml.replace(old, f'{o_s}{ppr_s}<w:r><w:t>{placeholder}</w:t></w:r></w:p>', 1)
        return xml, True
    return xml, False

def inject_into_nth_empty_cell(xml, n, placeholder):
    """Inject placeholder text into the Nth empty table cell (0-indexed)."""
    empty_cell_pattern = r'(<w:tc\b[^>]*>)((?:<w:tcPr>.*?</w:tcPr>)?)\s*(<w:p\b[^>]*>)\s*</w:p>\s*</w:tc>'
    count = [0]
    def replacer(m):
        if count[0] == n:
            count[0] += 1
            pPr_open = m.group(3)
            return f'{m.group(1)}{m.group(2)}{pPr_open}<w:r><w:t>{placeholder}</w:t></w:r></w:p></w:tc>'
        count[0] += 1
        return m.group(0)
    return re.sub(empty_cell_pattern, replacer, xml, flags=re.DOTALL)

def verify(path):
    with zipfile.ZipFile(path) as z:
        xml = z.read('word/document.xml').decode()
    found = re.findall(r'\{[a-z_]+\}', xml)
    print(f'  Placeholders ({len(found)}): {found}')

# ─────────────────────────────────────────────────────────────
# 1. PMO SOP — sign-off table
# ─────────────────────────────────────────────────────────────
print('\n=== PMO SOP ===')
SRC  = 'public/templates/PMO-SOP-006-V1_0-Hybrid_Governance_Framework__1_.docx'
DEST = 'public/templates/filled/PMO-SOP-006-V1_0-Hybrid_Governance_Framework__1_.docx'
xml = load_xml(SRC)

# The sign-off table has rows: PMO Lead | [name] | [sig] | [date]
# Find the sign-off table section
signoff_idx = xml.rfind('SOP Sign-off')
signoff_xml = xml[signoff_idx:]

# Find all <w:tr> in signoff area — the data rows have role names in cell 0
rows = re.findall(r'<w:tr\b[^>]*>.*?</w:tr>', signoff_xml, re.DOTALL)

ROLES = [
    ('PMO Lead',               'pmo_lead'),
    ('Executive Sponsor',      'exec_sponsor'),
    ('Board Chair',            'board_chair'),
    ('Head of Delivery',       'head_delivery'),
]

for role_text, var in ROLES:
    for row in rows:
        if role_text in row:
            cells = re.findall(r'<w:tc\b[^>]*>.*?</w:tc>', row, re.DOTALL)
            if len(cells) >= 2:
                # Name cell is index 1, Date cell is index 3 (if 4 cols)
                old_name_cell = cells[1]
                new_name_cell = re.sub(
                    r'(<w:p\b[^>]*>).*?(</w:p>)',
                    rf'\1<w:r><w:t>{{{var}}}</w:t></w:r>\2',
                    old_name_cell, count=1, flags=re.DOTALL
                )
                if len(cells) >= 4:
                    old_date_cell = cells[3]
                    new_date_cell = re.sub(
                        r'(<w:p\b[^>]*>).*?(</w:p>)',
                        r'\1<w:r><w:t>{signoff_date}</w:t></w:r>\2',
                        old_date_cell, count=1, flags=re.DOTALL
                    )
                    new_row = row.replace(old_name_cell, new_name_cell, 1) \
                                 .replace(old_date_cell, new_date_cell, 1)
                else:
                    new_row = row.replace(old_name_cell, new_name_cell, 1)
                signoff_xml = signoff_xml.replace(row, new_row, 1)
                xml = xml[:signoff_idx] + signoff_xml
                print(f'  OK {role_text} → {{{var}}}')
            break

save_docx(SRC, DEST, xml)
verify(DEST)


# ─────────────────────────────────────────────────────────────
# 2. Project Charter
# ─────────────────────────────────────────────────────────────
print('\n=== Project Charter ===')
SRC  = 'public/templates/Project_Charter_Template.docx'
DEST = 'public/templates/filled/Project_Charter_Template.docx'
xml = load_xml(SRC)

# Find all table rows
rows_all = re.findall(r'<w:tr\b[^>]*>.*?</w:tr>', xml, re.DOTALL)

def get_row_cells_text(row):
    cells = re.findall(r'<w:tc\b[^>]*>.*?</w:tc>', row, re.DOTALL)
    return [re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', c)).strip() for c in cells]

def replace_cell_content(xml, row, cell_idx, placeholder):
    """Replace content of cell[cell_idx] in the given row XML."""
    cells = re.findall(r'<w:tc\b[^>]*>.*?</w:tc>', row, re.DOTALL)
    if cell_idx >= len(cells): return xml
    old_cell = cells[cell_idx]
    # Replace paragraph content
    new_cell = re.sub(
        r'(<w:p\b[^>]*>).*?(</w:p>)',
        rf'\1<w:r><w:t>{placeholder}</w:t></w:r>\2',
        old_cell, count=1, flags=re.DOTALL
    )
    return xml.replace(old_cell, new_cell, 1)

# Map row content to placeholders
for i, row in enumerate(rows_all):
    texts = get_row_cells_text(row)

    # Row 10: single cell "Project Description..." → Row 11 (.): project_description
    if len(texts) == 1 and texts[0].startswith('.'):
        xml = replace_cell_content(xml, row, 0, '{project_description}')
        print('  OK project_description (row with ".")')

    # Row 13: single cell with business impact questions
    elif len(texts) == 1 and 'Why should leadership fund' in texts[0]:
        xml = replace_cell_content(xml, row, 0, '{business_impact}')
        print('  OK business_impact')

    # Row 15: [Current State cell | Desired State cell] — both empty
    elif len(texts) == 2 and 'Current State' in texts[0] and 'Desired' in texts[1]:
        next_row_idx = i + 1
        if next_row_idx < len(rows_all):
            next_row = rows_all[next_row_idx]
            next_texts = get_row_cells_text(next_row)
            if all(t == '' for t in next_texts) and len(next_texts) == 2:
                xml = replace_cell_content(xml, next_row, 0, '{current_state}')
                xml = replace_cell_content(xml, next_row, 1, '{desired_state}')
                print('  OK current_state + desired_state')

    # Row 16: [Scope | Out-of-Scope] — labels → next row is empty values
    elif len(texts) == 2 and 'Project Scope' in texts[0] and 'Out of Scope' in texts[1]:
        next_row_idx = i + 1
        if next_row_idx < len(rows_all):
            next_row = rows_all[next_row_idx]
            next_texts = get_row_cells_text(next_row)
            if len(next_texts) == 2:
                xml = replace_cell_content(xml, next_row, 0, '{scope}')
                xml = replace_cell_content(xml, next_row, 1, '{out_of_scope}')
                print('  OK scope + out_of_scope')

    # Row 18: [Top 3 Risks | Dependencies | Assumptions] headers → next rows are values
    elif len(texts) == 3 and 'Top 3 Risks' in texts[0]:
        for j, (var, ci) in enumerate([('risk_1',0),('risk_2',0),('risk_3',0),
                                        ('dependencies',1)]):
            next_row_idx = i + 1 + (j if j < 3 else 0)
            if next_row_idx < len(rows_all):
                nr = rows_all[next_row_idx]
                col = 0 if j < 3 else 1
                if var == 'dependencies' and i + 1 < len(rows_all):
                    xml = replace_cell_content(xml, rows_all[i+1], 1, '{dependencies}')
                    print(f'  OK dependencies')
                elif j < 3:
                    xml = replace_cell_content(xml, rows_all[i + 1 + j], 0, f'{{risk_{j+1}}}')
                    print(f'  OK risk_{j+1}')

    # Row 25: SMART goal label → Row 26: empty cell
    elif len(texts) == 1 and 'CREATE YOUR SMART BUSINESS GOAL' in texts[0]:
        next_row_idx = i + 1
        if next_row_idx < len(rows_all):
            xml = replace_cell_content(xml, rows_all[next_row_idx], 0, '{smart_goal}')
            print('  OK smart_goal')

    # Milestone rows (Stage 1-4 Assess/Build/Launch/Evaluate) — fill status + date + responsible
    elif len(texts) >= 2 and texts[0] == 'Stage 1 Assess Phase':
        for stage_i, stage_var in enumerate(['stage1','stage2','stage3','stage4']):
            if i + stage_i < len(rows_all):
                xml = replace_cell_content(xml, rows_all[i + stage_i], 1, f'{{{stage_var}_status}}')
                xml = replace_cell_content(xml, rows_all[i + stage_i], 2, f'{{{stage_var}_date}}')
                xml = replace_cell_content(xml, rows_all[i + stage_i], 3, f'{{{stage_var}_owner}}')
        print('  OK milestone stages 1-4')

save_docx(SRC, DEST, xml)
verify(DEST)


# ─────────────────────────────────────────────────────────────
# 3. Client Empathy Map
# ─────────────────────────────────────────────────────────────
print('\n=== Empathy Map ===')
SRC  = 'public/templates/Client_Empathy_Map_A3_Printable_1.docx'
DEST = 'public/templates/filled/Client_Empathy_Map_A3_Printable_1.docx'
xml = load_xml(SRC)

# Replace _____ blanks for header fields
BLANK_REPLACEMENTS = [
    (r'Account Name: _{3,}',          'Account Name: {account_name}'),
    (r'Project / Engagement: _{3,}',  'Project / Engagement: {project_name}'),
    (r'Date Created: _{3,}',          'Date Created: {date_created}'),
    (r'First Real Use Date: _{3,}',   'First Real Use Date: {first_use_date}'),
]
for pattern, repl in BLANK_REPLACEMENTS:
    new_xml, n = re.subn(pattern, repl, xml)
    if n:
        xml = new_xml
        print(f'  OK {repl.split(":")[0].strip()} (replaced {n}x)')
    else:
        print(f'  WARN: not found — {pattern}')

# Replace Q-section answer labels with placeholders
Q_FIELDS = [
    ('Operational goal:',                    '{q1_operational_goal}'),
    ('Regulatory / compliance goal:',        '{q1_compliance_goal}'),
    ('Unspoken / political goal:',           '{q1_unspoken_goal}'),
    ('Add itional notes / context:',         '{q1_notes}'),
    ('Additional notes / context:',          '{q1_notes}'),
    ('Operational fear:',                    '{q2_operational_fear}'),
    ('Regulatory / audit fear:',             '{q2_regulatory_fear}'),
    ('Career / reputational fear:',          '{q2_career_fear}'),
    ('Extreme / worst-case scenario:',       '{q2_worst_case}'),
    ('Business / impact metric:',            '{q3_business_metric}'),
    ('Audit / compliance signal:',           '{q3_audit_signal}'),
    ('Unspoken KPI (their real measure):',   '{q3_unspoken_kpi}'),
    ('What would they tell their MD',        '{q3_md_report}'),
    ('Key hidden influencer:',               '{q4_hidden_influencer}'),
    ('Regulatory / oversight body:',         '{q4_regulatory_body}'),
    ('External pressure creator:',           '{q4_pressure_creator}'),
    ('Who escalates fastest',               '{q4_fastest_escalator}'),
]

for label, placeholder in Q_FIELDS:
    # Find the paragraph containing this label and inject placeholder AFTER it
    pattern = r'(<w:p\b[^>]*>(?:(?!</w:p>).)*?' + re.escape(label[:20]) + r'.*?</w:p>)'
    m = re.search(pattern, xml, re.DOTALL)
    if m:
        old_para = m.group(0)
        # Append a new paragraph with the placeholder immediately after this label para
        new_content = old_para + f'<w:p><w:r><w:t>{placeholder}</w:t></w:r></w:p>'
        xml = xml.replace(old_para, new_content, 1)
        print(f'  OK {label[:35]} → {placeholder}')
        break  # Handle duplicates carefully - only first Q_FIELDS matched per label

# Re-run for remaining Q fields (some may have been skipped due to break)
# Actually let me redo this without the break
xml = load_xml(SRC)
for pattern, repl in BLANK_REPLACEMENTS:
    xml = re.sub(pattern, repl, xml)

done_labels = set()
for label, placeholder in Q_FIELDS:
    if label in done_labels:
        continue
    pattern = r'(<w:p\b[^>]*>(?:(?!</w:p>).)*?' + re.escape(label[:18]) + r'.*?</w:p>)'
    m = re.search(pattern, xml, re.DOTALL)
    if m:
        old_para = m.group(0)
        new_content = old_para + f'<w:p><w:r><w:t>{placeholder}</w:t></w:r></w:p>'
        xml = xml.replace(old_para, new_content, 1)
        done_labels.add(label)
        print(f'  OK {label[:35]} → {placeholder}')
    else:
        print(f'  WARN: {label[:35]}')

save_docx(SRC, DEST, xml)
verify(DEST)


# ─────────────────────────────────────────────────────────────
# 4. SmartCity Stakeholder Mapping
# ─────────────────────────────────────────────────────────────
print('\n=== Stakeholder Mapping ===')
SRC  = 'public/templates/SmartCity_Stakeholder_Mapping_Blank_Template.docx'
DEST = 'public/templates/filled/SmartCity_Stakeholder_Mapping_Blank_Template.docx'
xml = load_xml(SRC)

rows_all = re.findall(r'<w:tr\b[^>]*>.*?</w:tr>', xml, re.DOTALL)

def get_cell_text(cell):
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', cell)).strip()

# Header table: first row = Project Name | City/Location | Contract Value | Timeline | Prepared By | Date
# Second row = empty values
HEADER_MAP = [
    ('Project Name',    'project_name'),
    ('City / Location', 'city_location'),
    ('Contract Value',  'contract_value'),
    ('Timeline',        'timeline'),
    ('Prepared By',     'prepared_by'),
    ('Date',            'header_date'),
]

for i, row in enumerate(rows_all):
    cells = re.findall(r'<w:tc\b[^>]*>.*?</w:tc>', row, re.DOTALL)
    texts = [get_cell_text(c) for c in cells]

    # Header label row
    if 'Project Name' in texts and 'City / Location' in texts:
        # Next row is the value row
        if i + 1 < len(rows_all):
            val_row = rows_all[i + 1]
            val_cells = re.findall(r'<w:tc\b[^>]*>.*?</w:tc>', val_row, re.DOTALL)
            for j, (_, var) in enumerate(HEADER_MAP):
                if j < len(val_cells):
                    old_cell = val_cells[j]
                    new_cell = re.sub(
                        r'(<w:p\b[^>]*>).*?(</w:p>)',
                        rf'\1<w:r><w:t>{{{var}}}</w:t></w:r>\2',
                        old_cell, count=1, flags=re.DOTALL
                    )
                    xml = xml.replace(old_cell, new_cell, 1)
            print(f'  OK header fields (project_name, city, contract, timeline, prepared_by, date)')

    # Section 1 — Project Scenario table: "Project Scenario / Title" row → value in next cell
    elif len(texts) >= 2 and 'Project Scenario / Title' in texts[0]:
        old_cell = cells[1]
        new_cell = re.sub(
            r'(<w:p\b[^>]*>).*?(</w:p>)',
            r'\1<w:r><w:t>{project_scenario}</w:t></w:r>\2',
            old_cell, count=1, flags=re.DOTALL
        )
        xml = xml.replace(old_cell, new_cell, 1)
        print('  OK project_scenario')

    elif len(texts) >= 2 and texts[0] == 'City / Population':
        old_cell = cells[1]
        new_cell = re.sub(r'(<w:p\b[^>]*>).*?(</w:p>)',
                          r'\1<w:r><w:t>{city_population}</w:t></w:r>\2',
                          old_cell, count=1, flags=re.DOTALL)
        xml = xml.replace(old_cell, new_cell, 1)
        print('  OK city_population')

    elif len(texts) >= 2 and texts[0] == 'Project Scope':
        old_cell = cells[1]
        new_cell = re.sub(r'(<w:p\b[^>]*>).*?(</w:p>)',
                          r'\1<w:r><w:t>{project_scope}</w:t></w:r>\2',
                          old_cell, count=1, flags=re.DOTALL)
        xml = xml.replace(old_cell, new_cell, 1)
        print('  OK project_scope')

    elif len(texts) >= 2 and 'Our Role' in texts[0]:
        old_cell = cells[1]
        new_cell = re.sub(r'(<w:p\b[^>]*>).*?(</w:p>)',
                          r'\1<w:r><w:t>{our_role}</w:t></w:r>\2',
                          old_cell, count=1, flags=re.DOTALL)
        xml = xml.replace(old_cell, new_cell, 1)
        print('  OK our_role')

    elif len(texts) >= 2 and 'Critical Success Factor' in texts[0]:
        old_cell = cells[1]
        new_cell = re.sub(r'(<w:p\b[^>]*>).*?(</w:p>)',
                          r'\1<w:r><w:t>{critical_success_factor}</w:t></w:r>\2',
                          old_cell, count=1, flags=re.DOTALL)
        xml = xml.replace(old_cell, new_cell, 1)
        print('  OK critical_success_factor')

    elif len(texts) >= 2 and 'Key Lesson / Risk Flag' in texts[0]:
        old_cell = cells[1]
        new_cell = re.sub(r'(<w:p\b[^>]*>).*?(</w:p>)',
                          r'\1<w:r><w:t>{key_risk_flag}</w:t></w:r>\2',
                          old_cell, count=1, flags=re.DOTALL)
        xml = xml.replace(old_cell, new_cell, 1)
        print('  OK key_risk_flag')

    # Section 2 — Stakeholder Register rows (SPV, Municipal Commissioner, etc.)
    elif len(texts) >= 4 and texts[0] in [
        'SPV (Special Purpose Vehicle)', 'Municipal Commissioner',
        "Chief Minister's Office", 'State IT Secretary', 'MoHUA (Central Govt)',
        'Finance / Audit Dept', 'DISCOM', 'PWD (Roads Dept)',
        'Ward Councillors', 'Citizens / Public', 'Media', 'Delivery Team (MSP)'
    ]:
        slug = texts[0].lower().replace('/', '').replace('(', '').replace(')', '').replace(' ', '_')[:20]
        for ci, suffix in [(1, 'power'), (2, 'interest'), (3, 'risk')]:
            if ci < len(cells):
                old_cell = cells[ci]
                new_cell = re.sub(r'(<w:p\b[^>]*>).*?(</w:p>)',
                                  rf'\1<w:r><w:t>{{{slug}_{suffix}}}</w:t></w:r>\2',
                                  old_cell, count=1, flags=re.DOTALL)
                xml = xml.replace(old_cell, new_cell, 1)
        print(f'  OK stakeholder: {texts[0][:30]}')

save_docx(SRC, DEST, xml)
verify(DEST)

print('\n✅ All placeholder templates created.')
