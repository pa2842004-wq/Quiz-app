import { byQuestionId } from "./utils.js";
import {
  getDisplayedOptions,
  mapOriginalChoiceToDisplay,
  scoreSession
} from "./quiz.js";

export function buildWrongAnswerReview(questions, session) {
  const questionMap = byQuestionId(questions);
  const summary = scoreSession(session, questions);

  return summary.wrongAnswers.map((item) => {
    const question = questionMap.get(item.id);

    return {
      id: question.id,
      question: question.question,
      options: question.options,
      displayOptions: getDisplayedOptions(question, session, question.id),
      selected: item.selected,
      correct: item.correct,
      selectedDisplay: mapOriginalChoiceToDisplay(session, question.id, item.selected),
      correctDisplay: mapOriginalChoiceToDisplay(session, question.id, item.correct),
      ...(question.explanation ? { explanation: question.explanation } : {})
    };
  });
}
