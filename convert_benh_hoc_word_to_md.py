"""
convert_benh_hoc_word_to_md.py

Chuyển file Word (.docx) bộ câu hỏi Bệnh học sang Markdown
để dùng tiếp với convert_benh_hoc_to_json.py.

Đặc điểm format dự kiến của file Bệnh học:
    Câu 1. Nội dung câu hỏi
    = Đáp án đúng
    ~ Đáp án sai
    ~ Đáp án sai
    ~ Đáp án sai

Script:
- Đọc trực tiếp .docx bằng python-docx.
- Giữ thứ tự nội dung.
- Giữ nguyên câu hỏi, đáp án và các dòng mô tả.
- Chuẩn hóa nhẹ khoảng trắng ở đầu/cuối dòng.
- Không tự sửa nội dung chuyên môn.
- Không tự xóa câu hỏi.
- Kiểm tra số câu nhận diện được.
- Báo các câu không có đúng 4 dòng đáp án / không có đúng 1 dấu '='.
- Xuất Markdown và một báo cáo kiểm tra.
"""

from pathlib import Path
import re
import sys

try:
    from docx import Document
except ImportError:
    print("THIEU THU VIEN: python-docx")
    print("Cai bang lenh:")
    print("    pip install python-docx")
    sys.exit(1)


# ============================================================
# CAU HINH
# ============================================================

# Đặt file Word Bệnh học cùng thư mục với script.
INPUT_FILE = "NGÂN HÀNG CÂU HỎI MÔN BỆNH HỌC CĐ DƯỢC K12 123.docx"

# File Markdown đầu ra.
OUTPUT_FILE = "benh_hoc.md"

# Báo cáo kiểm tra.
REPORT_FILE = "benh_hoc_conversion_report.txt"

EXPECTED_QUESTION_COUNT = 454


# ============================================================
# NHẬN DIỆN
# ============================================================

QUESTION_RE = re.compile(
    r"^\s*Câu\s+(\d+)\.\s*(.*)$",
    re.IGNORECASE
)

OPTION_RE = re.compile(r"^\s*([=~])\s*(.*)$")


def normalize_line(text: str) -> str:
    """
    Chỉ bỏ khoảng trắng đầu/cuối và chuẩn hóa khoảng trắng ngang.
    Không sửa nội dung từ ngữ.
    """
    text = text.replace("\xa0", " ")
    text = text.replace("\xad", "")
    text = text.strip()
    text = re.sub(r"[ \t]+", " ", text)
    return text


def is_image_placeholder(text: str) -> bool:
    """
    Nhận diện một số placeholder ảnh thường gặp.
    Không xóa ảnh thật; chỉ bỏ placeholder kỹ thuật.
    """
    s = text.strip()

    if s.startswith("!["):
        return True

    if "[image" in s.lower():
        return True

    return False


def is_page_marker(text: str) -> bool:
    """
    Bỏ các marker trang do quá trình parse/chuyển đổi tạo ra,
    nếu chúng xuất hiện trong văn bản.
    """
    s = text.strip()

    return (
        s.startswith("<PARSED TEXT FOR PAGE:")
        or s.startswith("PAGE ")
    )


# ============================================================
# ĐỌC WORD
# ============================================================

def extract_blocks(doc):
    """
    Lấy nội dung theo thứ tự từ paragraphs.
    Các bảng được chuyển thành các dòng markdown đơn giản.

    Với bộ Bệnh học, phần lớn câu hỏi/đáp án nằm trong paragraph.
    Bảng chỉ được giữ lại dưới dạng text, không cố diễn giải nội dung.
    """

    blocks = []

    # Paragraphs
    for paragraph in doc.paragraphs:
        text = normalize_line(paragraph.text)

        if text:
            blocks.append(text)

    # Tables:
    # Nếu tài liệu có bảng, đọc từng row/cell theo thứ tự.
    # Không tự biến nội dung bảng thành câu hỏi.
    for table in doc.tables:
        for row in table.rows:
            cells = []

            for cell in row.cells:
                cell_text = normalize_line(
                    " ".join(
                        normalize_line(p.text)
                        for p in cell.paragraphs
                        if normalize_line(p.text)
                    )
                )

                cells.append(cell_text)

            row_text = " | ".join(
                cell for cell in cells if cell
            )

            if row_text:
                blocks.append(f"| {row_text} |")

    return blocks


# ============================================================
# PHÂN TÍCH CÂU
# ============================================================

def analyze_blocks(blocks):
    """
    Phân tích cấu trúc câu Bệnh học.

    Không chỉnh sửa dữ liệu.
    Chỉ tạo báo cáo để biết:
    - có bao nhiêu câu
    - câu nào thiếu/thừa đáp án
    - câu nào có != 1 đáp án đúng
    - câu nào có nội dung xuất hiện sau khi đáp án đã bắt đầu
    """

    questions = []

    current = None
    warnings = []

    def save_current():
        nonlocal current

        if current is None:
            return

        q = current

        correct_count = sum(
            1 for marker, text in q["options"]
            if marker == "="
        )

        option_count = len(q["options"])

        if option_count != 4:
            warnings.append(
                f"Câu {q['number']}: có {option_count} "
                f"lựa chọn, không phải 4."
            )

        if correct_count != 1:
            warnings.append(
                f"Câu {q['number']}: có {correct_count} "
                f"đáp án '='; yêu cầu đúng 1."
            )

        if not q["question_lines"]:
            warnings.append(
                f"Câu {q['number']}: không có nội dung câu hỏi."
            )

        questions.append(q)
        current = None

    for line_index, line in enumerate(blocks, start=1):

        if is_image_placeholder(line):
            # Giữ placeholder ảnh trong báo cáo, nhưng không đưa
            # placeholder kỹ thuật vào Markdown.
            if current is not None:
                current["image_placeholders"].append(
                    (line_index, line)
                )
            continue

        if is_page_marker(line):
            continue

        match = QUESTION_RE.match(line)

        if match:
            save_current()

            current = {
                "number": int(match.group(1)),
                "question_lines": [],
                "options": [],
                "image_placeholders": [],
                "source_line": line_index,
            }

            first_text = normalize_line(match.group(2))

            if first_text:
                current["question_lines"].append(
                    first_text
                )

            continue

        option = OPTION_RE.match(line)

        if option and current is not None:
            marker = option.group(1)
            text = normalize_line(option.group(2))

            if not text:
                warnings.append(
                    f"Câu {current['number']}, dòng {line_index}: "
                    f"đáp án {marker} rỗng."
                )
            else:
                current["options"].append(
                    (marker, text)
                )

            continue

        # Dòng thường.
        # Nếu đã gặp câu hỏi thì giữ nguyên trong phần question,
        # kể cả các dòng như:
        # 1. Ceftriaxon...
        # 2. Doxycycline...
        # Đây là điều quan trọng với các câu nhiều phần.
        if current is not None:
            if current["options"]:
                warnings.append(
                    f"Câu {current['number']}, dòng {line_index}: "
                    f"có nội dung sau khi đáp án đã bắt đầu: "
                    f"{line[:120]}"
                )
            else:
                current["question_lines"].append(line)

    save_current()

    return questions, warnings


# ============================================================
# KIỂM TRA ID
# ============================================================

def validate_ids(questions, warnings):
    ids = [q["number"] for q in questions]

    duplicates = sorted(
        {
            qid for qid in ids
            if ids.count(qid) > 1
        }
    )

    if duplicates:
        warnings.append(
            "ID câu bị trùng: "
            + ", ".join(map(str, duplicates))
        )

    if ids:
        expected = set(range(min(ids), max(ids) + 1))
        missing = sorted(expected - set(ids))

        if missing:
            warnings.append(
                "ID câu bị thiếu trong khoảng: "
                + ", ".join(map(str, missing))
            )


# ============================================================
# GHI MARKDOWN
# ============================================================

def write_markdown(questions, output_path):
    """
    Ghi Markdown theo đúng format mà
    convert_benh_hoc_to_json.py có thể đọc.
    """

    with open(
        output_path,
        "w",
        encoding="utf-8",
        newline="\n"
    ) as f:

        f.write("# Ngân hàng câu hỏi môn Bệnh học\n\n")

        for q in questions:

            f.write(
                f"Câu {q['number']}. "
                f"{' '.join(q['question_lines']).strip()}\n"
            )

            # Giữ placeholder ảnh nếu có.
            # Không tự tạo đường dẫn ảnh.
            for _, image_line in q["image_placeholders"]:
                f.write(f"{image_line}\n")

            for marker, text in q["options"]:
                f.write(f"{marker} {text}\n")

            f.write("\n")


# ============================================================
# GHI BÁO CÁO
# ============================================================

def write_report(
    report_path,
    questions,
    warnings
):
    with open(
        report_path,
        "w",
        encoding="utf-8"
    ) as f:

        f.write(
            "BÁO CÁO CHUYỂN WORD → MARKDOWN - BỆNH HỌC\n"
        )
        f.write("=" * 70 + "\n\n")

        f.write(
            f"Số câu nhận diện được: {len(questions)}\n"
        )
        f.write(
            f"Số câu dự kiến: {EXPECTED_QUESTION_COUNT}\n"
        )
        f.write(
            f"Số cảnh báo: {len(warnings)}\n\n"
        )

        if warnings:
            f.write("CÁC CẢNH BÁO\n")
            f.write("-" * 70 + "\n")

            for warning in warnings:
                f.write(f"- {warning}\n")

        else:
            f.write(
                "Không phát hiện cảnh báo về cấu trúc.\n"
            )


# ============================================================
# MAIN
# ============================================================

def main():

    print("=" * 70)
    print("WORD → MARKDOWN | BỆNH HỌC")
    print("=" * 70)

    input_path = Path(INPUT_FILE)
    output_path = Path(OUTPUT_FILE)
    report_path = Path(REPORT_FILE)

    if not input_path.exists():
        print()
        print("[LOI] Khong tim thay file Word:")
        print(f"      {input_path}")
        print()
        print(
            "Hay dat file Word vao cung thu muc voi script "
            "va dung dung ten INPUT_FILE."
        )
        sys.exit(1)

    print()
    print(f"File Word : {input_path}")
    print(f"Markdown  : {output_path}")
    print(f"Bao cao   : {report_path}")

    print()
    print("Dang doc file Word...")

    try:
        doc = Document(str(input_path))
    except Exception as exc:
        print()
        print("[LOI] Khong doc duoc file Word.")
        print(f"Chi tiet: {exc}")
        sys.exit(1)

    blocks = extract_blocks(doc)

    print(
        f"Da doc {len(blocks)} khoi noi dung."
    )

    print()
    print("Dang kiem tra cau hoi...")

    questions, warnings = analyze_blocks(
        blocks
    )

    validate_ids(
        questions,
        warnings
    )

    print()
    print("=" * 70)
    print("KET QUA KIEM TRA")
    print("=" * 70)

    print(
        f"So cau nhan dien: {len(questions)}"
    )

    print(
        f"So cau du kien  : {EXPECTED_QUESTION_COUNT}"
    )

    print(
        f"So canh bao     : {len(warnings)}"
    )

    # --------------------------------------------------------
    # In cảnh báo
    # --------------------------------------------------------

    if warnings:

        print()
        print("CANH BAO:")
        print("-" * 70)

        # In tối đa 100 cảnh báo ra terminal.
        for warning in warnings[:100]:
            print(f"- {warning}")

        if len(warnings) > 100:
            print(
                f"... con {len(warnings) - 100} canh bao "
                f"xem trong {REPORT_FILE}"
            )

    # --------------------------------------------------------
    # Ghi Markdown
    # --------------------------------------------------------

    write_markdown(
        questions,
        output_path
    )

    write_report(
        report_path,
        questions,
        warnings
    )

    print()
    print("=" * 70)
    print("DA TAO MARKDOWN")
    print("=" * 70)

    print(
        f"File: {output_path}"
    )

    print(
        f"Bao cao: {report_path}"
    )

    if len(questions) == EXPECTED_QUESTION_COUNT:
        print()
        print(
            "✓ Da nhan dien du 454 cau."
        )
    else:
        print()
        print(
            "⚠ So cau khong phai 454."
        )
        print(
            "CHUA nen chuyen sang JSON cho den khi "
            "kiem tra bao cao."
        )

    print()
    print(
        "Luu y: Script khong sua noi dung chuyen mon "
        "va khong tu y bo cau hoi."
    )


if __name__ == "__main__":
    main()
