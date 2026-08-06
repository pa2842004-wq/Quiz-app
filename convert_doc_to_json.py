"""
Script chuyển đổi file Dược.doc sang định dạng questions.json
- Dòng bắt đầu bằng '=' → đáp án đúng
- Dòng bắt đầu bằng '~' → lựa chọn sai
- Dòng bắt đầu bằng số + '.' → câu hỏi
"""

import olefile
import json
import re
import os
import sys

# ===== CẤU HÌNH =====
INPUT_FILE = "Dược.doc"
OUTPUT_FILE = "data/questions.json"
START_ID = 1  # ID bắt đầu cho câu hỏi đầu tiên
# Đặt thành None để tự động nối tiếp từ questions.json hiện có
# Đặt thành số nguyên để ghi đè từ ID đó
# ======================


def extract_text_from_doc(filepath: str) -> list[str]:
    """
    Đọc file .doc (Word 97-2003 OLE format) và trả về danh sách các dòng text.
    """
    ole = olefile.OleFileIO(filepath)
    word_data = ole.openstream("WordDocument").read()
    ole.close()

    # Decode UTF-16-LE (Word lưu text dạng Unicode)
    text = word_data.decode("utf-16-le", errors="replace")

    # Tách thành các dòng
    lines = text.replace("\r", "\n").split("\n")

    # Lọc và làm sạch từng dòng
    cleaned = []
    for line in lines:
        # Loại bỏ ký tự không in được (trừ khoảng trắng)
        clean = "".join(c for c in line if c.isprintable() or c == " ")
        clean = clean.strip()
        if clean:
            cleaned.append(clean)

    return cleaned


def parse_questions(lines: list[str]) -> list[dict]:
    """
    Parse danh sách dòng thành danh sách câu hỏi.

    Định dạng trong file .doc:
    - "1. Câu hỏi..." → câu hỏi mới
    - "= Đáp án đúng" → lựa chọn đúng
    - "~ Lựa chọn sai" → lựa chọn sai

    Trả về danh sách dict với cấu trúc:
    {
        "id": int,
        "question": str,
        "options": {"A": str, "B": str, "C": str, "D": str},
        "answer": str  # "A", "B", "C", hoặc "D"
    }
    """
    questions = []
    option_labels = ["A", "B", "C", "D", "E"]

    current_question = None
    current_options = []  # list of (text, is_correct)

    # Regex nhận dạng dòng câu hỏi: bắt đầu bằng số và dấu chấm
    question_pattern = re.compile(r"^\d+\.\s+(.+)$")

    def save_current():
        """Lưu câu hỏi hiện tại vào danh sách."""
        nonlocal current_question, current_options
        if current_question is None:
            return

        if len(current_options) < 2:
            print(f"  [CẢNH BÁO] Câu hỏi '{current_question[:50]}...' có ít hơn 2 lựa chọn, bỏ qua.")
            current_question = None
            current_options = []
            return

        # Tìm đáp án đúng
        correct_idx = None
        for i, (_, is_correct) in enumerate(current_options):
            if is_correct:
                correct_idx = i
                break

        if correct_idx is None:
            print(f"  [CẢNH BÁO] Câu hỏi '{current_question[:50]}...' không có đáp án đúng (=), bỏ qua.")
            current_question = None
            current_options = []
            return

        # Xây dựng dict options
        options = {}
        for i, (text, _) in enumerate(current_options):
            if i < len(option_labels):
                options[option_labels[i]] = text

        answer = option_labels[correct_idx]

        questions.append({
            "question": current_question,
            "options": options,
            "answer": answer,
        })

        current_question = None
        current_options = []

    for line in lines:
        # Kiểm tra dòng câu hỏi (bắt đầu bằng số + dấu chấm)
        m = question_pattern.match(line)
        if m:
            save_current()
            current_question = m.group(1).strip()
            continue

        # Kiểm tra đáp án đúng (= ...)
        if line.startswith("= "):
            if current_question is not None:
                current_options.append((line[2:].strip(), True))
            continue

        # Kiểm tra lựa chọn sai (~ ...)
        if line.startswith("~ "):
            if current_question is not None:
                current_options.append((line[2:].strip(), False))
            continue

    # Lưu câu hỏi cuối cùng
    save_current()

    return questions


def load_existing_json(filepath: str) -> list[dict]:
    """Đọc file JSON hiện có, trả về danh sách rỗng nếu không tồn tại."""
    if os.path.exists(filepath):
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
        print(f"✓ Đọc được {len(data)} câu hỏi từ file hiện có: {filepath}")
        return data
    return []


def assign_ids(questions: list[dict], start_id: int) -> list[dict]:
    """Gán ID cho danh sách câu hỏi bắt đầu từ start_id."""
    for i, q in enumerate(questions):
        q["id"] = start_id + i
    return questions


def main():
    print("=" * 60)
    print("  Chuyển đổi Dược.doc → questions.json")
    print("=" * 60)

    # 1. Kiểm tra file đầu vào
    if not os.path.exists(INPUT_FILE):
        print(f"❌ Không tìm thấy file: {INPUT_FILE}")
        sys.exit(1)
    print(f"\n✓ Tìm thấy file: {INPUT_FILE}")

    # 2. Đọc và phân tích file .doc
    print("\n📖 Đang đọc file .doc...")
    lines = extract_text_from_doc(INPUT_FILE)
    print(f"  → Trích xuất được {len(lines)} dòng text")

    # 3. Parse câu hỏi
    print("\n🔍 Đang phân tích câu hỏi...")
    new_questions = parse_questions(lines)
    print(f"  → Tìm được {len(new_questions)} câu hỏi hợp lệ")

    if not new_questions:
        print("❌ Không tìm được câu hỏi nào. Kiểm tra lại file đầu vào.")
        sys.exit(1)

    # 4. Tải dữ liệu hiện có
    existing = load_existing_json(OUTPUT_FILE)

    # 5. Xác định start_id
    if START_ID is not None:
        start_id = START_ID
    elif existing:
        start_id = max(q.get("id", 0) for q in existing) + 1
    else:
        start_id = 1
    print(f"\n📌 ID bắt đầu: {start_id}")

    # 6. Gán ID
    new_questions = assign_ids(new_questions, start_id)

    # 7. Kết hợp với dữ liệu cũ (nếu START_ID > 1 thì nối thêm)
    if START_ID == 1:
        # Ghi đè toàn bộ
        final_questions = new_questions
        print(f"\n⚠️  Chế độ: GHI ĐÈ toàn bộ file (START_ID=1)")
    else:
        # Nối thêm vào sau
        final_questions = existing + new_questions
        print(f"\n✅ Chế độ: NỐI THÊM {len(new_questions)} câu hỏi mới vào {len(existing)} câu hiện có")

    # 8. Ghi file JSON
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(final_questions, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Đã ghi {len(final_questions)} câu hỏi vào: {OUTPUT_FILE}")

    # 9. In mẫu 3 câu đầu để kiểm tra
    print("\n--- Mẫu 3 câu đầu ---")
    for q in new_questions[:3]:
        print(f"\n  ID {q['id']}: {q['question'][:60]}...")
        for key, val in q["options"].items():
            marker = "✓" if key == q["answer"] else " "
            print(f"  {marker} {key}. {val[:60]}")

    print("\n" + "=" * 60)
    print("  Hoàn thành!")
    print("=" * 60)


if __name__ == "__main__":
    main()
