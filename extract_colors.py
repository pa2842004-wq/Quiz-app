import json
data = json.load(open('d:/quiz-app/data/questions.json', encoding='utf-8'))
res = []
for q in data:
    q_text = q['question']
    if 'màu' in q_text.lower():
        ans_key = q['answer']
        opts = q.get('options', {})
        if ans_key in opts:
            ans_text = opts[ans_key]
            res.append(f'Q: {q_text} ===> A: {ans_text}')
print('\n'.join(res))
