import "regenerator-runtime/runtime"; // if needed for async/await in older browsers

// DOM Elements
const chatContainer = document.getElementById("chat-container");
const messageForm = document.getElementById("message-form");
const userInput = document.getElementById("user-input");
const apiSelector = document.getElementById("api-selector");
const newChatBtn = document.getElementById("new-chat-btn");
const surveyModal = document.getElementById("survey-modal");
const surveyQuestion = document.getElementById("survey-question");
const surveyOptions = document.getElementById("survey-options");
const surveySendBtn = document.getElementById("survey-send-btn");

// const BASE_URL = process.env.API_ENDPOINT;
const BASE_URL = "http://localhost:8000";

let db;

async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("myChatDB", 1);
    request.onupgradeneeded = function (e) {
      db = e.target.result;
      if (!db.objectStoreNames.contains("chats")) {
        db.createObjectStore("chats", { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("metadata")) {
        db.createObjectStore("metadata", { keyPath: "key" });
      }
    };
    request.onsuccess = function (e) {
      db = e.target.result;
      resolve();
    };
    request.onerror = function (e) {
      reject(e);
    };
  });
}

async function saveMessage(role, content) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("chats", "readwrite");
    const store = tx.objectStore("chats");
    store.add({ role, content });
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
  });
}

async function getAllMessages() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("chats", "readonly");
    const store = tx.objectStore("chats");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

async function saveMetadata(key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("metadata", "readwrite");
    const store = tx.objectStore("metadata");
    store.put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
  });
}

async function getMetadata(key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("metadata", "readonly");
    const store = tx.objectStore("metadata");
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = (e) => reject(e);
  });
}

async function clearAllData() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["chats", "metadata"], "readwrite");
    tx.objectStore("chats").clear();
    tx.objectStore("metadata").clear();
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
  });
}

function createMessageBubble(content, sender = "user") {
  const wrapper = document.createElement("div");
  wrapper.classList.add("mb-6", "flex", "items-start", "space-x-3");

  const avatar = document.createElement("div");
  avatar.classList.add(
    "w-10",
    "h-10",
    "rounded-full",
    "flex-shrink-0",
    "flex",
    "items-center",
    "justify-center",
    "font-bold",
    "text-white"
  );

  if (sender === "assistant") {
    avatar.classList.add("bg-gradient-to-br", "from-green-400", "to-green-600");
    avatar.textContent = "A";
  } else {
    avatar.classList.add("bg-gradient-to-br", "from-blue-500", "to-blue-700");
    avatar.textContent = "U";
  }

  const bubble = document.createElement("div");
  bubble.classList.add(
    "max-w-full",
    "md:max-w-2xl",
    "p-3",
    "rounded-lg",
    "whitespace-pre-wrap",
    "leading-relaxed",
    "shadow-sm"
  );

  if (sender === "assistant") {
    bubble.classList.add("bg-gray-200", "text-gray-900");
  } else {
    bubble.classList.add("bg-blue-600", "text-white");
  }

  bubble.textContent = content;

  wrapper.appendChild(avatar);
  wrapper.appendChild(bubble);
  return wrapper;
}

function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function getAssistantResponse(userMessage) {
  // return new Promise((resolve) => {
  //   setTimeout(() => {
  //     resolve("가짜 GPT 응답: " + userMessage);
  //   }, 1500)
  // });
  const mode = apiSelector.value;
  let url;
  let payload;

  if (mode === "assistant") {
    const thread_id = await getMetadata("thread_id");
    payload = { message: userMessage };
    if (thread_id) {
      payload.thread_id = thread_id;
    }
    url = `${BASE_URL}/assistant`;
  } else {
    // Naive mode
    const allMsgs = await getAllMessages();
    const messagesForAPI = [
      { role: "system", content: "You are a helpful assistant." },
      ...allMsgs.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: userMessage },
    ];
    payload = { messages: messagesForAPI };
    url = `${BASE_URL}/chat`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Network response was not ok");
  }

  const data = await response.json();

  if (mode === "assistant" && data.thread_id) {
    const existingThreadId = await getMetadata("thread_id");
    if (!existingThreadId) {
      await saveMetadata("thread_id", data.thread_id);
    }
  }

  return data.reply;
}

messageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = userInput.value.trim();
  if (!message) return;

  chatContainer.appendChild(createMessageBubble(message, "user"));
  await saveMessage("user", message);

  userInput.value = "";
  scrollToBottom();

  try {
    const response = await getAssistantResponse(message);
    chatContainer.appendChild(createMessageBubble(response, "assistant"));
    await saveMessage("assistant", response);
    scrollToBottom();
  } catch (error) {
    console.error("Error fetching assistant response:", error);
    const errMsg = "Error fetching response. Check console.";
    chatContainer.appendChild(createMessageBubble(errMsg, "assistant"));
    await saveMessage("assistant", errMsg);
    scrollToBottom();
  }
});

async function loadExistingMessages() {
  const allMsgs = await getAllMessages();
  for (const msg of allMsgs) {
    chatContainer.appendChild(createMessageBubble(msg.content, msg.role));
  }
  scrollToBottom();
}

newChatBtn.addEventListener("click", async () => {
  // Clear DB data and UI
  await clearAllData();
  chatContainer.innerHTML = "";
  // Now user can start a new chat fresh
});

initDB().then(loadExistingMessages);

console.log(BASE_URL);



// Survey Questions
const surveyQuestions = [
  "질문 1번: 당신의 연령대는 어떻게 됩니까?",
  "질문 2번: 투자하고자 하는 자금의 투자 가능 기간은 얼마나 됩니까?",
  "질문 3번: 다음 중 투자경험과 가장 가까운 것은 어느 것입니까?(중복 가능)",
  "질문 4번: 금융상품 투자에 대한 본인의 지식수준은 어느 정도라고 생각하십니까?",
  "질문 5번: 현재 투자하고자 하는 자금은 전체 금융자산(부동산 등을 제외) 중 어느 정도의 비중을 차지합니까?",
  "질문 6번: 다음 중 당신의 수입원을 가장 잘 나타내고 있는 것은 어느 것입니까?",
  "질문 7번: 만약 투자원금에 손실이 발생할 경우 다음 중 감수할 수 있는 손실 수준은 어느 것입니까?",
];
// Survey Questions
const surveyData = [
  {
    question: "질문 1번: 당신의 연령대는 어떻게 됩니까?",
    options: [
      { text: "19세 이하", value: 12.5 },
      { text: "20세 ~ 40세", value: 12.5 },
      { text: "41세 ~ 50세", value: 9.3 },
      { text: "50세 ~ 60세", value: 6.2 },
      { text: "61세 이상", value: 3.1 },
    ],
  },
  {
    question: "질문 2번: 투자하고자 하는 자금의 투자 가능 기간은 얼마나 됩니까?",
    options: [
      { text: "6개월 이내", value: 3.1 },
      { text: "6개월 이상 ~ 1년 이내", value: 6.2 },
      { text: "1년 이상 ~ 2년 이내", value: 9.3 },
      { text: "2년 이상 ~ 3년 이내", value: 12.5 },
      { text: "3년 이상", value: 15.6 },
    ],
  },
  {
    question: "질문 3번: 다음 중 투자경험과 가장 가까운 것은 어느 것입니까?(중복 가능)",
    options: [
      { text: "은행의 예적금, 국채, 지방채, 보증채, MMF, CMA 등", value: 3.1 },
      { text: "금융채, 신용도가 높은 회사채, 채권형 펀드, 원금보존추구형 ELS 등", value: 6.2 },
      { text: "신용도 중간 등급의 회사채, 원금의 일부만 보장되는 ELS, 혼합형펀드 등", value: 9.3 },
      { text: "신용도가 낮은 회사채, 주식, 원금이 보장되지 않는 ELS, 시장수익률 수준의 수익을 추구하는 주식형펀드 등", value: 12.5 },
      { text: "ELW, 선물옵션, 시장수익률 이상의 수익을 추구하는 주식형펀드, 파생상품에 투자하는 펀드, 주식 신용거래 등", value: 15.6 },
    ],
  },
  {
    question: "질문 4번: 금융상품 투자에 대한 본인의 지식수준은 어느 정도라고 생각하십니까?",
    options: [
      { text: "[매우 낮은 수준] 투자의사 결정을 스스로 내려본 경험이 없는 정도", value: 3.1 },
      { text: "[낮은 수준] 주식과 채권의 차이를 구별할 수 있는 정도", value: 6.2 },
      { text: "[높은 수준] 투자할 수 있는 대부분의 금융상품의 차이를 구별할 수 있는 정도", value: 9.3 },
      { text: "[매우 높은 수준] 금융상품을 비롯하여 모든 투자대상 상품의 차이를 이해할 수 있는 정도", value: 12.5 },
    ],
  },
  {
    question: "질문 5번: 현재 투자하고자 하는 자금은 전체 금융자산(부동산 등을 제외) 중 어느 정도의 비중을 차지합니까?",
    options: [
      { text: "10% 이내", value: 1 },
      { text: "10% 이상 ~ 20% 이내", value: 2 },
      { text: "20% 이상 ~ 30% 이내", value: 3 },
      { text: "30% 이상 ~ 40% 이내", value: 4 },
      { text: "40%", value: 5 },
    ],
  },
  {
    question: "질문 6번: 다음 중 당신의 수입원을 가장 잘 나타내고 있는 것은 어느 것입니까?",
    options: [
      { text: "현재 일정한 수입이 발생하고 있으며, 향후 현재 수준을 유지하거나 증가할 것으로 예상된다.", value: 9.3 },
      { text: "현재 일정한 수입이 발생하고 있으나, 향후 감소하거나 불안정할 것으로 예상된다.", value: 6.2 },
      { text: "현재 일정한 수입이 없으며, 연금이 주수입원이다.", value: 3.1 },
    ],
  },
  {
    question: "질문 7번: 만약 투자원금에 손실이 발생할 경우 다음 중 감수할 수 있는 손실 수준은 어느 것입니까?",
    options: [
      { text: "무슨 일이 있어도 투자원금은 보전되어야 한다.", value: 6.2 },
      { text: "10% 미만까지는 손실을 감수할 수 있을 것 같다.", value: 6.2 },
      { text: "20% 미만까지는 손실을 감수할 수 있을 것 같다.", value: 12.5 },
      { text: "기대수익이 높다면 위험이 높아도 상관하지 않겠다.", value: 18.7 },
    ],
  },
];
let currentQuestionIndex = 0;
let totalScore = 0;
const selectedOptions = new Set();

// Functions
function showQuestion() {
  const currentData = surveyData[currentQuestionIndex];
  surveyQuestion.textContent = currentData.question;
  surveyOptions.innerHTML = ""; // Clear previous options

  // 3번 질문: 중복 선택 허용
  const isMultipleChoice = currentQuestionIndex === 2;

  currentData.options.forEach((option, index) => {
    const button = document.createElement("button");
    button.textContent = option.text;
    button.className = "px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-100 w-full text-left";
    if (isMultipleChoice) {
      button.addEventListener("click", () => {
        if (selectedOptions.has(index)) {
          selectedOptions.delete(index); // 이미 선택된 항목은 제거
          button.classList.remove("bg-blue-100"); // 강조 해제
        } else {
          selectedOptions.add(index); // 새로운 항목 추가
          button.classList.add("bg-blue-100"); // 강조 표시
        }
      });
    } else {
      button.addEventListener("click", () => {
        totalScore += option.value;
        if (currentQuestionIndex < surveyData.length - 1) {
          currentQuestionIndex++;
          showQuestion();
        } else {
          surveySendBtn.disabled = false; // 마지막 질문에서 버튼 활성화
        }
      });
    }
    surveyOptions.appendChild(button);
  });

  // 3번 질문: Next 버튼 제공
  if (isMultipleChoice) {
    const nextButton = document.createElement("button");
    nextButton.textContent = "Next";
    nextButton.className = "mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700";
    nextButton.disabled = true; // 초기에는 선택 필요
    nextButton.addEventListener("click", () => {
      // 선택된 항목의 점수 계산
      selectedOptions.forEach((index) => {
        totalScore += currentData.options[index].value;
      });
      selectedOptions.clear(); // 선택 초기화
      currentQuestionIndex++;
      showQuestion();
    });

    // Next 버튼 활성화 조건
    surveyOptions.addEventListener("click", () => {
      nextButton.disabled = selectedOptions.size === 0; // 선택 항목이 없으면 비활성화
    });

    surveyOptions.appendChild(nextButton);
  }
}

function openSurveyModal() {
  surveyModal.classList.remove("hidden");
  currentQuestionIndex = 0;
  totalScore = 0;
  selectedOptions.clear();
  surveySendBtn.disabled = true;
  surveySendBtn.textContent = "Complete";
  showQuestion();
}

function closeSurveyModal() {
  surveyModal.classList.add("hidden");
  alert(`설문조사가 완료되었습니다! 총 점수: ${totalScore}`);
}

// Event Listener
surveySendBtn.addEventListener("click", () => {
  closeSurveyModal();
});

// Initialize the survey modal on page load
document.addEventListener("DOMContentLoaded", () => {
  openSurveyModal();
});
