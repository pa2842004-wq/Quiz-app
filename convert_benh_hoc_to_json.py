import json
import os
import re
import sys


# ============================================================
# CẤU HÌNH
# ============================================================

INPUT_FILE = "benh_hoc.md"
OUTPUT_FILE = "data/questions_benh_hoc.json"

EXPECTED_QUESTION_COUNT = 454

OPTION_LABELS = ["A", "B", "C", "D"]


# ============================================================
# HÀM TIỆN ÍCH
# ============================================================

def normalize_text(text: str) -> str:
    """
    Chuẩn hóa khoảng trắng nhưng không thay đổi nội dung.
    """

    # Loại bỏ soft hyphen
    text = text.replace("\xad", "")

    # Chuẩn hóa khoảng trắng đầu/cuối
    text = text.strip()

    # Nhiều khoảng trắng liên tiếp -> 1 khoảng trắng
    text = re.sub(r"[ \t]+", " ", text)

    return text


def is_skippable(line: str) -> bool:
    """
    Bỏ qua:
    - dòng trống
    - heading Markdown
    - placeholder ảnh
    """

    s = line.strip()

    if not s:
        return True

    if s.startswith("#"):
        return True

    if s.startswith("!["):
        return True

    if "[image" in s:
        return True

    return False


# ============================================================
# NHẬN DIỆN CÂU HỎI
# ============================================================

QUESTION_PATTERNS = [
    # Câu 1. Nội dung
    re.compile(r"^Câu\s+(\d+)\.\s*(.*)$", re.IGNORECASE),

    # Câu 1 Nội dung
    re.compile(r"^Câu\s+(\d+)\s+(.*)$", re.IGNORECASE),

    # 1. Nội dung
    re.compile(r"^(\d+)\.\s*(.*)$"),
]


def parse_question_header(line: str):
    """
    Trả về:
        (question_number, question_text)
    hoặc:
        None
    """

    s = normalize_text(line)

    for pattern in QUESTION_PATTERNS:
        match = pattern.match(s)

        if match:
            number = int(match.group(1))
            text = normalize_text(match.group(2))

            return number, text

    return None


# ============================================================
# NHẬN DIỆN ĐÁP ÁN
# ============================================================

def parse_option(line: str):
    """
    Nhận dạng:

    = Đáp án đúng
    ~ Đáp án sai

    Cho phép:
    =text
    = text
    ~text
    ~ text

    Trả về:
        (text, is_correct)
    hoặc:
        None
    """

    s = line.strip()

    if s.startswith("="):
        text = normalize_text(s[1:])
        return text, True

    if s.startswith("~"):
        text = normalize_text(s[1:])
        return text, False

    return None


# ============================================================
# PARSER CHÍNH
# ============================================================

def parse_questions(lines):
    questions = []

    current_number = None
    current_question_lines = []
    current_options = []

    errors = []

    def save_current():
        nonlocal current_number
        nonlocal current_question_lines
        nonlocal current_options

        if current_number is None:
            return

        question_text = " ".join(
            normalize_text(line)
            for line in current_question_lines
            if normalize_text(line)
        )

        # ----------------------------------------------------
        # Kiểm tra câu hỏi rỗng
        # ----------------------------------------------------

        if not question_text:
            errors.append(
                f"Câu {current_number}: không có nội dung câu hỏi."
            )

        # ----------------------------------------------------
        # Kiểm tra số lượng đáp án
        # ----------------------------------------------------

        if len(current_options) != 4:
            errors.append(
                f"Câu {current_number}: có "
                f"{len(current_options)} lựa chọn, yêu cầu đúng 4."
            )

        # ----------------------------------------------------
        # Kiểm tra số đáp án đúng
        # ----------------------------------------------------

        correct_count = sum(
            1 for _, is_correct in current_options
            if is_correct
        )

        if correct_count != 1:
            errors.append(
                f"Câu {current_number}: có "
                f"{correct_count} đáp án đúng, yêu cầu đúng 1."
            )

        # ----------------------------------------------------
        # Chỉ tạo dữ liệu nếu cấu trúc hợp lệ
        # ----------------------------------------------------

        if (
            question_text
            and len(current_options) == 4
            and correct_count == 1
        ):
            options = {}

            correct_answer = None

            for index, (text, is_correct) in enumerate(
                current_options
            ):
                label = OPTION_LABELS[index]

                options[label] = text

                if is_correct:
                    correct_answer = label

            questions.append(
                {
                    "id": current_number,
                    "question": question_text,
                    "options": options,
                    "answer": correct_answer,
                }
            )

        # Reset
        current_number = None
        current_question_lines = []
        current_options = []

    # ========================================================
    # DUYỆT TOÀN BỘ FILE
    # ========================================================

    for line_number, raw_line in enumerate(lines, start=1):

        line = raw_line.rstrip("\n\r")

        if is_skippable(line):
            continue

        # ----------------------------------------------------
        # Kiểm tra có phải câu hỏi mới không
        # ----------------------------------------------------

        question = parse_question_header(line)

        if question is not None:

            # Lưu câu trước
            save_current()

            current_number, question_text = question

            current_question_lines = []

            if question_text:
                current_question_lines.append(
                    question_text
                )

            current_options = []

            continue

        # ----------------------------------------------------
        # Kiểm tra đáp án = / ~
        # ----------------------------------------------------

        option = parse_option(line)

        if option is not None:

            if current_number is None:
                errors.append(
                    f"Dòng {line_number}: "
                    f"tìm thấy đáp án nhưng chưa có câu hỏi."
                )
                continue

            text, is_correct = option

            if not text:
                errors.append(
                    f"Câu {current_number}, dòng "
                    f"{line_number}: đáp án rỗng."
                )
                continue

            current_options.append(
                (text, is_correct)
            )

            continue

        # ----------------------------------------------------
        # Dòng không phải câu hỏi hoặc đáp án
        #
        # Nếu chưa bắt đầu đáp án:
        # → xem là phần tiếp theo của câu hỏi.
        #
        # Điều này rất quan trọng với những câu như:
        #
        # Câu 439...
        # Chị được kê đơn:
        # 1. Ceftriaxon...
        # 2. Doxycycline...
        # ...
        #
        # Các dòng này sẽ được giữ trong question.
        # ----------------------------------------------------

        if current_number is not None:

            if len(current_options) == 0:

                current_question_lines.append(
                    normalize_text(line)
                )

            else:

                errors.append(
                    f"Câu {current_number}, dòng "
                    f"{line_number}: xuất hiện nội dung "
                    f"sau khi danh sách đáp án đã bắt đầu: "
                    f"{line[:100]}"
                )

    # Lưu câu cuối cùng
    save_current()

    return questions, errors


# ============================================================
# KIỂM TRA ID
# ============================================================

def validate_question_ids(questions, errors):
    """
    Kiểm tra:
    - ID trùng
    - ID bị thiếu trong khoảng dữ liệu
    """

    ids = [q["id"] for q in questions]

    duplicated = sorted(
        {
            question_id
            for question_id in ids
            if ids.count(question_id) > 1
        }
    )

    if duplicated:
        errors.append(
            "ID câu hỏi bị trùng: "
            + ", ".join(map(str, duplicated))
        )

    if ids:
        min_id = min(ids)
        max_id = max(ids)

        expected_ids = set(
            range(min_id, max_id + 1)
        )

        missing_ids = sorted(
            expected_ids - set(ids)
        )

        if missing_ids:
            errors.append(
                "ID câu hỏi bị thiếu: "
                + ", ".join(map(str, missing_ids))
            )


# ============================================================
# KIỂM TRA TOÀN BỘ JSON
# ============================================================

def validate_questions(questions, errors):

    for q in questions:

        # ID
        if not isinstance(q["id"], int):
            errors.append(
                f"Câu {q['id']}: ID không phải số."
            )

        # Question
        if not q["question"].strip():
            errors.append(
                f"Câu {q['id']}: nội dung rỗng."
            )

        # Options
        options = q["options"]

        if set(options.keys()) != set(OPTION_LABELS):
            errors.append(
                f"Câu {q['id']}: "
                f"không có đủ A, B, C, D."
            )

        # Answer
        if q["answer"] not in OPTION_LABELS:
            errors.append(
                f"Câu {q['id']}: "
                f"đáp án '{q['answer']}' không hợp lệ."
            )


# ============================================================
# IN THỐNG KÊ
# ============================================================

def print_statistics(questions, errors):

    print()
    print("=" * 70)
    print("THỐNG KÊ BỘ CÂU HỎI BỆNH HỌC")
    print("=" * 70)

    print(f"Tổng câu hợp lệ : {len(questions)}")
    print(f"Lỗi phát hiện   : {len(errors)}")

    if questions:
        print(
            f"ID nhỏ nhất    : {min(q['id'] for q in questions)}"
        )

        print(
            f"ID lớn nhất    : {max(q['id'] for q in questions)}"
        )

    print("=" * 70)


# ============================================================
# MAIN
# ============================================================

def main():

    print("=" * 70)
    print("CONVERT BỆNH HỌC → JSON")
    print("=" * 70)

    # --------------------------------------------------------
    # Kiểm tra file đầu vào
    # --------------------------------------------------------

    if not os.path.exists(INPUT_FILE):

        print()
        print(f"[LỖI] Không tìm thấy file:")
        print(f"      {INPUT_FILE}")
        print()
        print("Hãy đặt file Markdown Bệnh học cùng thư mục")
        print("với script này.")
        sys.exit(1)

    print()
    print(f"File đầu vào : {INPUT_FILE}")
    print(f"File đầu ra  : {OUTPUT_FILE}")

    # --------------------------------------------------------
    # Đọc file
    # --------------------------------------------------------

    with open(
        INPUT_FILE,
        "r",
        encoding="utf-8"
    ) as f:

        lines = f.readlines()

    print()
    print(f"Đã đọc {len(lines)} dòng.")

    # --------------------------------------------------------
    # Parse
    # --------------------------------------------------------

    print()
    print("Đang phân tích...")

    questions, errors = parse_questions(lines)

    # --------------------------------------------------------
    # Kiểm tra ID
    # --------------------------------------------------------

    validate_question_ids(
        questions,
        errors
    )

    # --------------------------------------------------------
    # Kiểm tra dữ liệu
    # --------------------------------------------------------

    validate_questions(
        questions,
        errors
    )

    # --------------------------------------------------------
    # Kiểm tra số lượng dự kiến
    # --------------------------------------------------------

    if len(questions) != EXPECTED_QUESTION_COUNT:

        errors.append(
            f"Số câu hợp lệ là {len(questions)}, "
            f"nhưng dự kiến {EXPECTED_QUESTION_COUNT}."
        )

    # --------------------------------------------------------
    # In thống kê
    # --------------------------------------------------------

    print_statistics(
        questions,
        errors
    )

    # --------------------------------------------------------
    # Nếu có lỗi → KHÔNG ghi JSON
    # --------------------------------------------------------

    if errors:

        print()
        print("⚠️ PHÁT HIỆN LỖI")
        print("-" * 70)

        for error in errors:

            print(f"- {error}")

        print()
        print(
            "JSON CHƯA ĐƯỢC TẠO vì dữ liệu chưa đạt "
            "điều kiện an toàn."
        )

        print()
        print(
            "Hãy sửa các lỗi trên rồi chạy lại script."
        )

        sys.exit(2)

    # --------------------------------------------------------
    # Tạo thư mục data
    # --------------------------------------------------------

    output_dir = os.path.dirname(
        OUTPUT_FILE
    )

    if output_dir:
        os.makedirs(
            output_dir,
            exist_ok=True
        )

    # --------------------------------------------------------
    # Ghi JSON
    # --------------------------------------------------------

    with open(
        OUTPUT_FILE,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            questions,
            f,
            ensure_ascii=False,
            indent=2
        )

    # --------------------------------------------------------
    # Thành công
    # --------------------------------------------------------

    print()
    print("=" * 70)
    print("✅ CHUYỂN ĐỔI THÀNH CÔNG")
    print("=" * 70)

    print(
        f"Đã tạo: {OUTPUT_FILE}"
    )

    print(
        f"Tổng số câu: {len(questions)}"
    )

    # --------------------------------------------------------
    # Hiển thị 3 câu đầu
    # --------------------------------------------------------

    print()
    print("--- 3 CÂU ĐẦU ---")

    for q in questions[:3]:

        print()
        print(
            f"Câu {q['id']}: "
            f"{q['question'][:100]}"
        )

        for label, text in q["options"].items():

            marker = (
                "✓"
                if label == q["answer"]
                else " "
            )

            print(
                f"  {marker} {label}. {text[:100]}"
            )

    # --------------------------------------------------------
    # Hiển thị 3 câu cuối
    # --------------------------------------------------------

    print()
    print("--- 3 CÂU CUỐI ---")

    for q in questions[-3:]:

        print()
        print(
            f"Câu {q['id']}: "
            f"{q['question'][:100]}"
        )

        for label, text in q["options"].items():

            marker = (
                "✓"
                if label == q["answer"]
                else " "
            )

            print(
                f"  {marker} {label}. {text[:100]}"
            )

    print()
    print("=" * 70)
    print("HOÀN TẤT")
    print("=" * 70)


if __name__ == "__main__":
    main()