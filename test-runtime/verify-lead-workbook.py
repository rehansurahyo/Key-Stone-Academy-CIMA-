"""Independent read-only XLSX verification of the application's fake QA export."""
from datetime import datetime
from pathlib import Path
from openpyxl import load_workbook

source = Path(__file__).resolve().parents[1] / 'outputs' / 'lead-export' / 'qa.xlsx'
book = load_workbook(source, data_only=False)
assert book.sheetnames == ['Free trial leads']
sheet = book.active
assert sheet.max_row == 1052 and sheet.max_column == 9
assert sheet['A2'].value == '=HYPERLINK("https://example.invalid")'
assert sheet['A2'].data_type == 's' and sheet['I2'].data_type == 's'
assert sheet['C2'].value == '+923001234567' and sheet['C2'].data_type == 's'
assert sheet['D2'].value == '+92' and sheet['C2'].number_format == '@'
assert sheet['E2'].value == 'Pakistan', 'Phone country must not be confused with residence'
assert sheet['G2'].value == datetime(2026, 10, 23, 3, 30)
assert sheet['A3'].value == 'Ali & Zoë <Test> 😊'
assert sheet['C3'].value == '00390236618300'
assert sheet['I3'].value == 'First line\nSecond line'
assert sheet['I4'].value == 'Unsafe\ufffdcontrol'
assert all(cell.data_type != 'f' for row in sheet for cell in row)
assert sheet.freeze_panes == 'A2' and sheet.auto_filter.ref == 'A1:I1052'
assert sheet['A1'].fill.fgColor.rgb == 'FF0B2545' and sheet['A1'].font.bold
assert sheet['A1'].font.color.rgb == 'FFFFFFFF'
assert sheet.column_dimensions['B'].width >= 30
assert sheet['I3'].alignment.wrap_text
book.close()
print('PASS: independent XLSX reader opens the file without repair; exact data, safe text cells, sortable Karachi dates, phone prefixes/zeros, Unicode, line breaks, styles, filter and frozen header verified')
