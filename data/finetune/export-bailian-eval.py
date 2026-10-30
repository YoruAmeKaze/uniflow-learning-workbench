"""按百炼 Testdata.xlsx 模板生成评测集：Prompt / Completion 两列。"""
from __future__ import annotations
import json
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent
template = Path(r"D:\Downloads\Testdata.xlsx")
output = ROOT / "bailian-eval.xlsx"
if not template.exists():
    raise SystemExit(f"找不到百炼模板：{template}")

values = ["Prompt", "Completion"]
for line in (ROOT / "test.jsonl").read_text(encoding="utf-8").splitlines():
    if not line.strip():
        continue
    sample = json.loads(line)
    values.append(next(m["content"] for m in sample["messages"] if m["role"] == "user"))
    values.append(next(m["content"] for m in sample["messages"] if m["role"] == "assistant"))

shared = '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="%d" uniqueCount="%d">' % (len(values), len(values))
for value in values:
    shared += '<si><t xml:space="preserve">%s</t></si>' % escape(value)
shared += '</sst>'

def cell(ref: str, index: int, style: str = ""):
    s = f' s="{style}"' if style else ''
    return f'<c r="{ref}"{s} t="s"><v>{index}</v></c>'

sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:B%d"/><sheetData>' % (len(values) // 2)
sheet += '<row r="1" spans="1:2" ht="23" customHeight="1">' + cell("A1", 0, "1") + cell("B1", 1, "2") + '</row>'
for row_num in range(2, len(values) // 2 + 1):
    a = (row_num - 1) * 2
    b = a + 1
    sheet += f'<row r="{row_num}" spans="1:2">' + cell(f"A{row_num}", a, "3") + cell(f"B{row_num}", b, "3") + '</row>'
sheet += '</sheetData></worksheet>'

with zipfile.ZipFile(template, "r") as zin, zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        if item.filename == "xl/sharedStrings.xml":
            zout.writestr(item, shared)
        elif item.filename == "xl/worksheets/sheet1.xml":
            zout.writestr(item, sheet)
        else:
            zout.writestr(item, zin.read(item.filename))
print(f"wrote {output} ({len(values) // 2 - 1} rows, Prompt/Completion)")
