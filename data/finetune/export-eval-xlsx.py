"""Export test.jsonl to an Excel evaluation file using only the standard library."""
from __future__ import annotations
import json
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent
src = ROOT / "test.jsonl"
dst = ROOT / "test-eval-v2.xlsx"
dst_xls = ROOT / "test-eval.xls"
rows = []
for line in src.read_text(encoding="utf-8").splitlines():
    if not line.strip():
        continue
    sample = json.loads(line)
    user = next(m["content"] for m in sample["messages"] if m["role"] == "user")
    expected = json.loads(next(m["content"] for m in sample["messages"] if m["role"] == "assistant"))
    rows.append([len(rows) + 1, user, json.dumps(expected, ensure_ascii=False), expected["intent"], json.dumps(expected.get("todos", []), ensure_ascii=False), json.dumps(expected.get("knowledge"), ensure_ascii=False), expected.get("reply", "")])

headers = ["id", "input", "expected_output", "intent", "todos", "knowledge", "reply"]
def cell(value):
    return f'<c t="inlineStr"><is><t>{escape(str(value))}</t></is></c>'
def row(values, number):
    return f'<row r="{number}">' + "".join(cell(v) for v in values) + "</row>"

sheet = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + row(headers, 1)
for i, values in enumerate(rows, 2):
    sheet += row(values, i)
sheet += "</sheetData></worksheet>"
content_types = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'''
rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'''
workbook = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="evaluation" sheetId="1" r:id="rId1"/></sheets></workbook>'''
workbook_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'''
styles = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="0"/><fonts count="1"><font><sz val="11"/><color theme="1"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'''
sheet_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="../styles.xml"/></Relationships>'''
core = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>UniFlow evaluation set</dc:title></cp:coreProperties>'''
app = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>UniFlow</Application></Properties>'''
with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", content_types)
    z.writestr("_rels/.rels", rels)
    z.writestr("xl/workbook.xml", workbook)
    z.writestr("xl/_rels/workbook.xml.rels", workbook_rels)
    z.writestr("xl/styles.xml", styles)
    z.writestr("xl/worksheets/_rels/sheet1.xml.rels", sheet_rels)
    z.writestr("xl/worksheets/sheet1.xml", sheet)
    z.writestr("docProps/core.xml", core)
    z.writestr("docProps/app.xml", app)
print(f"wrote {dst} ({len(rows)} rows)")

# 兼容只接受 .xls 扩展名的入口：输出 Excel 2003 XML（SpreadsheetML），
# 该格式可由 Excel/WPS 直接打开并另存为真正的二进制 .xls。
def xml_cell(value):
    return f'<Cell><Data ss:Type="String">{escape(str(value))}</Data></Cell>'
xml = '''<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="evaluation"><Table>'''
xml += '<Row>' + ''.join(xml_cell(h) for h in headers) + '</Row>'
for values in rows:
    xml += '<Row>' + ''.join(xml_cell(v) for v in values) + '</Row>'
xml += '</Table></Worksheet></Workbook>'
dst_xls.write_text(xml, encoding='utf-8')
print(f"wrote {dst_xls} ({len(rows)} rows)")
