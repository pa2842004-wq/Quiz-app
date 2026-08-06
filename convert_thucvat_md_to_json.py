"""
Script chuyển đổi file markdown "Tài liệu không có tiêu đề (1).md"
sang định dạng JSON cho app quiz.

Định dạng markdown:
- "1. Câu hỏi" (số + dấu chấm, có thể có/có không khoảng trắng sau dấu chấm) → câu hỏi
- Dòng ngay sau câu hỏi mà không có tiền tố = / ~, không phải tiêu đề ảnh,
  không phải dòng trống → mô tả bổ sung cho câu hỏi (gộp vào question)
- "= text" (có hoặc không khoảng trắng) → đáp án đúng
- "~ text" (có hoặc không khoảng trắng) → lựa chọn sai
- Bỏ qua: heading (#), dòng trống, dòng chỉ chứa ![…][imageN] (placeholder ảnh)
- Bảng markdown (| ... |) → tách thành nhiều dòng con theo <br> rồi xử lý tuần tự
"""

import json
import os
import re
import sys

INPUT_FILE = "Tài liệu không có tiêu đề (1).md"
OUTPUT_FILE = "data/questions_thucvat_duoclieu.json"
START_ID = 1  # ID bắt đầu cho câu hỏi đầu tiên

OPTION_LABELS = ["A", "B", "C", "D"]


def is_skippable(line: str) -> bool:
    """Bỏ qua heading, dòng trống, placeholder ảnh."""
    s = line.strip()
    if not s:
        return True
    if s.startswith("#"):
        return True
    if s.startswith("![") or s.startswith("[]") or "[image" in s:
        return True
    return False


def expand_table_row(line: str) -> list[str]:
    """Tách một dòng bảng markdown thành nhiều dòng con.

    Một dòng bảng có thể chứa nhiều đoạn ngăn bằng <br> hoặc <br/>.
    """
    s = line.strip()
    if not (s.startswith("|") and s.endswith("|")):
        return [line]
    inner = s[1:-1]
    parts = re.split(r"<br\s*/?>", inner)
    return [p.strip() for p in parts if p.strip()]


def parse_questions(lines: list[str]) -> list[dict]:
    """Parse danh sách dòng markdown thành danh sách câu hỏi theo schema chuẩn."""
    questions = []
    current_q_num: int | None = None
    current_question: str | None = None
    current_options: list[tuple[str, bool]] = []  # (text, is_correct)

    question_pattern = re.compile(r"^(\d+)\. ?(.*)$")

    def save_current():
        nonlocal current_q_num, current_question, current_options
        if current_question is None or current_q_num is None:
            return

        if len(current_options) < 2:
            print(f"  [CANH BAO] Câu {current_q_num} '{current_question[:50]}...' "
                  f"co it hon 2 lua chon, bo qua.")
            current_q_num = None
            current_question = None
            current_options = []
            return

        correct_idx = None
        for i, (_, is_correct) in enumerate(current_options):
            if is_correct:
                correct_idx = i
                break

        if correct_idx is None:
            print(f"  [CANH BAO] Câu {current_q_num} '{current_question[:50]}...' "
                  f"khong co dap an dung (=), bo qua.")
            current_q_num = None
            current_question = None
            current_options = []
            return

        # Chỉ giữ tối đa 4 lựa chọn (schema A-D). Ưu tiên giữ đáp án đúng
        # rồi lấy 3 lựa chọn sai theo thứ tự xuất hiện.
        if len(current_options) > 4:
            correct_opt = next(((t, c) for t, c in current_options if c), None)
            wrong_opts = [opt for opt in current_options if not opt[1]][:3]
            if correct_opt is not None:
                kept_options = wrong_opts + [correct_opt]
            else:
                kept_options = current_options[:4]
        else:
            kept_options = current_options

        correct_idx_kept = None
        for i, (_, is_correct) in enumerate(kept_options):
            if is_correct:
                correct_idx_kept = i
                break

        options = {}
        for i, (text, _) in enumerate(kept_options):
            options[OPTION_LABELS[i]] = text

        answer = OPTION_LABELS[correct_idx_kept]

        questions.append({
            "id": current_q_num,
            "question": current_question,
            "options": options,
            "answer": answer,
        })

        current_q_num = None
        current_question = None
        current_options = []

    def process_line(line: str) -> None:
        nonlocal current_q_num, current_question, current_options

        # Bo soft hyphen (\xad) o dau dong.
        s = line.lstrip("\xad").lstrip()
        # Bo backslash o dau (truong hop "\\= text")
        if s.startswith("\\"):
            s = s[1:].lstrip()
        # Bo backslash o giua sau mot day so (truong hop "1\\. ...")
        if re.match(r"^\d+\\", s):
            s = re.sub(r"^(\d+)\\", r"\1", s)
        norm_line = s.strip()

        m = question_pattern.match(norm_line)
        if m:
            save_current()
            current_q_num = int(m.group(1))
            current_question = m.group(2).strip()
            current_options = []
            return

        # Neu khong phai cau hoi, kiem tra = / ~
        if s.startswith("=") or s.startswith("~"):
            if current_question is not None:
                if s.startswith("="):
                    text = s.lstrip("=").strip()
                    if text and not any(c for _, c in current_options):
                        current_options.append((text, True))
                else:
                    text = s.lstrip("~").strip()
                    if text:
                        wrong_count = sum(1 for _, c in current_options if not c)
                        if wrong_count < 3:
                            current_options.append((text, False))
            return

        # Neu khong phai lua chon va chua co lua chon nao, gop dong mo ta
        # vao noi dung cau hoi.
        if current_question is not None and not current_options:
            current_question = f"{current_question} {s}"
            return

    for raw in lines:
        line = raw.rstrip()
        if is_skippable(line):
            continue

        # Neu la dong bang markdown, tach thanh nhieu dong con.
        if line.lstrip().startswith("|"):
            for sub in expand_table_row(line):
                process_line(sub)
            continue

        process_line(line)

    save_current()
    return questions


def main():
    print("=" * 60)
    print("  Chuyen doi Tai lieu khong co tieu de (1).md -> JSON")
    print("=" * 60)

    if not os.path.exists(INPUT_FILE):
        print(f"Khong tim thay file: {INPUT_FILE}")
        sys.exit(1)
    print(f"\nTim thay file: {INPUT_FILE}")

    with open(INPUT_FILE, encoding="utf-8") as f:
        lines = f.readlines()
    print(f"\nDoc duoc {len(lines)} dong tu markdown")

    print("\nDang phan tich cau hoi...")
    new_questions = parse_questions(lines)
    print(f"  -> Tim duoc {len(new_questions)} cau hoi hop le")

    if not new_questions:
        print("Khong tim duoc cau hoi nao. Kiem tra lai file dau vao.")
        sys.exit(1)

    if START_ID != 1:
        for i, q in enumerate(new_questions):
            q["id"] = START_ID + i

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(new_questions, f, ensure_ascii=False, indent=2)

    print(f"\nDa ghi {len(new_questions)} cau hoi vao: {OUTPUT_FILE}")

    print("\n--- Mau 3 cau dau ---")
    for q in new_questions[:3]:
        print(f"\n  ID {q['id']}: {q['question'][:80]}")
        for key, val in q["options"].items():
            marker = "DUNG" if key == q["answer"] else "    "
            print(f"  {marker} {key}. {val[:60]}")

    print("\n--- Mau 3 cau cuoi ---")
    for q in new_questions[-3:]:
        print(f"\n  ID {q['id']}: {q['question'][:80]}")
        for key, val in q["options"].items():
            marker = "DUNG" if key == q["answer"] else "    "
            print(f"  {marker} {key}. {val[:60]}")

    print("\n" + "=" * 60)
    print("  Hoan thanh!")
    print("=" * 60)


if __name__ == "__main__":
    main()