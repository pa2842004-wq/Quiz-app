import { randomItem } from "./utils.js";

export const CORRECT_MESSAGES = [
  { emoji: "💖", text: "Trời ơi đúng luôn á, bé giỏi quá làm tim anh tan chảy mất thôi." },
  { emoji: "🌷", text: "Đúng đẹp quá nè, nhìn là biết bé thông minh và đáng yêu số một." },
  { emoji: "✨", text: "Ui mượt ghê á, bé trả lời hay quá nghe mà muốn khen hoài luôn." },
  { emoji: "🍓", text: "Câu này bé làm ngọt xỉu, xứng đáng được thưởng thật nhiều cái thơm." },
  { emoji: "🫶", text: "Đúng rồi đó nha, giỏi như này thì ai mà không mê cho được." },
  { emoji: "🌟", text: "Chuẩn quá luôn, đúng là cục cưng giỏi giang của anh." },
  { emoji: "🎀", text: "Vừa xinh vừa giỏi nữa chứ, bé làm đúng nghe cưng muốn xỉu." },
  { emoji: "🍬", text: "Đáp án này bé chốt ngọt như kẹo luôn, chuẩn ơi là chuẩn." },
  { emoji: "🥰", text: "Đúng rồi nè, thương cái cách bé cố gắng và giỏi lên từng ngày ghê." },
  { emoji: "💫", text: "Câu này bé xử khéo quá trời, nhìn phát là muốn ôm khen liền." },
];

export const WRONG_MESSAGES = [
  { emoji: "🫠", text: "Hơi tiếc một xíu thôi nè, nhưng bé ngoan của anh thử lại là được ngay." },
  { emoji: "💞", text: "Câu này chưa đúng thôi, không sao hết, bé vẫn đáng yêu và cố thêm chút là ra nè." },
  { emoji: "🌷", text: "Sai nhẹ một chút thôi à, bình tĩnh nha bé, mình làm lại là đúng liền." },
  { emoji: "🥺", text: "Hong sao đâu nè, câu này chỉ đang thử thách bé chút xíu thôi đó." },
  { emoji: "🍀", text: "Chưa trúng đáp án rồi, nhưng anh tin bé làm thêm một lần là chuẩn ngay." },
  { emoji: "🫶", text: "Không sao hết á, bé cố gắng vậy là anh thương lắm rồi, mình thử lại nha." },
  { emoji: "🌈", text: "Sai một câu không nói lên gì đâu, bé của anh vẫn giỏi và đáng khen lắm." },
  { emoji: "💗", text: "Ui chưa đúng rồi nè, nhưng không buồn nha, có anh cổ vũ bé đây." },
  { emoji: "✨", text: "Câu này mình lệch một chút thôi, tập trung lại xíu là bé làm được ngay." },
  { emoji: "🎀", text: "Chưa đúng nhưng vẫn cưng lắm, bé thử lại thêm lần nữa nha yêu ơi." },
];

export function showReactionToast(isCorrect) {
  const old = document.getElementById("reaction-toast");
  if (old) old.remove();
  const msg = isCorrect ? randomItem(CORRECT_MESSAGES) : randomItem(WRONG_MESSAGES);
  const toast = document.createElement("div");
  toast.id = "reaction-toast";
  toast.className = isCorrect
    ? "reaction-toast reaction-toast--correct"
    : "reaction-toast reaction-toast--wrong";
  toast.innerHTML = `<span class="toast-emoji">${msg.emoji}</span><span class="toast-text">${msg.text}</span>`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("reaction-toast--show"));
  setTimeout(() => {
    toast.classList.remove("reaction-toast--show");
    setTimeout(() => toast.remove(), 400);
  }, 2600);
}

export function launchConfetti() {
  const colors = [
    "#ff6fa3", "#ff8fb8", "#ffb3d1", "#ffd6e7", // pink
    "#c8a8e9", "#a685d0", "#f0e6fa",             // lavender
    "#ffb088", "#f29466", "#ffe3d2",             // peach
    "#9ed8c6", "#76c2a8", "#dff4ec",             // mint
    "#f7d774", "#fff3cc"                          // lemon
  ];
  for (let i = 0; i < 60; i++) {
    const el = document.createElement("div");
    el.className = "confetti-piece";
    el.style.cssText = [
      `left:${Math.random() * 100}vw`,
      `background:${colors[Math.floor(Math.random() * colors.length)]}`,
      `animation-duration:${0.9 + Math.random() * 1.2}s`,
      `animation-delay:${Math.random() * 0.4}s`,
      `width:${6 + Math.random() * 8}px`,
      `height:${6 + Math.random() * 8}px`,
      `border-radius:${Math.random() > 0.5 ? "50%" : "2px"}`,
    ].join(";");
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }
}

export function shakeCard() {
  const card = document.querySelector(".question-card");
  if (!card) return;
  card.classList.remove("shake-anim");
  void card.offsetWidth;
  card.classList.add("shake-anim");
  setTimeout(() => card.classList.remove("shake-anim"), 600);
}

export function getResultEvaluation(percent) {
  if (percent === 100) return {
    emoji: "🏆", grade: "Hoàn Hảo Luôn!",
    msg: "Ôi trời! Bé đạt 100 điểm rồi!! Tự hào về bé lắm luôn~ Bé là thiên tài ôn bài đó! 🥰",
  };
  if (percent >= 90) return {
    emoji: "🌟", grade: "Xuất Sắc!",
    msg: "Bé giỏi quá trời! Trả lời đúng gần hết rồi đó. Anh hãnh diện về bé lắm~ 💖",
  };
  if (percent >= 75) return {
    emoji: "🎉", grade: "Rất Tốt Bé ơi!",
    msg: "Bé học giỏi lắm rồi! Cố thêm một chút xíu nữa là điểm cao thôi~",
  };
  if (percent >= 60) return {
    emoji: "💪", grade: "Khá Đấy Bé!",
    msg: "Được rồi nhỉ! Tuy nhiên còn mấy câu cần ôn thêm. Bé ôn lại phần sai rồi thử lại nhé~",
  };
  if (percent >= 40) return {
    emoji: "🌱", grade: "Cần Cố Thêm!",
    msg: "Hmm bé ơi, hôm nay chưa tập trung lắm hả? Thử lại một lần nữa nhé, bé làm được mà! 🤗",
  };
  return {
    emoji: "🫂", grade: "Cùng Ôn Lại Nào!",
    msg: "Không sao đâu bé ơi! Lần đầu ai cũng vậy thôi. Bé ôn lại rồi làm lại nhé. Anh tin bé làm được! 💕",
  };
}